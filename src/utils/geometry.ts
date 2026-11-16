import type {
  StructuralModel,
  StructuralNode,
  Frame2DElement,
  StructuralLoad,
  SolverOutput,
  ElementSamplePoint,
} from '../types/model.ts';
import { worldToScreen, type ViewportTransform } from './coordinates.ts';
import { restraintsFromSupportPreset } from '../solver/sections.ts';

export interface HoverProbeData {
  element: Frame2DElement;
  station: ElementSamplePoint;
  screenX: number;
  screenY: number;
}

export type CanvasHitTarget =
  | { kind: 'node'; nodeId: string; screenX: number; screenY: number }
  | { kind: 'load'; loadId: string; screenX: number; screenY: number }
  | { kind: 'member'; elementId: string; screenX: number; screenY: number };

/**
 * Generate a clean sequential ID (e.g. N8, M14, L5) not currently in use.
 */
export function nextEntityId(prefix: 'N' | 'M' | 'L', existingIds: string[]): string {
  const used = new Set(existingIds);
  let idx = 1;
  while (used.has(`${prefix}${idx}`)) {
    idx++;
  }
  return `${prefix}${idx}`;
}

/**
 * Split an existing Frame2DElement at parametric coordinate t in (0, 1) (world point (wx, wy)),
 * creating a new intermediate node and two child elements while preserving section, material,
 * outer end hinges, and splitting any member loads accurately across the two segments.
 */
export function splitMemberAtPoint(
  model: StructuralModel,
  elementId: string,
  wx: number,
  wy: number
): { model: StructuralModel; newNodeId: string } {
  const targetEl = model.elements.find(
    (e): e is Frame2DElement => e.kind === 'frame2d' && e.id === elementId
  );
  if (!targetEl) {
    throw new Error(`Element ${elementId} not found for T-junction split.`);
  }

  const nodeI = model.nodes.find((n) => n.id === targetEl.nodeI);
  const nodeJ = model.nodes.find((n) => n.id === targetEl.nodeJ);
  if (!nodeI || !nodeJ) {
    throw new Error(`Endpoints of ${elementId} not found.`);
  }

  // If point is already very close to nodeI or nodeJ, reuse existing endpoint node
  if (Math.hypot(wx - nodeI.x, wy - nodeI.y) < 0.04) {
    return { model, newNodeId: nodeI.id };
  }
  if (Math.hypot(wx - nodeJ.x, wy - nodeJ.y) < 0.04) {
    return { model, newNodeId: nodeJ.id };
  }

  const totalL = Math.hypot(nodeJ.x - nodeI.x, nodeJ.y - nodeI.y);
  const L1 = Math.hypot(wx - nodeI.x, wy - nodeI.y);
  const t = totalL > 1e-6 ? Math.min(0.98, Math.max(0.02, L1 / totalL)) : 0.5;

  const newNodeId = nextEntityId(
    'N',
    model.nodes.map((n) => n.id)
  );
  const newNode: StructuralNode = {
    id: newNodeId,
    label: newNodeId,
    x: wx,
    y: wy,
    z: 0,
    support: 'none',
    restraints: restraintsFromSupportPreset('none'),
    springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
  };

  const existingElIds = model.elements.map((e) => e.id);
  const idA = nextEntityId('M', existingElIds);
  const idB = nextEntityId('M', [...existingElIds, idA]);

  const elA: Frame2DElement = {
    id: idA,
    kind: 'frame2d',
    label: targetEl.label ? `${targetEl.label} (A)` : idA,
    nodeI: targetEl.nodeI,
    nodeJ: newNodeId,
    section: { ...targetEl.section, dimensions: { ...targetEl.section.dimensions } },
    material: { ...targetEl.material },
    releaseStart: targetEl.releaseStart,
    releaseEnd: false, // Continuous across T-junction split unless edited
  };

  const elB: Frame2DElement = {
    id: idB,
    kind: 'frame2d',
    label: targetEl.label ? `${targetEl.label} (B)` : idB,
    nodeI: newNodeId,
    nodeJ: targetEl.nodeJ,
    section: { ...targetEl.section, dimensions: { ...targetEl.section.dimensions } },
    material: { ...targetEl.material },
    releaseStart: false,
    releaseEnd: targetEl.releaseEnd,
  };

  // Remap loads on targetEl to elA and elB
  const updatedLoads: StructuralLoad[] = [];
  const usedLoadIds = model.loads.map((l) => l.id);

  for (const ld of model.loads) {
    if (ld.kind === 'member_distributed' && ld.elementId === elementId) {
      // Interpolate intensity at split point: wMid = w1 + t*(w2 - w1)
      const wMid = Number((ld.w1 + t * (ld.w2 - ld.w1)).toFixed(3));
      const newLoadIdA = nextEntityId('L', usedLoadIds);
      usedLoadIds.push(newLoadIdA);
      const newLoadIdB = nextEntityId('L', usedLoadIds);
      usedLoadIds.push(newLoadIdB);

      updatedLoads.push({
        ...ld,
        id: newLoadIdA,
        elementId: idA,
        w1: ld.w1,
        w2: wMid,
      });
      updatedLoads.push({
        ...ld,
        id: newLoadIdB,
        elementId: idB,
        w1: wMid,
        w2: ld.w2,
      });
    } else if (ld.kind === 'member_point' && ld.elementId === elementId) {
      if (ld.a <= L1) {
        updatedLoads.push({
          ...ld,
          elementId: idA,
          a: Number(Math.min(L1, ld.a).toFixed(3)),
        });
      } else {
        updatedLoads.push({
          ...ld,
          elementId: idB,
          a: Number(Math.max(0, ld.a - L1).toFixed(3)),
        });
      }
    } else {
      updatedLoads.push(ld);
    }
  }

  const nextElements = model.elements.flatMap((e) => (e.id === elementId ? [elA, elB] : [e]));

  return {
    model: {
      ...model,
      nodes: [...model.nodes, newNode],
      elements: nextElements,
      loads: updatedLoads,
    },
    newNodeId,
  };
}

