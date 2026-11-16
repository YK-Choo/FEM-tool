import type { StructuralNode, StructuralElement, Frame2DElement } from '../types/model.ts';

export type CoordinateSystemDisplay = 'cartesian' | 'polar';

export interface ViewportTransform {
  /** Screen X (in CSS pixels) of the world origin (0, 0) */
  panX: number;
  /** Screen Y (in CSS pixels) of the world origin (0, 0) */
  panY: number;
  /** Pixels per meter (px / m) */
  zoom: number;
  /** Viewport width in CSS pixels */
  width: number;
  /** Viewport height in CSS pixels */
  height: number;
  /** Coordinate overlay mode (Cartesian (x,y) or Polar (r,theta)) */
  coordSystem: CoordinateSystemDisplay;
  /** Origin for polar coordinate overlay in world meters */
  polarOrigin: { x: number; y: number };
}

export const GRID_MINOR_STEP_M = 0.1;
export const GRID_MAJOR_STEP_M = 1.0;

/**
 * Round a floating-point world value to the fixed 0.1 m snapping increment
 * (cleaning up IEEE-754 floating point drift).
 */
export function snapScalarToGrid(val: number, step: number = GRID_MINOR_STEP_M): number {
  const snapped = Math.round(val / step) * step;
  return Number(snapped.toFixed(4));
}

export function snapPointToGrid(
  pt: { x: number; y: number },
  step: number = GRID_MINOR_STEP_M
): { x: number; y: number } {
  return {
    x: snapScalarToGrid(pt.x, step),
    y: snapScalarToGrid(pt.y, step),
  };
}

/**
 * Convert world Cartesian coordinates (x, y in meters, +Y up) to screen CSS pixels (+Y down).
 */
export function worldToScreen(
  worldPt: { x: number; y: number },
  vp: ViewportTransform
): { sx: number; sy: number } {
  return {
    sx: vp.panX + worldPt.x * vp.zoom,
    sy: vp.panY - worldPt.y * vp.zoom,
  };
}

/**
 * Convert screen CSS pixels (sx, sy) to world Cartesian coordinates (x, y in meters, +Y up).
 */
export function screenToWorld(
  sx: number,
  sy: number,
  vp: ViewportTransform
): { x: number; y: number } {
  return {
    x: (sx - vp.panX) / vp.zoom,
    y: (vp.panY - sy) / vp.zoom,
  };
}

/**
 * Polar -> Cartesian converter (x = x0 + r*cos(theta), y = y0 + r*sin(theta))
 * Isolates polar UI input and overlays from the Cartesian FEM solver.
 */
export function polarToCartesian(
  r: number,
  thetaDeg: number,
  origin: { x: number; y: number } = { x: 0, y: 0 }
): { x: number; y: number } {
  const rad = (thetaDeg * Math.PI) / 180;
  return {
    x: Number((origin.x + r * Math.cos(rad)).toFixed(4)),
    y: Number((origin.y + r * Math.sin(rad)).toFixed(4)),
  };
}

/**
 * Cartesian -> Polar converter (r in meters, thetaDeg in [-180, 180] degrees)
 */
export function cartesianToPolar(
  x: number,
  y: number,
  origin: { x: number; y: number } = { x: 0, y: 0 }
): { r: number; thetaDeg: number } {
  const dx = x - origin.x;
  const dy = y - origin.y;
  const r = Math.hypot(dx, dy);
  let thetaDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (thetaDeg < 0) thetaDeg += 360;
  return {
    r: Number(r.toFixed(4)),
    thetaDeg: Number(thetaDeg.toFixed(2)),
  };
}

export interface SnapResult {
  /** World X coordinate (m) */
  x: number;
  /** World Y coordinate (m) */
  y: number;
  /** Screen X (px) */
  sx: number;
  /** Screen Y (px) */
  sy: number;
  /** Type of snap hit */
  kind: 'node' | 'member_segment' | 'grid';
  /** Snapped existing node ID if kind === 'node' */
  nodeId?: string;
  /** Snapped existing member ID if kind === 'member_segment' (for T-junction auto-splitting) */
  splitElementId?: string;
  /** Parametric position t in (0, 1) along splitElementId */
  splitParamT?: number;
}

/**
 * Smart CAD cursor snapping:
 * 1. Snaps to existing nodes within nodeSnapPx (default 15px).
 * 2. Snaps along existing 1D member segments within segmentSnapPx (default 11px),
 *    enabling automatic T-junction member splitting at mid-span connections.
 * 3. Snaps to the 0.1 m Cartesian grid.
 */
