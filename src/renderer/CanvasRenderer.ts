import type {
  StructuralModel,
  StructuralNode,
  Frame2DElement,
  SolverResults,
  SolverOutput,
} from '../types/model.ts';
import {
  worldToScreen,
  screenToWorld,
  cartesianToPolar,
  fitModelToViewport,
  GRID_MINOR_STEP_M,
  GRID_MAJOR_STEP_M,
  type ViewportTransform,
  type SnapResult,
} from '../utils/coordinates.ts';
import type { HoverProbeData } from '../utils/geometry.ts';

export type MomentDiagramSide = 'tension' | 'compression';

export type SnapshotOverlayMode =
  | 'geometry'
  | 'deformed'
  | 'axial'
  | 'shear'
  | 'moment'
  | 'reactions'
  | 'heatmap'
  | 'current';

export interface SnapshotExportOptions {
  model?: StructuralModel;
  solverResults?: SolverResults;
  width?: number;
  height?: number;
  dpr?: number;
  momentSide?: MomentDiagramSide;
  deflectionScale?: number;
  diagramScale?: number;
  preserveViewport?: boolean;
  /** Optional custom canvas factory for headless/server testing environments */
  canvasFactory?: (pixelWidth: number, pixelHeight: number) => HTMLCanvasElement;
}

export interface RenderLayerOptions {
  showGrid: boolean;
  showLoads: boolean;
  showSupports: boolean;
  showDeformed: boolean;
  showAxial: boolean;
  showShear: boolean;
  showMoment: boolean;
  showReactions: boolean;
  showHeatmap: boolean;
  momentSide: MomentDiagramSide;
  deflectionScale: number; // e.g. 1x to 500x
  diagramScale: number;    // e.g. 0.2x to 3.0x
}

export interface CanvasInteractionState {
  activeTool: 'select' | 'draw_member' | 'assign_support' | 'add_nodal_load' | 'add_member_load' | 'delete';
  selectedNodeId: string | null;
  selectedElementId: string | null;
  selectedLoadId: string | null;
  hoveredElementId: string | null;
  snapTarget: SnapResult | null;
  drawStartPoint: { x: number; y: number; nodeId?: string; splitElementId?: string } | null;
  hoverProbe: HoverProbeData | null;
}

export interface LoadScreenHandle {
  loadId: string;
  sx: number;
  sy: number;
}

/**
 * Interpolate emerald (#059669) -> amber (#d97706) -> crimson (#dc2626) utilization color
 * tuned for high contrast on a pure white (#ffffff) background.
 */