/**
 * Check if a candidate member between nodeI and nodeJ is zero-length or duplicates an existing member.
 */
export function canAddMember(
  model: StructuralModel,
  nodeIId: string,
  nodeJId: string
): { valid: boolean; reason?: string } {
  if (nodeIId === nodeJId) {
    return { valid: false, reason: 'Cannot create a zero-length member on the same node.' };
  }
  const nI = model.nodes.find((n) => n.id === nodeIId);
  const nJ = model.nodes.find((n) => n.id === nodeJId);
  if (!nI || !nJ) {
    return { valid: false, reason: 'Start or end node does not exist.' };
  }
  if (Math.hypot(nJ.x - nI.x, nJ.y - nI.y) < 0.04) {
    return { valid: false, reason: 'Member length must be at least 0.05 m.' };
  }
  for (const el of model.elements) {
    if (el.kind !== 'frame2d') continue;
    if (
      (el.nodeI === nodeIId && el.nodeJ === nodeJId) ||
      (el.nodeI === nodeJId && el.nodeJ === nodeIId)
    ) {
      return { valid: false, reason: 'Duplicate overlapping member between these nodes.' };
    }
  }
  return { valid: true };
}

/**
 * Hit-test the canvas in priority order:
 * 1. Load handles / arrows / labels (so clicking any Load opens the Load editor pop-up)
 * 2. Nodes (so clicking any Node opens the Node editor pop-up)
 * 3. Members (so clicking any Member opens the Member editor pop-up)
 */