export function computeSmartSnap(
  sx: number,
  sy: number,
  vp: ViewportTransform,
  nodes: StructuralNode[],
  elements: StructuralElement[],
  nodeSnapPx: number = 15,
  segmentSnapPx: number = 11
): SnapResult {
  const nodeMap = new Map<string, StructuralNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // 1. Check existing nodes first
  let bestNode: StructuralNode | null = null;
  let bestNodeDist = nodeSnapPx;
  for (const n of nodes) {
    const sc = worldToScreen(n, vp);
    const dist = Math.hypot(sx - sc.sx, sy - sc.sy);
    if (dist <= bestNodeDist) {
      bestNodeDist = dist;
      bestNode = n;
    }
  }

  if (bestNode) {
    const sc = worldToScreen(bestNode, vp);
    return {
      x: bestNode.x,
      y: bestNode.y,
      sx: sc.sx,
      sy: sc.sy,
      kind: 'node',
      nodeId: bestNode.id,
    };
  }

  // 2. Check existing member segments for T-junction mid-span snap
  let bestElem: Frame2DElement | null = null;
  let bestSegDist = segmentSnapPx;
  let bestWorldPt = { x: 0, y: 0 };
  let bestT = 0.5;

  for (const el of elements) {
    if (el.kind !== 'frame2d') continue;
    const ni = nodeMap.get(el.nodeI);
    const nj = nodeMap.get(el.nodeJ);
    if (!ni || !nj) continue;

    const si = worldToScreen(ni, vp);
    const sj = worldToScreen(nj, vp);
    const dx = sj.sx - si.sx;
    const dy = sj.sy - si.sy;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) continue;

    let t = ((sx - si.sx) * dx + (sy - si.sy) * dy) / lenSq;
    // Keep strictly interior to segment (endpoints are handled by node snap)
    if (t <= 0.03 || t >= 0.97) continue;

    const projSx = si.sx + t * dx;
    const projSy = si.sy + t * dy;
    const dist = Math.hypot(sx - projSx, sy - projSy);
    if (dist <= bestSegDist) {
      // Snap t so that distance along member or grid aligns cleanly to 0.1m increments
      const worldLen = Math.hypot(nj.x - ni.x, nj.y - ni.y);
      const rawDistAlong = t * worldLen;
      const snappedDistAlong = Math.min(
        worldLen - GRID_MINOR_STEP_M * 0.5,
        Math.max(GRID_MINOR_STEP_M * 0.5, snapScalarToGrid(rawDistAlong, GRID_MINOR_STEP_M))
      );
      const snappedT = worldLen > 1e-6 ? snappedDistAlong / worldLen : t;
      const wx = Number((ni.x + snappedT * (nj.x - ni.x)).toFixed(4));
      const wy = Number((ni.y + snappedT * (nj.y - ni.y)).toFixed(4));

      // Ensure snapped point isn't identical to start or end node
      if (
        Math.hypot(wx - ni.x, wy - ni.y) > 0.04 &&
        Math.hypot(wx - nj.x, wy - nj.y) > 0.04
      ) {
        bestSegDist = dist;
        bestElem = el;
        bestWorldPt = { x: wx, y: wy };
        bestT = snappedT;
      }
    }
  }

  if (bestElem) {
    const sc = worldToScreen(bestWorldPt, vp);
    return {
      x: bestWorldPt.x,
      y: bestWorldPt.y,
      sx: sc.sx,
      sy: sc.sy,
      kind: 'member_segment',
      splitElementId: bestElem.id,
      splitParamT: bestT,
    };
  }

  // 3. Default: snap to 0.1 m Cartesian grid
  const rawWorld = screenToWorld(sx, sy, vp);
  const gridPt = snapPointToGrid(rawWorld, GRID_MINOR_STEP_M);
  const sc = worldToScreen(gridPt, vp);
  return {
    x: gridPt.x,
    y: gridPt.y,
    sx: sc.sx,
    sy: sc.sy,
    kind: 'grid',
  };
}

/**
 * Compute a balanced ViewportTransform that centers and fits the structural model.
 */
export function fitModelToViewport(
  nodes: StructuralNode[],
  width: number,
  height: number,
  current?: Partial<ViewportTransform>
): ViewportTransform {
  const base: ViewportTransform = {
    panX: width * 0.25,
    panY: height * 0.65,
    zoom: 70,
    width,
    height,
    coordSystem: current?.coordSystem ?? 'cartesian',
    polarOrigin: current?.polarOrigin ?? { x: 0, y: 0 },
  };

  if (nodes.length === 0 || width <= 0 || height <= 0) {
    return base;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }

  const spanX = Math.max(maxX - minX, 3.0);
  const spanY = Math.max(maxY - minY, 2.5);

  const usableW = Math.max(width - 240, width * 0.62);
  const usableH = Math.max(height - 220, height * 0.58);

  const zoom = Math.min(
    180,
    Math.max(24, Math.min(usableW / spanX, usableH / spanY))
  );

  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;

  return {
    ...base,
    zoom,
    panX: width * 0.5 - centerX * zoom,
    panY: height * 0.54 + centerY * zoom,
  };
}