export function utilizationToColor(eta: number, alpha = 1): string {
  const t = Math.max(0, Math.min(1.25, eta));
  let r = 5;
  let g = 150;
  let b = 105;

  if (t <= 0.5) {
    // Emerald (#059669) -> Amber (#d97706)
    const u = t / 0.5;
    r = Math.round(5 + u * (217 - 5));
    g = Math.round(150 + u * (119 - 150));
    b = Math.round(105 + u * (6 - 105));
  } else if (t <= 1.0) {
    // Amber (#d97706) -> Crimson (#dc2626)
    const u = (t - 0.5) / 0.5;
    r = Math.round(217 + u * (220 - 217));
    g = Math.round(119 + u * (38 - 119));
    b = Math.round(6 + u * (38 - 6));
  } else {
    // Overstressed (> 1.0): deep crimson (#b91c1c)
    r = 185;
    g = 28;
    b = 28;
  }

  return alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgb(${r}, ${g}, ${b})`;
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  dirX: number,
  dirY: number,
  size: number = 8
): void {
  const len = Math.hypot(dirX, dirY);
  if (len < 1e-6) return;
  const ux = dirX / len;
  const uy = dirY / len;
  const px = -uy;
  const py = ux;

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - ux * size + px * (size * 0.52), tipY - uy * size + py * (size * 0.52));
  ctx.lineTo(tipX - ux * size - px * (size * 0.52), tipY - uy * size - py * (size * 0.52));
  ctx.closePath();
  ctx.fill();
}

function drawRoundedBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  bgColor: string = 'rgba(255, 255, 255, 0.92)',
  borderColor: string = '#cbd5e1',
  textColor: string = '#0f172a',
  font = '600 11px "JetBrains Mono", ui-monospace, monospace'
): void {
  ctx.save();
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const padX = 6;
  const w = metrics.width + padX * 2;
  const h = 19;
  const x = cx - w * 0.5;
  const y = cy - h * 0.5;
  const r = 4;

  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.2;

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 0.5);
  ctx.restore();
}

/**
 * Build a clean RenderLayerOptions configuration for a given report snapshot overlay mode.
 */
export function buildSnapshotLayers(
  overlayMode: SnapshotOverlayMode,
  baseLayers?: Partial<RenderLayerOptions>
): RenderLayerOptions {
  const defScale = baseLayers?.deflectionScale ?? 120;
  const diagScale = baseLayers?.diagramScale ?? 1.0;
  const mSide = baseLayers?.momentSide ?? 'tension';

  if (overlayMode === 'current' && baseLayers) {
    return {
      showGrid: baseLayers.showGrid ?? true,
      showLoads: baseLayers.showLoads ?? true,
      showSupports: baseLayers.showSupports ?? true,
      showDeformed: baseLayers.showDeformed ?? true,
      showAxial: baseLayers.showAxial ?? false,
      showShear: baseLayers.showShear ?? false,
      showMoment: baseLayers.showMoment ?? true,
      showReactions: baseLayers.showReactions ?? true,
      showHeatmap: baseLayers.showHeatmap ?? false,
      momentSide: mSide,
      deflectionScale: defScale,
      diagramScale: diagScale,
    };
  }

  return {
    showGrid: true,
    showLoads: overlayMode === 'geometry' || overlayMode === 'reactions',
    showSupports: true,
    showDeformed: overlayMode === 'deformed' || overlayMode === 'heatmap',
    showAxial: overlayMode === 'axial',
    showShear: overlayMode === 'shear',
    showMoment: overlayMode === 'moment',
    showReactions: overlayMode === 'reactions' || overlayMode === 'deformed',
    showHeatmap: overlayMode === 'heatmap',
    momentSide: mSide,
    deflectionScale: defScale,
    diagramScale: diagScale,
  };
}

/**
 * Dedicated HTML5 Canvas Renderer for 2D Structural FEM Analysis.
 * Returns interactive load screen handles for canvas hit-testing and exposes
 * `exportViewSnapshot(overlayMode)` for programmatic high-DPI report image generation.
 */
export class CanvasRenderer {
  private lastViewport: ViewportTransform | null = null;
  private lastModel: StructuralModel | null = null;
  private lastSolverOutput: SolverResults | null = null;
  private lastLayers: RenderLayerOptions | null = null;

  /**
   * Programmatically render an offscreen high-DPI PNG data URL of the structure for
   * HTML/PDF calculation reports (`overlayMode`: 'geometry' | 'deformed' | 'axial' | 'shear' | 'moment' | 'reactions' | 'heatmap' | 'current').
   */
  public exportViewSnapshot(
    overlayMode: SnapshotOverlayMode = 'current',
    options?: SnapshotExportOptions
  ): string {
    const model = options?.model ?? this.lastModel;
    const solverResults = options?.solverResults ?? this.lastSolverOutput;
    if (!model || !solverResults) {
      throw new Error(
        'CanvasRenderer.exportViewSnapshot requires an active model and solverResults (either rendered previously or passed in options).'
      );
    }

    const cssWidth = options?.width ?? this.lastViewport?.width ?? 1280;
    const cssHeight = options?.height ?? this.lastViewport?.height ?? 800;
    const dpr = options?.dpr ?? 2;
    const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr));

    const offscreenCanvas: HTMLCanvasElement = options?.canvasFactory
      ? options.canvasFactory(pixelWidth, pixelHeight)
      : document.createElement('canvas');
    offscreenCanvas.width = pixelWidth;
    offscreenCanvas.height = pixelHeight;

    const ctx = offscreenCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to acquire 2D rendering context for snapshot export.');
    }

    const vp: ViewportTransform =
      options?.preserveViewport && this.lastViewport
        ? { ...this.lastViewport, width: cssWidth, height: cssHeight }
        : fitModelToViewport(model.nodes, cssWidth, cssHeight, this.lastViewport ?? undefined);

    const snapshotLayers = buildSnapshotLayers(overlayMode, {
      ...this.lastLayers,
      momentSide: options?.momentSide ?? this.lastLayers?.momentSide ?? 'tension',
      deflectionScale: options?.deflectionScale ?? this.lastLayers?.deflectionScale ?? 120,
      diagramScale: options?.diagramScale ?? this.lastLayers?.diagramScale ?? 1.0,
    });

    const neutralInteraction: CanvasInteractionState = {
      activeTool: 'select',
      selectedNodeId: null,
      selectedElementId: null,
      selectedLoadId: null,
      hoveredElementId: null,
      snapTarget: null,
      drawStartPoint: null,
      hoverProbe: null,
    };

    ctx.save();
    ctx.scale(dpr, dpr);
    this.render(ctx, vp, model, solverResults, snapshotLayers, neutralInteraction);

    // Draw clean report caption stamp in top-left corner on white pill background
    const modeLabelMap: Record<SnapshotOverlayMode, string> = {
      geometry: 'Structural Geometry & Applied Loading',
      deformed: `Deformed Shape (${snapshotLayers.deflectionScale}× Exaggeration) · Max |δ| = ${solverResults.globalMaxDeflectionMm.toFixed(2)} mm`,
      axial: `Axial Force Diagram N(x) · Max |N| = ${solverResults.globalMaxN.toFixed(2)} kN`,
      shear: `Shear Force Diagram V(x) · Max |V| = ${solverResults.globalMaxV.toFixed(2)} kN`,
      moment: `Bending Moment Diagram M(x) (${snapshotLayers.momentSide === 'tension' ? 'Tension Face' : 'Compression Face'}) · Max |M| = ${solverResults.globalMaxM.toFixed(2)} kNm`,
      reactions: `Support & Spring Reactions · ΣRx = ${solverResults.reactionSum.sumRx.toFixed(1)} kN, ΣRy = ${solverResults.reactionSum.sumRy.toFixed(1)} kN`,
      heatmap: `Stress Utilization Heatmap (σ_max / fy) · Max η = ${(solverResults.globalMaxUtilization * 100).toFixed(1)}%`,
      current: `${model.name} — Analysis View`,
    };

    drawRoundedBadge(
      ctx,
      `${model.name} · ${modeLabelMap[overlayMode]}`,
      Math.min(cssWidth * 0.5, 290),
      24,
      'rgba(255, 255, 255, 0.94)',
      '#2563eb',
      '#0f172a',
      '600 11px "JetBrains Mono", ui-monospace, monospace'
    );
    ctx.restore();

    return typeof offscreenCanvas.toDataURL === 'function'
      ? offscreenCanvas.toDataURL('image/png')
      : '';
  }

  public render(
    ctx: CanvasRenderingContext2D,
    vp: ViewportTransform,
    model: StructuralModel,
    solverOutput: SolverOutput,
    layers: RenderLayerOptions,
    interaction: CanvasInteractionState
  ): LoadScreenHandle[] {
    this.lastViewport = vp;
    this.lastModel = model;
    this.lastSolverOutput = solverOutput;
    this.lastLayers = layers;
    const { width, height } = vp;
    const loadHandles: LoadScreenHandle[] = [];

    ctx.save();
    // Clear canvas with pure white (#ffffff) engineering drafting background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const nodeMap = new Map<string, StructuralNode>();
    for (const n of model.nodes) nodeMap.set(n.id, n);

    // 1. Render Cartesian Grid (+ Polar Overlay if enabled)
    if (layers.showGrid) {
      this.renderGrid(ctx, vp);
    }

    // 2. Render Internal Force Diagrams (N, V, M) underneath/around members
    if (solverOutput.stable) {
      if (layers.showAxial) {
        this.renderForceDiagram(ctx, vp, model, solverOutput, 'N', layers);
      }
      if (layers.showShear) {
        this.renderForceDiagram(ctx, vp, model, solverOutput, 'V', layers);
      }
      if (layers.showMoment) {
        this.renderForceDiagram(ctx, vp, model, solverOutput, 'M', layers);
      }
    }

    // 3. Render Undeformed Structural Members (with proportional depth & heatmap if active)
    this.renderMembers(ctx, vp, model, solverOutput, layers, interaction, nodeMap);

    // 4. Render Supports & Elastic Springs (Fixed, Pinned, Rollers, Inclined Roller, kx, ky, krz)
    if (layers.showSupports) {
      this.renderSupportsAndSprings(ctx, vp, model);
    }

    // 5. Render Applied Loads (Distributed Trapezoidal/UDL, Member Point, Nodal Loads)
    if (layers.showLoads) {
      this.renderLoads(ctx, vp, model, interaction, nodeMap, loadHandles);
    }

    // 6. Render Deformed Shape (Hermite cubic + 5th-order local deflection)
    if (solverOutput.stable && layers.showDeformed) {
      this.renderDeformedShape(ctx, vp, model, solverOutput, layers);
    }

    // 7. Render Support & Spring Reaction Vectors
    if (solverOutput.stable && layers.showReactions) {
      this.renderSupportReactions(ctx, vp, model, solverOutput);
    }

    // 8. Render Structural Nodes & Selection Halos
    this.renderNodes(ctx, vp, model, interaction);

    // 9. Render Interactive CAD Drawing Preview, Smart Snap Indicator & Hover Probe Marker
    this.renderInteractiveOverlays(ctx, vp, interaction);

    ctx.restore();
    return loadHandles;
  }

  private renderGrid(ctx: CanvasRenderingContext2D, vp: ViewportTransform): void {
    const topLeft = screenToWorld(0, 0, vp);
    const botRight = screenToWorld(vp.width, vp.height, vp);

    const minX = Math.floor(Math.min(topLeft.x, botRight.x) - 1);
    const maxX = Math.ceil(Math.max(topLeft.x, botRight.x) + 1);
    const minY = Math.floor(Math.min(topLeft.y, botRight.y) - 1);
    const maxY = Math.ceil(Math.max(topLeft.y, botRight.y) + 1);

    // Minor 0.1 m grid lines in crisp light-drafting gray (#f1f5f9)
    if (vp.zoom >= 36) {
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      ctx.beginPath();

      const startMinorX = Math.floor(minX / GRID_MINOR_STEP_M) * GRID_MINOR_STEP_M;
      for (let x = startMinorX; x <= maxX; x += GRID_MINOR_STEP_M) {
        if (Math.abs(Math.round(x) - x) < 1e-4) continue;
        const sx = Math.round(vp.panX + x * vp.zoom) + 0.5;
        if (sx >= 0 && sx <= vp.width) {
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, vp.height);
        }
      }

      const startMinorY = Math.floor(minY / GRID_MINOR_STEP_M) * GRID_MINOR_STEP_M;
      for (let y = startMinorY; y <= maxY; y += GRID_MINOR_STEP_M) {
        if (Math.abs(Math.round(y) - y) < 1e-4) continue;
        const sy = Math.round(vp.panY - y * vp.zoom) + 0.5;
        if (sy >= 0 && sy <= vp.height) {
          ctx.moveTo(0, sy);
          ctx.lineTo(vp.width, sy);
        }
      }
      ctx.stroke();
    }

    // Major 1.0 m grid lines in #cbd5e1
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = minX; x <= maxX; x += GRID_MAJOR_STEP_M) {
      const sx = Math.round(vp.panX + x * vp.zoom) + 0.5;
      if (sx >= 0 && sx <= vp.width) {
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, vp.height);
      }
    }
    for (let y = minY; y <= maxY; y += GRID_MAJOR_STEP_M) {
      const sy = Math.round(vp.panY - y * vp.zoom) + 0.5;
      if (sy >= 0 && sy <= vp.height) {
        ctx.moveTo(0, sy);
        ctx.lineTo(vp.width, sy);
      }
    }
    ctx.stroke();

    // Optional Polar (r, theta) Coordinate Overlay (future-proofed coordinate layer)
    if (vp.coordSystem === 'polar') {
      const origScreen = worldToScreen(vp.polarOrigin, vp);
      ctx.save();
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.22)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      const maxR = Math.ceil(Math.hypot(maxX - minX, maxY - minY));
      for (let r = 1; r <= maxR; r += 1) {
        ctx.beginPath();
        ctx.arc(origScreen.sx, origScreen.sy, r * vp.zoom, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let deg = 0; deg < 360; deg += 30) {
        const rad = (deg * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(origScreen.sx, origScreen.sy);
        ctx.lineTo(
          origScreen.sx + Math.cos(rad) * maxR * vp.zoom,
          origScreen.sy - Math.sin(rad) * maxR * vp.zoom
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    // World Coordinate Axes X = 0 and Y = 0 in #64748b
    const origin = worldToScreen({ x: 0, y: 0 }, vp);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (origin.sx >= 0 && origin.sx <= vp.width) {
      ctx.moveTo(origin.sx, 0);
      ctx.lineTo(origin.sx, vp.height);
    }
    if (origin.sy >= 0 && origin.sy <= vp.height) {
      ctx.moveTo(0, origin.sy);
      ctx.lineTo(vp.width, origin.sy);
    }
    ctx.stroke();

    // Meter coordinate tick labels along major grid lines in dark #334155 with subtle white halo
    ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillStyle = '#334155';
    const labelStep = vp.zoom < 38 ? 2 : 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const axisY = Math.min(vp.height - 20, Math.max(8, origin.sy + 5));
    for (let x = minX; x <= maxX; x += labelStep) {
      const sx = vp.panX + x * vp.zoom;
      if (sx > 30 && sx < vp.width - 30) {
        const txt = `${x}m`;
        ctx.strokeText(txt, sx, axisY);
        ctx.fillText(txt, sx, axisY);
      }
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const axisX = Math.min(vp.width - 38, Math.max(8, origin.sx + 6));
    for (let y = minY; y <= maxY; y += labelStep) {
      if (y === 0) continue;
      const sy = vp.panY - y * vp.zoom;
      if (sy > 24 && sy < vp.height - 24) {
        const txt = `${y}m`;
        ctx.strokeText(txt, axisX, sy);
        ctx.fillText(txt, axisX, sy);
      }
    }
  }

  private renderMembers(
    ctx: CanvasRenderingContext2D,
    vp: ViewportTransform,
    model: StructuralModel,
    solverOutput: SolverOutput,
    layers: RenderLayerOptions,
    interaction: CanvasInteractionState,
    nodeMap: Map<string, StructuralNode>
  ): void {
    for (const el of model.elements) {
      if (el.kind !== 'frame2d') continue;
      const ni = nodeMap.get(el.nodeI);
      const nj = nodeMap.get(el.nodeJ);
      if (!ni || !nj) continue;

      const si = worldToScreen(ni, vp);
      const sj = worldToScreen(nj, vp);

      // Proportional stroke width based on cross-section depth (depthMm in mm)
      const depthMm = el.section.depthMm ?? 300;
      const baseThickness = Math.min(12, Math.max(3.2, 2.4 + (depthMm / 1000) * 12));

      const isSelected = interaction.selectedElementId === el.id;
      const isHovered = interaction.hoveredElementId === el.id;

      // Selection / hover outer halo
      if (isSelected || isHovered) {
        ctx.save();
        ctx.strokeStyle = isSelected ? 'rgba(37, 99, 235, 0.25)' : 'rgba(100, 116, 139, 0.22)';
        ctx.lineWidth = baseThickness + 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(si.sx, si.sy);
        ctx.lineTo(sj.sx, sj.sy);
        ctx.stroke();
        ctx.restore();
      }

      const elRes = solverOutput.elementResults[el.id];

      if (layers.showHeatmap && solverOutput.stable && elRes && elRes.stations.length > 1) {
        // Render smooth Stress Utilization Heatmap segments along the member
        ctx.save();
        ctx.lineWidth = baseThickness + 1.5;
        ctx.lineCap = 'butt';
        for (let k = 0; k < elRes.stations.length - 1; k++) {
          const stA = elRes.stations[k];
          const stB = elRes.stations[k + 1];
          const pA = worldToScreen({ x: stA.worldX, y: stA.worldY }, vp);
          const pB = worldToScreen({ x: stB.worldX, y: stB.worldY }, vp);
          if (Math.hypot(pB.sx - pA.sx, pB.sy - pA.sy) < 0.2) continue;

          const avgEta = 0.5 * (stA.utilization + stB.utilization);
          ctx.strokeStyle = utilizationToColor(avgEta);
          ctx.beginPath();
          ctx.moveTo(pA.sx, pA.sy);
          ctx.lineTo(pB.sx, pB.sy);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        // Undeformed members in dark slate (#1e293b); selected members in vivid royal blue (#2563eb)
        let strokeColor = '#1e293b';
        if (el.material.preset === 'concrete') strokeColor = '#475569';
        if (el.material.preset === 'timber') strokeColor = '#b45309';
        if (isSelected) strokeColor = '#2563eb';

        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = baseThickness;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(si.sx, si.sy);
        ctx.lineTo(sj.sx, sj.sy);
        ctx.stroke();

        // Subtle inner web highlight for depth
        if (baseThickness >= 5.5) {
          ctx.strokeStyle = isSelected ? 'rgba(219, 234, 254, 0.45)' : 'rgba(241, 245, 249, 0.35)';
          ctx.lineWidth = Math.max(1.2, baseThickness - 3.6);
          ctx.beginPath();
          ctx.moveTo(si.sx, si.sy);
          ctx.lineTo(sj.sx, sj.sy);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Render member end hinges (open circles with white fill offset 12px inward from member start/end)
      const dx = sj.sx - si.sx;
      const dy = sj.sy - si.sy;
      const screenLen = Math.hypot(dx, dy);
      if (screenLen > 28) {
        const ux = dx / screenLen;
        const uy = dy / screenLen;
        const hingeOffset = 12;
        const hingeRadius = 4.8;

        if (el.releaseStart) {
          const hx = si.sx + ux * hingeOffset;
          const hy = si.sy + uy * hingeOffset;
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(hx, hy, hingeRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }

        if (el.releaseEnd) {
          const hx = sj.sx - ux * hingeOffset;
          const hy = sj.sy - uy * hingeOffset;
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(hx, hy, hingeRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      // Render member ID / utilization badge at midpoint if heatmap is active or member is selected
      if (screenLen > 55) {
        const midX = (si.sx + sj.sx) * 0.5;
        const midY = (si.sy + sj.sy) * 0.5;
        const nx = -dy / screenLen;
        const ny = dx / screenLen;

        if (layers.showHeatmap && solverOutput.stable && elRes) {
          const pct = (elRes.maxUtilization * 100).toFixed(0);
          const uCol = utilizationToColor(elRes.maxUtilization);
          drawRoundedBadge(
            ctx,
            `${el.id}: ${pct}% (${elRes.maxSigmaMpa.toFixed(1)} MPa)`,
            midX + nx * 16,
            midY + ny * 16,
            'rgba(255, 255, 255, 0.92)',
            uCol,
            uCol,
            '600 10px "JetBrains Mono", ui-monospace, monospace'
          );
        } else if (isSelected) {
          drawRoundedBadge(
            ctx,
            `${el.id} · ${el.section.name}`,
            midX + nx * 16,
            midY + ny * 16,
            'rgba(255, 255, 255, 0.94)',
            '#2563eb',
            '#1d4ed8',
            '600 10px "JetBrains Mono", ui-monospace, monospace'
          );
        }
      }
    }
  }

  private renderSupportsAndSprings(
    ctx: CanvasRenderingContext2D,
    vp: ViewportTransform,
    model: StructuralModel
  ): void {
    for (const node of model.nodes) {
      const sc = worldToScreen(node, vp);

      // 1. Render Nodal Restraint Support Symbols in deep teal/slate (#0f766e / #334155)
      if (node.support !== 'none') {
        ctx.save();
        ctx.translate(sc.sx, sc.sy);

        let rotRad = 0;
        if (node.support === 'rollerY') {
          rotRad = -Math.PI / 2;
        } else if (node.support === 'inclinedRoller') {
          rotRad = -((node.inclinedAngleDeg ?? 0) * Math.PI) / 180;
        }
        ctx.rotate(rotRad);

        ctx.strokeStyle = '#0f766e'; // Deep teal support symbol
        ctx.fillStyle = 'rgba(15, 118, 110, 0.14)';
        ctx.lineWidth = 1.9;

        if (node.support === 'fixed') {
          // Fixed support block & hatches
          ctx.beginPath();
          ctx.moveTo(-14, 4);
          ctx.lineTo(14, 4);
          ctx.stroke();

          ctx.fillStyle = 'rgba(15, 118, 110, 0.18)';
          ctx.fillRect(-10, -4, 20, 8);
          ctx.strokeRect(-10, -4, 20, 8);

          // Ground hatches in slate #334155
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.4;
          for (let hx = -12; hx <= 12; hx += 6) {
            ctx.beginPath();
            ctx.moveTo(hx, 4);
            ctx.lineTo(hx - 4, 11);
            ctx.stroke();
          }
        } else if (node.support === 'pinned') {
          // Pinned triangle
          ctx.beginPath();
          ctx.moveTo(0, 2);
          ctx.lineTo(-11, 17);
          ctx.lineTo(11, 17);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Ground line & hatches
          ctx.strokeStyle = '#334155';
          ctx.beginPath();
          ctx.moveTo(-15, 17);
          ctx.lineTo(15, 17);
          ctx.stroke();
          ctx.lineWidth = 1.3;
          for (let hx = -12; hx <= 12; hx += 6) {
            ctx.beginPath();
            ctx.moveTo(hx, 17);
            ctx.lineTo(hx - 4, 23);
            ctx.stroke();
          }
        } else if (
          node.support === 'rollerX' ||
          node.support === 'rollerY' ||
          node.support === 'inclinedRoller'
        ) {
          // Triangle + rollers + ground line
          ctx.beginPath();
          ctx.moveTo(0, 2);
          ctx.lineTo(-10, 14);
          ctx.lineTo(10, 14);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Two roller wheels
          ctx.beginPath();
          ctx.arc(-5, 17.5, 2.8, 0, Math.PI * 2);
          ctx.arc(5, 17.5, 2.8, 0, Math.PI * 2);
          ctx.stroke();

          // Ground line in #334155
          ctx.strokeStyle = '#334155';
          ctx.beginPath();
          ctx.moveTo(-14, 21);
          ctx.lineTo(14, 21);
          ctx.stroke();

          if (node.support === 'inclinedRoller') {
            ctx.fillStyle = '#0f766e';
            ctx.font = '600 9.5px "JetBrains Mono", ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`α=${node.inclinedAngleDeg ?? 0}°`, 0, 31);
          }
        }

        ctx.restore();
      }

      // 2. Render Elastic Springs (kx, ky, krz) in rich purple (#7c3aed)
      const { kx, ky, krz } = node.springs;

      if (ky > 0) {
        ctx.save();
        ctx.strokeStyle = '#7c3aed';
        ctx.lineWidth = 1.8;
        const startY = sc.sy + (node.support !== 'none' ? 22 : 4);
        ctx.beginPath();
        ctx.moveTo(sc.sx, startY);
        ctx.lineTo(sc.sx, startY + 4);
        const coils = 4;
        const coilH = 3.5;
        for (let c = 0; c < coils; c++) {
          const y0 = startY + 4 + c * coilH * 2;
          ctx.lineTo(sc.sx - 6, y0 + coilH * 0.5);
          ctx.lineTo(sc.sx + 6, y0 + coilH * 1.5);
          ctx.lineTo(sc.sx, y0 + coilH * 2);
        }
        const baseY = startY + 4 + coils * coilH * 2 + 3;
        ctx.lineTo(sc.sx, baseY);
        ctx.moveTo(sc.sx - 9, baseY);
        ctx.lineTo(sc.sx + 9, baseY);
        ctx.stroke();
        ctx.restore();
      }

      if (kx > 0) {
        ctx.save();
        ctx.strokeStyle = '#7c3aed';
        ctx.lineWidth = 1.8;
        const startX = sc.sx - 4;
        ctx.beginPath();
        ctx.moveTo(startX, sc.sy);
        ctx.lineTo(startX - 4, sc.sy);
        const coils = 3;
        const coilW = 3.5;
        for (let c = 0; c < coils; c++) {
          const x0 = startX - 4 - c * coilW * 2;
          ctx.lineTo(x0 - coilW * 0.5, sc.sy - 5);
          ctx.lineTo(x0 - coilW * 1.5, sc.sy + 5);
          ctx.lineTo(x0 - coilW * 2, sc.sy);
        }
        const baseX = startX - 4 - coils * coilW * 2 - 3;
        ctx.lineTo(baseX, sc.sy);
        ctx.moveTo(baseX, sc.sy - 7);
        ctx.lineTo(baseX, sc.sy + 7);
        ctx.stroke();
        ctx.restore();
      }

      if (krz > 0) {
        ctx.save();
        ctx.strokeStyle = '#7c3aed';
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        const turns = 1.65;
        const steps = 28;
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const ang = u * turns * Math.PI * 2;
          const r = 4 + u * 9;
          const px = sc.sx + r * Math.cos(ang);
          const py = sc.sy + r * Math.sin(ang);
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        drawRoundedBadge(
          ctx,
          `kθ=${(krz / 1000).toFixed(1)}k`,
          sc.sx,
          sc.sy - 20,
          'rgba(255, 255, 255, 0.92)',
          '#7c3aed',
          '#6d28d9',
          '600 9.5px "JetBrains Mono", ui-monospace, monospace'
        );
        ctx.restore();
      }
    }
  }

  private renderLoads(
    ctx: CanvasRenderingContext2D,
    vp: ViewportTransform,
    model: StructuralModel,
    interaction: CanvasInteractionState,
    nodeMap: Map<string, StructuralNode>,
    loadHandles: LoadScreenHandle[]
  ): void {
    let maxDist = 10;
    let maxPoint = 10;

    for (const ld of model.loads) {
      if (ld.kind === 'member_distributed') {
        maxDist = Math.max(maxDist, Math.abs(ld.w1), Math.abs(ld.w2));
      } else if (ld.kind === 'member_point') {
        maxPoint = Math.max(maxPoint, Math.abs(ld.p));
      } else if (ld.kind === 'nodal') {
        maxPoint = Math.max(maxPoint, Math.hypot(ld.fx, ld.fy));
      }
    }

    for (const ld of model.loads) {
      const isSelected = interaction.selectedLoadId === ld.id;
      const strokeCol = isSelected ? '#2563eb' : '#d97706';
      const fillCol = isSelected ? 'rgba(37, 99, 235, 0.14)' : 'rgba(217, 119, 6, 0.14)';
      const textCol = isSelected ? '#1d4ed8' : '#b45309';

      if (ld.kind === 'member_distributed') {
        const el = model.elements.find(
          (e): e is Frame2DElement => e.kind === 'frame2d' && e.id === ld.elementId
        );
        if (!el) continue;
        const ni = nodeMap.get(el.nodeI);
        const nj = nodeMap.get(el.nodeJ);
        if (!ni || !nj) continue;

        const si = worldToScreen(ni, vp);
        const sj = worldToScreen(nj, vp);

        const L = Math.hypot(nj.x - ni.x, nj.y - ni.y);
        if (L < 1e-6) continue;
        const cos = (nj.x - ni.x) / L;
        const sin = (nj.y - ni.y) / L;

        let fDirWorldX = 0;
        let fDirWorldY = 0;
        if (ld.direction === 'global_x') {
          fDirWorldX = 1;
          fDirWorldY = 0;
        } else if (ld.direction === 'global_y') {
          fDirWorldX = 0;
          fDirWorldY = 1;
        } else {
          fDirWorldX = -sin;
          fDirWorldY = cos;
        }

        const fDirScreenX = fDirWorldX;
        const fDirScreenY = -fDirWorldY;

        const maxEnvPx = 46;
        const h1 = (ld.w1 / maxDist) * maxEnvPx;
        const h2 = (ld.w2 / maxDist) * maxEnvPx;

        const tail1X = si.sx - fDirScreenX * h1;
        const tail1Y = si.sy - fDirScreenY * h1;
        const tail2X = sj.sx - fDirScreenX * h2;
        const tail2Y = sj.sy - fDirScreenY * h2;

        ctx.save();
        ctx.fillStyle = fillCol;
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = isSelected ? 2.2 : 1.6;

        ctx.beginPath();
        ctx.moveTo(si.sx, si.sy);
        ctx.lineTo(tail1X, tail1Y);
        ctx.lineTo(tail2X, tail2Y);
        ctx.lineTo(sj.sx, sj.sy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const screenSpan = Math.hypot(sj.sx - si.sx, sj.sy - si.sy);
        const numArrows = Math.max(3, Math.min(12, Math.floor(screenSpan / 28)));
        ctx.fillStyle = strokeCol;

        for (let k = 0; k <= numArrows; k++) {
          const u = k / numArrows;
          const bx = si.sx + u * (sj.sx - si.sx);
          const by = si.sy + u * (sj.sy - si.sy);
          const tx = tail1X + u * (tail2X - tail1X);
          const ty = tail1Y + u * (tail2Y - tail1Y);
          const arrowLen = Math.hypot(bx - tx, by - ty);
          if (arrowLen < 4) continue;

          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(bx, by);
          ctx.stroke();

          drawArrowhead(ctx, bx, by, bx - tx, by - ty, Math.min(7, arrowLen * 0.6));
        }

        const handleX = 0.5 * (tail1X + tail2X);
        const handleY = 0.5 * (tail1Y + tail2Y);
        loadHandles.push({ loadId: ld.id, sx: handleX, sy: handleY });

        const labelText =
          Math.abs(ld.w1 - ld.w2) < 0.05
            ? `${Math.abs(ld.w1).toFixed(1)} kN/m`
            : `${Math.abs(ld.w1).toFixed(0)}→${Math.abs(ld.w2).toFixed(0)} kN/m`;

        drawRoundedBadge(
          ctx,
          labelText,
          handleX,
          handleY,
          'rgba(255, 255, 255, 0.92)',
          strokeCol,
          textCol,
          '600 10px "JetBrains Mono", ui-monospace, monospace'
        );

        ctx.restore();
      } else if (ld.kind === 'member_point') {
        const el = model.elements.find(
          (e): e is Frame2DElement => e.kind === 'frame2d' && e.id === ld.elementId
        );
        if (!el) continue;
        const ni = nodeMap.get(el.nodeI);
        const nj = nodeMap.get(el.nodeJ);
        if (!ni || !nj) continue;

        const L = Math.hypot(nj.x - ni.x, nj.y - ni.y);
        if (L < 1e-6) continue;
        const t = Math.min(1, Math.max(0, ld.a / L));
        const wx = ni.x + t * (nj.x - ni.x);
        const wy = ni.y + t * (nj.y - ni.y);
        const tip = worldToScreen({ x: wx, y: wy }, vp);

        const cos = (nj.x - ni.x) / L;
        const sin = (nj.y - ni.y) / L;

        let fDirWorldX = 0;
        let fDirWorldY = 0;
        if (ld.direction === 'global_x') {
          fDirWorldX = Math.sign(ld.p) || 1;
        } else if (ld.direction === 'global_y') {
          fDirWorldY = Math.sign(ld.p) || -1;
        } else {
          const sgn = Math.sign(ld.p) || -1;
          fDirWorldX = -sin * sgn;
          fDirWorldY = cos * sgn;
        }

        const dirSx = fDirWorldX;
        const dirSy = -fDirWorldY;
        const arrowLen = Math.max(30, Math.min(58, 26 + (Math.abs(ld.p) / maxPoint) * 28));

        const tailX = tip.sx - dirSx * arrowLen;
        const tailY = tip.sy - dirSy * arrowLen;

        ctx.save();
        ctx.strokeStyle = strokeCol;
        ctx.fillStyle = strokeCol;
        ctx.lineWidth = isSelected ? 3 : 2.4;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(tip.sx, tip.sy);
        ctx.stroke();
        drawArrowhead(ctx, tip.sx, tip.sy, dirSx, dirSy, 9);

        loadHandles.push({ loadId: ld.id, sx: tailX, sy: tailY });
        drawRoundedBadge(
          ctx,
          `${Math.abs(ld.p).toFixed(1)} kN`,
          tailX - dirSx * 10,
          tailY - dirSy * 10,
          'rgba(255, 255, 255, 0.92)',
          strokeCol,
          textCol,
          '600 10.5px "JetBrains Mono", ui-monospace, monospace'
        );
        ctx.restore();
      } else if (ld.kind === 'nodal') {
        const node = nodeMap.get(ld.nodeId);
        if (!node) continue;
        const tip = worldToScreen(node, vp);
        const fMag = Math.hypot(ld.fx, ld.fy);

        if (fMag > 1e-4) {
          const dirSx = ld.fx / fMag;
          const dirSy = -ld.fy / fMag;
          const arrowLen = Math.max(32, Math.min(58, 28 + (fMag / maxPoint) * 28));
          const tailX = tip.sx - dirSx * arrowLen;
          const tailY = tip.sy - dirSy * arrowLen;

          ctx.save();
          ctx.strokeStyle = strokeCol;
          ctx.fillStyle = strokeCol;
          ctx.lineWidth = isSelected ? 3 : 2.4;
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(tip.sx, tip.sy);
          ctx.stroke();
          drawArrowhead(ctx, tip.sx, tip.sy, dirSx, dirSy, 9);

          loadHandles.push({ loadId: ld.id, sx: tailX, sy: tailY });
          drawRoundedBadge(
            ctx,
            `${fMag.toFixed(1)} kN`,
            tailX - dirSx * 11,
            tailY - dirSy * 11,
            'rgba(255, 255, 255, 0.92)',
            strokeCol,
            textCol,
            '600 10.5px "JetBrains Mono", ui-monospace, monospace'
          );
          ctx.restore();
        }

        if (Math.abs(ld.mz) > 1e-4) {
          ctx.save();
          ctx.strokeStyle = strokeCol;
          ctx.fillStyle = strokeCol;
          ctx.lineWidth = 2.2;
          const r = 18;
          ctx.beginPath();
          ctx.arc(tip.sx, tip.sy, r, -Math.PI * 0.75, Math.PI * 0.45);
          ctx.stroke();
          loadHandles.push({ loadId: ld.id, sx: tip.sx, sy: tip.sy - r - 8 });
          drawRoundedBadge(
            ctx,
            `${ld.mz.toFixed(1)} kNm`,
            tip.sx,
            tip.sy - r - 10,
            'rgba(255, 255, 255, 0.92)',
            strokeCol,
            textCol
          );
          ctx.restore();
        }
      }
    }
  }

  private renderDeformedShape(
    ctx: CanvasRenderingContext2D,
    vp: ViewportTransform,
    model: StructuralModel,
    solverOutput: SolverOutput,
    layers: RenderLayerOptions
  ): void {
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2.5;

    // Convert mm deflection * exaggeration scale to world meters (* 1e-3)
    const scaleMPerMm = layers.deflectionScale * 1e-3;

    for (const el of model.elements) {
      if (el.kind !== 'frame2d') continue;
      const elRes = solverOutput.elementResults[el.id];
      if (!elRes || elRes.stations.length === 0) continue;

      ctx.beginPath();
      elRes.stations.forEach((st, idx) => {
        const defWorldX = st.worldX + st.dxGlobalMm * scaleMPerMm;
        const defWorldY = st.worldY + st.dyGlobalMm * scaleMPerMm;
        const sc = worldToScreen({ x: defWorldX, y: defWorldY }, vp);
        if (idx === 0) ctx.moveTo(sc.sx, sc.sy);
        else ctx.lineTo(sc.sx, sc.sy);
      });
      ctx.stroke();

      // Draw displaced joint dots at element ends
      const first = elRes.stations[0];
      const last = elRes.stations[elRes.stations.length - 1];
      for (const st of [first, last]) {
        const sc = worldToScreen(
          {
            x: st.worldX + st.dxGlobalMm * scaleMPerMm,
            y: st.worldY + st.dyGlobalMm * scaleMPerMm,
          },
          vp
        );
        ctx.fillStyle = '#1d4ed8';
        ctx.beginPath();
        ctx.arc(sc.sx, sc.sy, 3.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private renderForceDiagram(
    ctx: CanvasRenderingContext2D,
    vp: ViewportTransform,
    model: StructuralModel,
    solverOutput: SolverOutput,
    diagramType: 'N' | 'V' | 'M',
    layers: RenderLayerOptions
  ): void {
    const globalMax =
      diagramType === 'N'
        ? Math.max(1, solverOutput.globalMaxN)
        : diagramType === 'V'
          ? Math.max(1, solverOutput.globalMaxV)
          : Math.max(1, solverOutput.globalMaxM);

    const maxDiagramPx = 56 * layers.diagramScale;

    for (const el of model.elements) {
      if (el.kind !== 'frame2d') continue;
      const elRes = solverOutput.elementResults[el.id];
      if (!elRes || elRes.stations.length < 2) continue;

      const nSx = -elRes.sin;
      const nSy = -elRes.cos;

      const getVal = (st: (typeof elRes.stations)[number]): number => {
        if (diagramType === 'N') return st.N;
        if (diagramType === 'V') return st.V;
        return layers.momentSide === 'tension' ? -st.M : st.M;
      };

      // High-contrast colors tuned for white background:
      // N: #7c3aed (purple), V: #059669 (emerald), M: #dc2626 (red)
      const strokeCol =
        diagramType === 'N' ? '#7c3aed' : diagramType === 'V' ? '#059669' : '#dc2626';
      const fillCol =
        diagramType === 'N'
          ? 'rgba(124, 58, 237, 0.14)'
          : diagramType === 'V'
            ? 'rgba(5, 150, 105, 0.14)'
            : 'rgba(220, 38, 38, 0.15)';
      const textCol =
        diagramType === 'N' ? '#6d28d9' : diagramType === 'V' ? '#047857' : '#b91c1c';

      ctx.save();
      ctx.fillStyle = fillCol;
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 1.8;

      const firstSt = elRes.stations[0];
      const lastSt = elRes.stations[elRes.stations.length - 1];
      const startBase = worldToScreen({ x: firstSt.worldX, y: firstSt.worldY }, vp);
      const endBase = worldToScreen({ x: lastSt.worldX, y: lastSt.worldY }, vp);

      // Filled diagram polygon
      ctx.beginPath();
      ctx.moveTo(startBase.sx, startBase.sy);

      let peakVal = 0;
      let peakPos = { sx: startBase.sx, sy: startBase.sy };

      for (const st of elRes.stations) {
        const base = worldToScreen({ x: st.worldX, y: st.worldY }, vp);
        const v = getVal(st);
        const rawVal = diagramType === 'N' ? st.N : diagramType === 'V' ? st.V : st.M;
        const offsetPx = (v / globalMax) * maxDiagramPx;
        const px = base.sx + nSx * offsetPx;
        const py = base.sy + nSy * offsetPx;
        ctx.lineTo(px, py);

        if (Math.abs(rawVal) >= Math.abs(peakVal)) {
          peakVal = rawVal;
          peakPos = {
            sx: base.sx + nSx * (offsetPx + (offsetPx >= 0 ? 12 : -12)),
            sy: base.sy + nSy * (offsetPx + (offsetPx >= 0 ? 12 : -12)),
          };
        }
      }

      ctx.lineTo(endBase.sx, endBase.sy);
      ctx.closePath();
      ctx.fill();

      // Diagram outer curve stroke
      ctx.beginPath();
      ctx.moveTo(startBase.sx, startBase.sy);
      for (const st of elRes.stations) {
        const base = worldToScreen({ x: st.worldX, y: st.worldY }, vp);
        const offsetPx = (getVal(st) / globalMax) * maxDiagramPx;
        ctx.lineTo(base.sx + nSx * offsetPx, base.sy + nSy * offsetPx);
      }
      ctx.lineTo(endBase.sx, endBase.sy);
      ctx.stroke();

      // Peak value callout on white pill background so numbers never clash with grid lines
      if (Math.abs(peakVal) > 0.05) {
        const unit = diagramType === 'M' ? 'kNm' : 'kN';
        const prefix =
          diagramType === 'N' ? (peakVal > 0 ? 'T ' : 'C ') : `${diagramType}=`;
        drawRoundedBadge(
          ctx,
          `${prefix}${Math.abs(peakVal).toFixed(1)} ${unit}`,
          peakPos.sx,
          peakPos.sy,
          'rgba(255, 255, 255, 0.92)',
          strokeCol,
          textCol,
          '600 9.5px "JetBrains Mono", ui-monospace, monospace'
        );
      }

      ctx.restore();
    }
  }

  private renderSupportReactions(
    ctx: CanvasRenderingContext2D,
    vp: ViewportTransform,
    model: StructuralModel,
    solverOutput: SolverOutput
  ): void {
    for (const node of model.nodes) {
      const nr = solverOutput.nodeResults[node.id];
      if (!nr || !nr.hasReaction) continue;
      const sc = worldToScreen(node, vp);

      ctx.save();
      ctx.strokeStyle = '#059669';
      ctx.fillStyle = '#059669';
      ctx.lineWidth = 2.2;

      if (Math.abs(nr.reactionFy) > 0.05) {
        const signY = Math.sign(nr.reactionFy);
        const dirSy = -signY; // upward world reaction = negative screen Y
        const tipY = sc.sy + (node.support !== 'none' ? 24 : 8);
        const tailY = tipY - dirSy * 32;

        ctx.beginPath();
        ctx.moveTo(sc.sx, tailY);
        ctx.lineTo(sc.sx, tipY);
        ctx.stroke();
        drawArrowhead(ctx, sc.sx, tipY, 0, dirSy, 8);

        drawRoundedBadge(
          ctx,
          `Ry=${nr.reactionFy.toFixed(1)} kN`,
          sc.sx,
          Math.max(tipY, tailY) + 12,
          'rgba(255, 255, 255, 0.92)',
          '#059669',
          '#047857',
          '600 9.5px "JetBrains Mono", ui-monospace, monospace'
        );
      }

      if (Math.abs(nr.reactionFx) > 0.05) {
        const dirSx = Math.sign(nr.reactionFx);
        const tipX = sc.sx - dirSx * 10;
        const tailX = tipX - dirSx * 32;

        ctx.beginPath();
        ctx.moveTo(tailX, sc.sy);
        ctx.lineTo(tipX, sc.sy);
        ctx.stroke();
        drawArrowhead(ctx, tipX, sc.sy, dirSx, 0, 8);

        drawRoundedBadge(
          ctx,
          `Rx=${nr.reactionFx.toFixed(1)} kN`,
          tailX - dirSx * 28,
          sc.sy - 12,
          'rgba(255, 255, 255, 0.92)',
          '#059669',
          '#047857',
          '600 9.5px "JetBrains Mono", ui-monospace, monospace'
        );
      }

      if (Math.abs(nr.reactionMz) > 0.05) {
        drawRoundedBadge(
          ctx,
          `Mz=${nr.reactionMz.toFixed(1)} kNm`,
          sc.sx + 44,
          sc.sy + 20,
          'rgba(255, 255, 255, 0.92)',
          '#059669',
          '#047857',
          '600 9.5px "JetBrains Mono", ui-monospace, monospace'
        );
      }

      ctx.restore();
    }
  }

  private renderNodes(
    ctx: CanvasRenderingContext2D,
    vp: ViewportTransform,
    model: StructuralModel,
    interaction: CanvasInteractionState
  ): void {
    for (const node of model.nodes) {
      const sc = worldToScreen(node, vp);
      const isSelected = interaction.selectedNodeId === node.id;

      ctx.save();
      if (isSelected) {
        ctx.fillStyle = 'rgba(37, 99, 235, 0.22)';
        ctx.beginPath();
        ctx.arc(sc.sx, sc.sy, 11, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = isSelected ? '#2563eb' : '#ffffff';
      ctx.strokeStyle = isSelected ? '#1d4ed8' : '#1e293b';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(sc.sx, sc.sy, isSelected ? 6 : 4.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Node ID tag with white halo so it never clashes with grid lines
      ctx.font = '600 10.5px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.strokeText(node.id, sc.sx + 7, sc.sy - 5);
      ctx.fillStyle = isSelected ? '#2563eb' : '#0f172a';
      ctx.fillText(node.id, sc.sx + 7, sc.sy - 5);
      ctx.restore();
    }
  }

  private renderInteractiveOverlays(
    ctx: CanvasRenderingContext2D,
    vp: ViewportTransform,
    interaction: CanvasInteractionState
  ): void {
    const { snapTarget, drawStartPoint, hoverProbe, activeTool } = interaction;

    // 1. Draw Member preview line with live Length (m) & Angle (deg) HUD
    if (activeTool === 'draw_member' && drawStartPoint && snapTarget) {
      const sStart = worldToScreen(drawStartPoint, vp);
      const dx = snapTarget.x - drawStartPoint.x;
      const dy = snapTarget.y - drawStartPoint.y;
      const lenM = Math.hypot(dx, dy);
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(sStart.sx, sStart.sy);
      ctx.lineTo(snapTarget.sx, snapTarget.sy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Highlight start point dot
      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(sStart.sx, sStart.sy, 5, 0, Math.PI * 2);
      ctx.fill();

      const midX = (sStart.sx + snapTarget.sx) * 0.5;
      const midY = (sStart.sy + snapTarget.sy) * 0.5 - 18;
      drawRoundedBadge(
        ctx,
        `L = ${lenM.toFixed(2)} m · ∠ ${angleDeg.toFixed(1)}°`,
        midX,
        midY,
        'rgba(255, 255, 255, 0.95)',
        '#2563eb',
        '#1d4ed8',
        '600 11px "JetBrains Mono", ui-monospace, monospace'
      );
      ctx.restore();
    }

    // 2. Smart Snap cursor indicator
    if (snapTarget && activeTool !== 'select') {
      ctx.save();
      if (snapTarget.kind === 'node') {
        ctx.strokeStyle = '#0f766e';
        ctx.fillStyle = 'rgba(15, 118, 110, 0.14)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(snapTarget.sx, snapTarget.sy, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (snapTarget.kind === 'member_segment') {
        // Diamond T-junction split indicator
        ctx.strokeStyle = '#d97706';
        ctx.fillStyle = 'rgba(217, 119, 6, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(snapTarget.sx, snapTarget.sy - 8);
        ctx.lineTo(snapTarget.sx + 8, snapTarget.sy);
        ctx.lineTo(snapTarget.sx, snapTarget.sy + 8);
        ctx.lineTo(snapTarget.sx - 8, snapTarget.sy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        drawRoundedBadge(
          ctx,
          `T-Split ${snapTarget.splitElementId} (${snapTarget.x.toFixed(1)}, ${snapTarget.y.toFixed(1)} m)`,
          snapTarget.sx,
          snapTarget.sy - 20,
          'rgba(255, 255, 255, 0.94)',
          '#d97706',
          '#b45309',
          '600 10px "JetBrains Mono", ui-monospace, monospace'
        );
      } else {
        // 0.1m Grid snap crosshair
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(snapTarget.sx - 6, snapTarget.sy);
        ctx.lineTo(snapTarget.sx + 6, snapTarget.sy);
        ctx.moveTo(snapTarget.sx, snapTarget.sy - 6);
        ctx.lineTo(snapTarget.sx, snapTarget.sy + 6);
        ctx.stroke();

        if (vp.coordSystem === 'polar') {
          const pol = cartesianToPolar(snapTarget.x, snapTarget.y, vp.polarOrigin);
          drawRoundedBadge(
            ctx,
            `r=${pol.r.toFixed(2)}m, θ=${pol.thetaDeg.toFixed(1)}°`,
            snapTarget.sx + 58,
            snapTarget.sy + 18,
            'rgba(255, 255, 255, 0.92)',
            '#2563eb',
            '#1d4ed8',
            '500 10px "JetBrains Mono", ui-monospace, monospace'
          );
        }
      }
      ctx.restore();
    }

    // 3. Hover Probe glowing marker on member
    if (hoverProbe) {
      ctx.save();
      ctx.fillStyle = '#2563eb';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(hoverProbe.screenX, hoverProbe.screenY, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