export function hitTestCanvas(
  sx: number,
  sy: number,
  vp: ViewportTransform,
  model: StructuralModel,
  loadHandles: Array<{ loadId: string; sx: number; sy: number }>
): CanvasHitTarget | null {
  const nodeMap = new Map<string, StructuralNode>();
  for (const n of model.nodes) nodeMap.set(n.id, n);

  // 1. Check Load interactive handles first (within 15px)
  let bestLoad: { loadId: string; sx: number; sy: number } | null = null;
  let bestLoadDist = 15;
  for (const lh of loadHandles) {
    const d = Math.hypot(sx - lh.sx, sy - lh.sy);
    if (d <= bestLoadDist) {
      bestLoadDist = d;
      bestLoad = lh;
    }
  }
  if (bestLoad) {
    return {
      kind: 'load',
      loadId: bestLoad.loadId,
      screenX: bestLoad.sx,
      screenY: bestLoad.sy,
    };
  }

  // 2. Check Nodes (within 14px)
  let bestNode: StructuralNode | null = null;
  let bestNodeDist = 14;
  let bestNodeScreen = { sx: 0, sy: 0 };
  for (const n of model.nodes) {
    const sc = worldToScreen(n, vp);
    const d = Math.hypot(sx - sc.sx, sy - sc.sy);
    if (d <= bestNodeDist) {
      bestNodeDist = d;
      bestNode = n;
      bestNodeScreen = sc;
    }
  }
  if (bestNode) {
    return {
      kind: 'node',
      nodeId: bestNode.id,
      screenX: bestNodeScreen.sx,
      screenY: bestNodeScreen.sy,
    };
  }

  // 3. Check Members (within 10px of segment)
  let bestEl: Frame2DElement | null = null;
  let bestElDist = 10;
  let bestElProj = { sx: 0, sy: 0 };
  for (const el of model.elements) {
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
    const t = Math.min(1, Math.max(0, ((sx - si.sx) * dx + (sy - si.sy) * dy) / lenSq));
    const px = si.sx + t * dx;
    const py = si.sy + t * dy;
    const d = Math.hypot(sx - px, sy - py);
    if (d <= bestElDist) {
      bestElDist = d;
      bestEl = el;
      bestElProj = { sx: px, sy: py };
    }
  }

  if (bestEl) {
    return {
      kind: 'member',
      elementId: bestEl.id,
      screenX: bestElProj.sx,
      screenY: bestElProj.sy,
    };
  }

  return null;
}

/**
 * Interactive Hover Probe:
 * Find the closest point along any member within hoverRadiusPx and interpolate/lookup
 * the exact station result (x, N(x), V(x), M(x), sigma(x), deflectionMm).
 */
export function probeMemberAtCursor(
  sx: number,
  sy: number,
  vp: ViewportTransform,
  model: StructuralModel,
  solverOutput: SolverOutput,
  hoverRadiusPx: number = 18
): HoverProbeData | null {
  if (!solverOutput.stable) return null;

  const nodeMap = new Map<string, StructuralNode>();
  for (const n of model.nodes) nodeMap.set(n.id, n);

  let bestEl: Frame2DElement | null = null;
  let bestDist = hoverRadiusPx;
  let bestT = 0;

  for (const el of model.elements) {
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

    const t = Math.min(1, Math.max(0, ((sx - si.sx) * dx + (sy - si.sy) * dy) / lenSq));
    const px = si.sx + t * dx;
    const py = si.sy + t * dy;
    const dist = Math.hypot(sx - px, sy - py);
    if (dist <= bestDist) {
      bestDist = dist;
      bestEl = el;
      bestT = t;
    }
  }

  if (!bestEl) return null;
  const elRes = solverOutput.elementResults[bestEl.id];
  if (!elRes || elRes.stations.length === 0) return null;

  const targetX = bestT * elRes.lengthM;
  let closestStation = elRes.stations[0];
  let minDx = Math.abs(closestStation.x - targetX);

  for (const st of elRes.stations) {
    const dx = Math.abs(st.x - targetX);
    if (dx < minDx) {
      minDx = dx;
      closestStation = st;
    }
  }

  const sc = worldToScreen({ x: closestStation.worldX, y: closestStation.worldY }, vp);
  return {
    element: bestEl,
    station: closestStation,
    screenX: sc.sx,
    screenY: sc.sy,
  };
}
