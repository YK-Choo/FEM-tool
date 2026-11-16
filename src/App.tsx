import React from './vendor/react-runtime.ts';
import type {
  StructuralModel,
  StructuralNode,
  Frame2DElement,
  StructuralLoad,
  PinnedParameterTarget,
} from './types/model.ts';
import {
  analyzeStructure,
  computeCrossSection,
  createMaterialFromPreset,
  restraintsFromSupportPreset,
} from './solver/index.ts';
import {
  computeSmartSnap,
  fitModelToViewport,
  type ViewportTransform,
  type SnapResult,
} from './utils/coordinates.ts';
import {
  hitTestCanvas,
  probeMemberAtCursor,
  splitMemberAtPoint,
  canAddMember,
  nextEntityId,
  type HoverProbeData,
} from './utils/geometry.ts';
import {
  CanvasRenderer,
  type RenderLayerOptions,
  type LoadScreenHandle,
} from './renderer/CanvasRenderer.ts';
import { BENCHMARK_PRESETS } from './presets/benchmarks.ts';
import { Toolbar, type ActiveToolMode } from './components/Toolbar.tsx';
import { LayerTogglesBar } from './components/LayerTogglesBar.tsx';
import { ContextualPopup } from './components/Popups.tsx';
import { SensitivityPanel } from './components/SensitivityPanel.tsx';

function buildDefaultPinsForPreset(presetId: string, model: StructuralModel): PinnedParameterTarget[] {
  const pins: PinnedParameterTarget[] = [];

  if (presetId === 'culvert') {
    const l1 = model.loads.find((l) => l.id === 'L1');
    if (l1 && l1.kind === 'member_distributed') {
      pins.push({
        id: 'pin_L1',
        label: 'Left Wall Earth+Water (L1)',
        kind: 'load_magnitude',
        loadId: 'L1',
        basePrimary: l1.w1,
        baseSecondary: l1.w2,
        multiplier: 1.0,
      });
    }
    const l3 = model.loads.find((l) => l.id === 'L3');
    if (l3 && l3.kind === 'member_distributed') {
      pins.push({
        id: 'pin_L3',
        label: 'Roof Soil Surcharge (L3)',
        kind: 'load_magnitude',
        loadId: 'L3',
        basePrimary: l3.w1,
        baseSecondary: l3.w2,
        multiplier: 1.0,
      });
    }
    const m3 = model.elements.find((e): e is Frame2DElement => e.id === 'M3' && e.kind === 'frame2d');
    if (m3) {
      pins.push({
        id: 'pin_M3_h',
        label: 'Roof Slab Depth h (M3)',
        kind: 'member_depth',
        elementId: 'M3',
        baseValue: m3.section.depthMm,
        multiplier: 1.0,
      });
    }
    const n5 = model.nodes.find((n) => n.id === 'N5');
    if (n5) {
      pins.push({
        id: 'pin_N5_ky',
        label: 'Center Soil Spring ky (N5)',
        kind: 'node_spring_ky',
        nodeId: 'N5',
        baseValue: n5.springs.ky,
        multiplier: 1.0,
      });
    }
    return pins;
  }

  if (presetId === 'portal') {
    const l1 = model.loads.find((l) => l.id === 'L1');
    if (l1 && l1.kind === 'member_point') {
      pins.push({
        id: 'pin_L1',
        label: 'Lateral Wind Load P (L1)',
        kind: 'load_magnitude',
        loadId: 'L1',
        basePrimary: l1.p,
        multiplier: 1.0,
      });
    }
    const l2 = model.loads.find((l) => l.id === 'L2');
    if (l2 && l2.kind === 'member_distributed') {
      pins.push({
        id: 'pin_L2',
        label: 'Bay 1 Roof UDL (L2)',
        kind: 'load_magnitude',
        loadId: 'L2',
        basePrimary: l2.w1,
        baseSecondary: l2.w2,
        multiplier: 1.0,
      });
    }
    const m2 = model.elements.find((e): e is Frame2DElement => e.id === 'M2' && e.kind === 'frame2d');
    if (m2) {
      pins.push({
        id: 'pin_M2_h',
        label: 'Center Column Depth h (M2)',
        kind: 'member_depth',
        elementId: 'M2',
        baseValue: m2.section.depthMm,
        multiplier: 1.0,
      });
    }
    return pins;
  }

  if (presetId === 'continuous_beam') {
    const n2 = model.nodes.find((n) => n.id === 'N2');
    if (n2) {
      pins.push({
        id: 'pin_N2_krz',
        label: 'Center Pier Spring kθ (N2)',
        kind: 'node_spring_krz',
        nodeId: 'N2',
        baseValue: n2.springs.krz,
        multiplier: 1.0,
      });
    }
    const l1 = model.loads.find((l) => l.id === 'L1');
    if (l1 && l1.kind === 'member_distributed') {
      pins.push({
        id: 'pin_L1',
        label: 'Span 1 UDL w (L1)',
        kind: 'load_magnitude',
        loadId: 'L1',
        basePrimary: l1.w1,
        baseSecondary: l1.w2,
        multiplier: 1.0,
      });
    }
    const l2 = model.loads.find((l) => l.id === 'L2');
    if (l2 && l2.kind === 'member_point') {
      pins.push({
        id: 'pin_L2',
        label: 'Span 2 Point Load P (L2)',
        kind: 'load_magnitude',
        loadId: 'L2',
        basePrimary: l2.p,
        multiplier: 1.0,
      });
    }
    return pins;
  }

  // pratt_truss
  const l2 = model.loads.find((l) => l.id === 'L2');
  if (l2 && l2.kind === 'nodal') {
    pins.push({
      id: 'pin_L2',
      label: 'Center Joint Load Fy (L2)',
      kind: 'load_magnitude',
      loadId: 'L2',
      basePrimary: l2.fy,
      multiplier: 1.0,
    });
  }
  const m6 = model.elements.find((e): e is Frame2DElement => e.id === 'M6' && e.kind === 'frame2d');
  if (m6) {
    pins.push({
      id: 'pin_M6_E',
      label: 'Top Chord Modulus E (M6)',
      kind: 'member_E',
      elementId: 'M6',
      baseValue: m6.material.E,
      multiplier: 1.0,
    });
  }
  return pins;
}

const rendererInstance = new CanvasRenderer();

export function App() {
  const initialPreset = BENCHMARK_PRESETS[0];
  const [activePresetId, setActivePresetId] = React.useState<string>(initialPreset.id);
  const [model, setModel] = React.useState<StructuralModel>(() =>
    structuredClone(initialPreset.model)
  );
  const [undoStack, setUndoStack] = React.useState<StructuralModel[]>([]);
  const [redoStack, setRedoStack] = React.useState<StructuralModel[]>([]);

  const [activeTool, setActiveTool] = React.useState<ActiveToolMode>('select');
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = React.useState<string | null>('M1');
  const [selectedLoadId, setSelectedLoadId] = React.useState<string | null>(null);
  const [hoveredElementId, setHoveredElementId] = React.useState<string | null>(null);

  const [layers, setLayers] = React.useState<RenderLayerOptions>({
    showGrid: true,
    showLoads: true,
    showSupports: true,
    showDeformed: true,
    showAxial: false,
    showShear: false,
    showMoment: true,
    showReactions: true,
    showHeatmap: false,
    momentSide: 'tension',
    deflectionScale: 120,
    diagramScale: 1.0,
  });

  const [pinnedParams, setPinnedParams] = React.useState<PinnedParameterTarget[]>(() =>
    buildDefaultPinsForPreset(initialPreset.id, initialPreset.model)
  );

  const [viewport, setViewport] = React.useState<ViewportTransform>({
    panX: 340,
    panY: 420,
    zoom: 85,
    width: 960,
    height: 640,
    coordSystem: 'cartesian',
    polarOrigin: { x: 0, y: 0 },
  });

  const [snapTarget, setSnapTarget] = React.useState<SnapResult | null>(null);
  const [drawStartPoint, setDrawStartPoint] = React.useState<{
    x: number;
    y: number;
    nodeId?: string;
    splitElementId?: string;
  } | null>(null);
  const [hoverProbe, setHoverProbe] = React.useState<HoverProbeData | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const loadHandlesRef = React.useRef<LoadScreenHandle[]>([]);
  const panDragRef = React.useRef<{
    active: boolean;
    startSx: number;
    startSy: number;
    origPanX: number;
    origPanY: number;
    moved: boolean;
  }>({
    active: false,
    startSx: 0,
    startSy: 0,
    origPanX: 0,
    origPanY: 0,
    moved: false,
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3000);
  };

  // Run 6-DOF 2D Euler-Bernoulli FEM Solver synchronously on every model change
  const solverOutput = React.useMemo(() => analyzeStructure(model, 48), [model]);

  const updateModelWithHistory = (
    updater: (prev: StructuralModel) => StructuralModel,
    recordUndo: boolean = true
  ) => {
    setModel((prev) => {
      const next = updater(structuredClone(prev));
      if (recordUndo) {
        setUndoStack((u) => [...u.slice(-29), prev]);
        setRedoStack([]);
      }
      return next;
    });
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prevModel = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, model]);
    setModel(prevModel);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextModel = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, model]);
    setModel(nextModel);
  };

  const handleSelectPreset = (presetId: string) => {
    const found = BENCHMARK_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    const freshModel = structuredClone(found.model);
    setActivePresetId(presetId);
    setUndoStack([]);
    setRedoStack([]);
    setModel(freshModel);
    setSelectedNodeId(null);
    setSelectedElementId(freshModel.elements[0]?.id ?? null);
    setSelectedLoadId(null);
    setDrawStartPoint(null);
    setPinnedParams(buildDefaultPinsForPreset(presetId, freshModel));

    // Customize default visible diagram for Pratt Truss vs Frame/Beam/Culvert
    if (presetId === 'pratt_truss') {
      setLayers((l) => ({
        ...l,
        showAxial: true,
        showMoment: false,
        showShear: false,
        showHeatmap: true,
        deflectionScale: 150,
      }));
    } else {
      setLayers((l) => ({
        ...l,
        showAxial: false,
        showMoment: true,
        showShear: false,
        showHeatmap: false,
        deflectionScale: 120,
      }));
    }

    setViewport((vp) => fitModelToViewport(freshModel.nodes, vp.width, vp.height, vp));
  };

  // Fit viewport on mount and container resize
  React.useEffect(() => {
    const updateSize = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewport((vp) =>
          fitModelToViewport(model.nodes, rect.width, rect.height, vp)
        );
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Delete, Escape, V/M/S/N/L tool keys)
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (e.key === 'Escape') {
        setDrawStartPoint(null);
        setSelectedNodeId(null);
        setSelectedElementId(null);
        setSelectedLoadId(null);
        setActiveTool('select');
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'v') setActiveTool('select');
      else if (key === 'm') setActiveTool('draw_member');
      else if (key === 's') setActiveTool('assign_support');
      else if (key === 'n') setActiveTool('add_nodal_load');
      else if (key === 'l') setActiveTool('add_member_load');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoStack, redoStack, model, selectedNodeId, selectedElementId, selectedLoadId]);

  // Render HTML5 Canvas with crisp devicePixelRatio scaling on state changes
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.floor(viewport.width * dpr));
    const targetH = Math.max(1, Math.floor(viewport.height * dpr));

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);

    const handles = rendererInstance.render(ctx, viewport, model, solverOutput, layers, {
      activeTool,
      selectedNodeId,
      selectedElementId,
      selectedLoadId,
      hoveredElementId,
      snapTarget,
      drawStartPoint,
      hoverProbe,
    });
    loadHandlesRef.current = handles;

    ctx.restore();
  }, [
    viewport,
    model,
    solverOutput,
    layers,
    activeTool,
    selectedNodeId,
    selectedElementId,
    selectedLoadId,
    hoveredElementId,
    snapTarget,
    drawStartPoint,
    hoverProbe,
  ]);

  // Delete currently selected entity (Node, Member, or Load)
  const handleDeleteEntityById = (
    kind: 'node' | 'member' | 'load',
    id: string
  ) => {
    updateModelWithHistory((prev) => {
      if (kind === 'load') {
        return {
          ...prev,
          loads: prev.loads.filter((l) => l.id !== id),
        };
      }
      if (kind === 'member') {
        return {
          ...prev,
          elements: prev.elements.filter((e) => e.id !== id),
          loads: prev.loads.filter(
            (l) =>
              !(
                (l.kind === 'member_distributed' || l.kind === 'member_point') &&
                l.elementId === id
              )
          ),
        };
      }
      // kind === 'node': remove node, incident members, and attached loads
      const removedElIds = new Set(
        prev.elements
          .filter((e) => e.kind === 'frame2d' && (e.nodeI === id || e.nodeJ === id))
          .map((e) => e.id)
      );
      return {
        ...prev,
        nodes: prev.nodes.filter((n) => n.id !== id),
        elements: prev.elements.filter((e) => !removedElIds.has(e.id)),
        loads: prev.loads.filter((l) => {
          if (l.kind === 'nodal') return l.nodeId !== id;
          if (l.kind === 'member_distributed' || l.kind === 'member_point') {
            return !removedElIds.has(l.elementId);
          }
          return true;
        }),
      };
    });

    if (kind === 'node' && selectedNodeId === id) setSelectedNodeId(null);
    if (kind === 'member' && selectedElementId === id) setSelectedElementId(null);
    if (kind === 'load' && selectedLoadId === id) setSelectedLoadId(null);
  };

  const handleDeleteSelected = () => {
    if (selectedLoadId) handleDeleteEntityById('load', selectedLoadId);
    else if (selectedElementId) handleDeleteEntityById('member', selectedElementId);
    else if (selectedNodeId) handleDeleteEntityById('node', selectedNodeId);
  };

  // Resolve a SnapResult into an existing or newly created/split Node ID inside `workingModel`
  const resolveSnapPointToNode = (
    workingModel: StructuralModel,
    snap: SnapResult
  ): { model: StructuralModel; nodeId: string } => {
    if (snap.kind === 'node' && snap.nodeId) {
      return { model: workingModel, nodeId: snap.nodeId };
    }
    if (snap.kind === 'member_segment' && snap.splitElementId) {
      // Auto-split existing member at T-junction!
      const splitRes = splitMemberAtPoint(
        workingModel,
        snap.splitElementId,
        snap.x,
        snap.y
      );
      showToast(`Auto-split member ${snap.splitElementId} at T-junction (${snap.x}m, ${snap.y}m)`);
      return { model: splitRes.model, nodeId: splitRes.newNodeId };
    }
    // Check if a node already exists at (snap.x, snap.y)
    const existing = workingModel.nodes.find(
      (n) => Math.hypot(n.x - snap.x, n.y - snap.y) < 0.04
    );
    if (existing) {
      return { model: workingModel, nodeId: existing.id };
    }
    const newNodeId = nextEntityId(
      'N',
      workingModel.nodes.map((n) => n.id)
    );
    const newNode: StructuralNode = {
      id: newNodeId,
      label: newNodeId,
      x: snap.x,
      y: snap.y,
      z: 0,
      support: 'none',
      restraints: restraintsFromSupportPreset('none'),
      springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
    };
    return {
      model: { ...workingModel, nodes: [...workingModel.nodes, newNode] },
      nodeId: newNodeId,
    };
  };

  // Complete drawing a member from startSnap to endSnap
  const completeDrawMember = (
    startSnap: { x: number; y: number; nodeId?: string; splitElementId?: string },
    endSnap: SnapResult
  ) => {
    if (Math.hypot(endSnap.x - startSnap.x, endSnap.y - startSnap.y) < 0.05) {
      return;
    }

    updateModelWithHistory((prev) => {
      let working = prev;
      const startRes = resolveSnapPointToNode(working, {
        x: startSnap.x,
        y: startSnap.y,
        sx: 0,
        sy: 0,
        kind: startSnap.nodeId
          ? 'node'
          : startSnap.splitElementId
            ? 'member_segment'
            : 'grid',
        nodeId: startSnap.nodeId,
        splitElementId: startSnap.splitElementId,
      });
      working = startRes.model;

      // Re-verify endSnap in case startSnap split the same element
      const endRes = resolveSnapPointToNode(working, endSnap);
      working = endRes.model;

      const check = canAddMember(working, startRes.nodeId, endRes.nodeId);
      if (!check.valid) {
        if (check.reason) showToast(check.reason);
        return prev;
      }

      const newElId = nextEntityId(
        'M',
        working.elements.map((e) => e.id)
      );
      const defaultSec = computeCrossSection('i_section', {
        h: 360,
        b: 170,
        tw: 8.0,
        tf: 12.7,
      });
      const defaultMat = createMaterialFromPreset('steel');

      const newEl: Frame2DElement = {
        id: newElId,
        kind: 'frame2d',
        label: `Member ${newElId}`,
        nodeI: startRes.nodeId,
        nodeJ: endRes.nodeId,
        section: defaultSec,
        material: defaultMat,
        releaseStart: false,
        releaseEnd: false,
      };

      setSelectedNodeId(null);
      setSelectedLoadId(null);
      setSelectedElementId(newElId);

      return {
        ...working,
        elements: [...working.elements, newEl],
      };
    });
  };

  // Canvas Mouse Handlers
  const handleCanvasMouseDown = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Middle mouse button or right mouse button -> pan
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      panDragRef.current = {
        active: true,
        startSx: sx,
        startSy: sy,
        origPanX: viewport.panX,
        origPanY: viewport.panY,
        moved: false,
      };
      return;
    }

    const currentSnap = computeSmartSnap(sx, sy, viewport, model.nodes, model.elements);
    setSnapTarget(currentSnap);

    if (activeTool === 'draw_member') {
      if (!drawStartPoint) {
        setDrawStartPoint({
          x: currentSnap.x,
          y: currentSnap.y,
          nodeId: currentSnap.nodeId,
          splitElementId: currentSnap.splitElementId,
        });
      } else {
        completeDrawMember(drawStartPoint, currentSnap);
        setDrawStartPoint(null);
      }
      return;
    }

    const hit = hitTestCanvas(sx, sy, viewport, model, loadHandlesRef.current);

    if (activeTool === 'delete') {
      if (hit) {
        handleDeleteEntityById(hit.kind, hit.kind === 'node' ? hit.nodeId : hit.kind === 'member' ? hit.elementId : hit.loadId);
      }
      return;
    }

    if (activeTool === 'assign_support') {
      if (hit && hit.kind === 'node') {
        // Cycle support preset or select node to open support inspector
        updateModelWithHistory((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => {
            if (n.id !== hit.nodeId) return n;
            const order: StructuralNode['support'][] = [
              'pinned',
              'rollerX',
              'fixed',
              'inclinedRoller',
              'none',
            ];
            const nextSup = order[(order.indexOf(n.support) + 1) % order.length];
            return {
              ...n,
              support: nextSup,
              inclinedAngleDeg: nextSup === 'inclinedRoller' ? 30 : n.inclinedAngleDeg,
              restraints: restraintsFromSupportPreset(nextSup),
            };
          }),
        }));
        setSelectedNodeId(hit.nodeId);
        setSelectedElementId(null);
        setSelectedLoadId(null);
      } else {
        showToast('Click any node to assign or cycle its support restraint.');
      }
      return;
    }

    if (activeTool === 'add_nodal_load') {
      if (hit && hit.kind === 'node') {
        handleQuickAddNodalLoad(hit.nodeId);
      } else {
        showToast('Click any node to apply a concentrated Nodal Load (Fx, Fy, Mz).');
      }
      return;
    }

    if (activeTool === 'add_member_load') {
      if (hit && hit.kind === 'member') {
        handleQuickAddMemberLoad(hit.elementId, 'distributed');
      } else {
        showToast('Click any member to apply a Distributed or Point Load.');
      }
      return;
    }

    // Default 'select' mode: if clicked on background, start pan drag; if clicked on entity, open contextual pop-up
    if (hit) {
      if (hit.kind === 'node') {
        setSelectedNodeId(hit.nodeId);
        setSelectedElementId(null);
        setSelectedLoadId(null);
      } else if (hit.kind === 'member') {
        setSelectedElementId(hit.elementId);
        setSelectedNodeId(null);
        setSelectedLoadId(null);
      } else if (hit.kind === 'load') {
        setSelectedLoadId(hit.loadId);
        setSelectedNodeId(null);
        setSelectedElementId(null);
      }
    } else {
      panDragRef.current = {
        active: true,
        startSx: sx,
        startSy: sy,
        origPanX: viewport.panX,
        origPanY: viewport.panY,
        moved: false,
      };
    }
  };

  const handleCanvasMouseMove = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (panDragRef.current.active) {
      const dx = sx - panDragRef.current.startSx;
      const dy = sy - panDragRef.current.startSy;
      if (Math.hypot(dx, dy) > 3) {
        panDragRef.current.moved = true;
      }
      setViewport((vp) => ({
        ...vp,
        panX: panDragRef.current.origPanX + dx,
        panY: panDragRef.current.origPanY + dy,
      }));
      return;
    }

    const currentSnap = computeSmartSnap(sx, sy, viewport, model.nodes, model.elements);
    setSnapTarget(currentSnap);

    // Interactive Hover Probe along any member
    const probe = probeMemberAtCursor(sx, sy, viewport, model, solverOutput, 18);
    setHoverProbe(probe);
    setHoveredElementId(probe ? probe.element.id : null);
  };

  const handleCanvasMouseUp = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (panDragRef.current.active) {
      const wasMoved = panDragRef.current.moved;
      panDragRef.current.active = false;
      if (!wasMoved && activeTool === 'select') {
        setSelectedNodeId(null);
        setSelectedElementId(null);
        setSelectedLoadId(null);
      }
      return;
    }

    // Support click-drag-release in Draw Member mode!
    if (activeTool === 'draw_member' && drawStartPoint) {
      const currentSnap = computeSmartSnap(sx, sy, viewport, model.nodes, model.elements);
      if (Math.hypot(currentSnap.x - drawStartPoint.x, currentSnap.y - drawStartPoint.y) >= 0.2) {
        completeDrawMember(drawStartPoint, currentSnap);
        setDrawStartPoint(null);
      }
    }
  };

  const handleCanvasWheel = (e: any) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setViewport((vp) => {
      const nextZoom = Math.min(280, Math.max(18, vp.zoom * factor));
      const worldX = (sx - vp.panX) / vp.zoom;
      const worldY = (vp.panY - sy) / vp.zoom;
      return {
        ...vp,
        zoom: nextZoom,
        panX: sx - worldX * nextZoom,
        panY: sy + worldY * nextZoom,
      };
    });
  };

  // Quick Add Load Helpers
  const handleQuickAddMemberLoad = (
    elementId: string,
    loadType: 'distributed' | 'point'
  ) => {
    const newLoadId = nextEntityId(
      'L',
      model.loads.map((l) => l.id)
    );
    const newLoad: StructuralLoad =
      loadType === 'distributed'
        ? {
            id: newLoadId,
            kind: 'member_distributed',
            elementId,
            w1: -20,
            w2: -20,
            direction: 'global_y',
            label: `${elementId} UDL`,
          }
        : {
            id: newLoadId,
            kind: 'member_point',
            elementId,
            p: -40,
            a: 1.5,
            direction: 'global_y',
            label: `${elementId} Point Load`,
          };

    updateModelWithHistory((prev) => ({
      ...prev,
      loads: [...prev.loads, newLoad],
    }));
    setSelectedLoadId(newLoadId);
    setSelectedElementId(null);
    setSelectedNodeId(null);
  };

  const handleQuickAddNodalLoad = (nodeId: string) => {
    const newLoadId = nextEntityId(
      'L',
      model.loads.map((l) => l.id)
    );
    const newLoad: StructuralLoad = {
      id: newLoadId,
      kind: 'nodal',
      nodeId,
      fx: 0,
      fy: -50,
      mz: 0,
      label: `Node ${nodeId} Force`,
    };
    updateModelWithHistory((prev) => ({
      ...prev,
      loads: [...prev.loads, newLoad],
    }));
    setSelectedLoadId(newLoadId);
    setSelectedNodeId(null);
    setSelectedElementId(null);
  };

  // Pin a parameter to the Real-Time Sensitivity Panel
  const handlePinParameter = (
    kind: PinnedParameterTarget['kind'],
    targetId: string
  ) => {
    const pinId = `pin_${kind}_${targetId}`;
    if (pinnedParams.some((p) => p.id === pinId)) {
      showToast('Parameter is already pinned to the Sensitivity Panel.');
      return;
    }

    if (kind === 'member_depth') {
      const el = model.elements.find(
        (e): e is Frame2DElement => e.kind === 'frame2d' && e.id === targetId
      );
      if (!el) return;
      setPinnedParams((prev) => [
        ...prev,
        {
          id: pinId,
          label: `Member ${el.id} Depth h`,
          kind: 'member_depth',
          elementId: el.id,
          baseValue: el.section.depthMm,
          multiplier: 1.0,
        },
      ]);
    } else if (kind === 'member_E') {
      const el = model.elements.find(
        (e): e is Frame2DElement => e.kind === 'frame2d' && e.id === targetId
      );
      if (!el) return;
      setPinnedParams((prev) => [
        ...prev,
        {
          id: pinId,
          label: `Member ${el.id} Modulus E`,
          kind: 'member_E',
          elementId: el.id,
          baseValue: el.material.E,
          multiplier: 1.0,
        },
      ]);
    } else if (kind === 'node_spring_ky') {
      const n = model.nodes.find((item) => item.id === targetId);
      if (!n) return;
      const baseKy = n.springs.ky > 0 ? n.springs.ky : 25000;
      if (n.springs.ky === 0) {
        updateModelWithHistory((prev) => ({
          ...prev,
          nodes: prev.nodes.map((nd) =>
            nd.id === n.id ? { ...nd, springs: { ...nd.springs, ky: baseKy } } : nd
          ),
        }));
      }
      setPinnedParams((prev) => [
        ...prev,
        {
          id: pinId,
          label: `Node ${n.id} Spring ky`,
          kind: 'node_spring_ky',
          nodeId: n.id,
          baseValue: baseKy,
          multiplier: 1.0,
        },
      ]);
    } else if (kind === 'node_spring_krz') {
      const n = model.nodes.find((item) => item.id === targetId);
      if (!n) return;
      const baseKrz = n.springs.krz > 0 ? n.springs.krz : 15000;
      if (n.springs.krz === 0) {
        updateModelWithHistory((prev) => ({
          ...prev,
          nodes: prev.nodes.map((nd) =>
            nd.id === n.id ? { ...nd, springs: { ...nd.springs, krz: baseKrz } } : nd
          ),
        }));
      }
      setPinnedParams((prev) => [
        ...prev,
        {
          id: pinId,
          label: `Node ${n.id} Spring kθ`,
          kind: 'node_spring_krz',
          nodeId: n.id,
          baseValue: baseKrz,
          multiplier: 1.0,
        },
      ]);
    } else if (kind === 'load_magnitude') {
      const ld = model.loads.find((l) => l.id === targetId);
      if (!ld) return;
      const basePrimary =
        ld.kind === 'member_distributed'
          ? ld.w1
          : ld.kind === 'member_point'
            ? ld.p
            : ld.kind === 'nodal'
              ? Math.abs(ld.fy) >= Math.abs(ld.fx)
                ? ld.fy
                : ld.fx
              : 10;
      const baseSecondary = ld.kind === 'member_distributed' ? ld.w2 : undefined;

      setPinnedParams((prev) => [
        ...prev,
        {
          id: pinId,
          label: `Load ${ld.id} (${ld.label || ld.kind})`,
          kind: 'load_magnitude',
          loadId: ld.id,
          basePrimary,
          baseSecondary,
          multiplier: 1.0,
        },
      ]);
    }
  };

  // Real-time sensitivity slider handler: mutates model instantaneously without flooding undo stack
  const handleSlidePinnedParam = (pinId: string, multiplier: number) => {
    const targetPin = pinnedParams.find((p) => p.id === pinId);
    if (!targetPin) return;

    setPinnedParams((prev) =>
      prev.map((p) => (p.id === pinId ? { ...p, multiplier } : p))
    );

    setModel((prev) => {
      if (targetPin.kind === 'member_depth') {
        const nextDepth = Math.max(20, Math.round(targetPin.baseValue * multiplier));
        return {
          ...prev,
          elements: prev.elements.map((el) => {
            if (el.id !== targetPin.elementId || el.kind !== 'frame2d') return el;
            const dimKey = el.section.shape === 'circular' ? 'd' : 'h';
            const nextDims = { ...el.section.dimensions, [dimKey]: nextDepth };
            return {
              ...el,
              section: computeCrossSection(el.section.shape, nextDims),
            };
          }),
        };
      }

      if (targetPin.kind === 'member_E') {
        const nextE = Number(Math.max(1, targetPin.baseValue * multiplier).toFixed(1));
        return {
          ...prev,
          elements: prev.elements.map((el) =>
            el.id === targetPin.elementId && el.kind === 'frame2d'
              ? { ...el, material: { ...el.material, E: nextE } }
              : el
          ),
        };
      }

      if (targetPin.kind === 'node_spring_ky') {
        const nextKy = Math.round(targetPin.baseValue * multiplier);
        return {
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === targetPin.nodeId
              ? { ...n, springs: { ...n.springs, ky: nextKy } }
              : n
          ),
        };
      }

      if (targetPin.kind === 'node_spring_krz') {
        const nextKrz = Math.round(targetPin.baseValue * multiplier);
        return {
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === targetPin.nodeId
              ? { ...n, springs: { ...n.springs, krz: nextKrz } }
              : n
          ),
        };
      }

      if (targetPin.kind === 'load_magnitude') {
        return {
          ...prev,
          loads: prev.loads.map((ld) => {
            if (ld.id !== targetPin.loadId) return ld;
            if (ld.kind === 'member_distributed') {
              return {
                ...ld,
                w1: Number((targetPin.basePrimary * multiplier).toFixed(2)),
                w2: Number(
                  ((targetPin.baseSecondary ?? targetPin.basePrimary) * multiplier).toFixed(2)
                ),
              };
            }
            if (ld.kind === 'member_point') {
              return {
                ...ld,
                p: Number((targetPin.basePrimary * multiplier).toFixed(2)),
              };
            }
            if (ld.kind === 'nodal') {
              if (Math.abs(ld.fy) >= Math.abs(ld.fx)) {
                return { ...ld, fy: Number((targetPin.basePrimary * multiplier).toFixed(2)) };
              }
              return { ...ld, fx: Number((targetPin.basePrimary * multiplier).toFixed(2)) };
            }
            return ld;
          }),
        };
      }

      return prev;
    });
  };

  const handleResetPinnedParams = () => {
    pinnedParams.forEach((p) => {
      handleSlidePinnedParam(p.id, 1.0);
    });
  };

  // JSON Export / Import
  const handleExportJson = () => {
    const json = JSON.stringify(model, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.name.toLowerCase().replace(/\s+/g, '_')}.fem.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported structural model to JSON.');
  };

  const handleImportJson = (jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText) as StructuralModel;
      if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.elements)) {
        showToast('Invalid structural model JSON schema.');
        return;
      }
      updateModelWithHistory(() => parsed, true);
      setViewport((vp) => fitModelToViewport(parsed.nodes, vp.width, vp.height, vp));
      showToast(`Imported "${parsed.name || 'Custom Model'}" successfully.`);
    } catch {
      showToast('Failed to parse JSON file.');
    }
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Toolbar */}
      <Toolbar
        activePresetId={activePresetId}
        onSelectPreset={handleSelectPreset}
        activeTool={activeTool}
        onSelectTool={(t) => {
          setActiveTool(t);
          setDrawStartPoint(null);
        }}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onZoomIn={() =>
          setViewport((vp) => ({ ...vp, zoom: Math.min(280, vp.zoom * 1.2) }))
        }
        onZoomOut={() =>
          setViewport((vp) => ({ ...vp, zoom: Math.max(18, vp.zoom / 1.2) }))
        }
        onFitView={() =>
          setViewport((vp) => fitModelToViewport(model.nodes, vp.width, vp.height, vp))
        }
        coordSystem={viewport.coordSystem}
        onToggleCoordSystem={() =>
          setViewport((vp) => ({
            ...vp,
            coordSystem: vp.coordSystem === 'cartesian' ? 'polar' : 'cartesian',
          }))
        }
        solverOutput={solverOutput}
        model={model}
      />

      {/* Main Workspace: Interactive CAD Canvas + Dockable Sensitivity Panel */}
      <main className="flex flex-1 min-h-0 relative overflow-hidden">
        {/* Center Interactive HTML5 Canvas Container */}
        <div
          ref={containerRef}
          className="relative flex-1 h-full overflow-hidden bg-slate-950"
          onContextMenu={(e: any) => e.preventDefault()}
        >
          {/* Floating Result Overlay Toggles & Hover Probe Callout */}
          <LayerTogglesBar
            layers={layers}
            onUpdateLayers={(patch) => setLayers((l) => ({ ...l, ...patch }))}
            hoverProbe={hoverProbe}
          />

          {/* Prominent Unstable Structure Diagnostic Banner */}
          {!solverOutput.stable ? (
            <div
              id="unstable-structure-banner"
              className="absolute top-16 left-3 z-20 max-w-lg bg-rose-950/95 border border-rose-500 text-rose-100 px-3.5 py-2 rounded-lg shadow-2xl text-xs"
            >
              <div className="font-bold text-rose-300 uppercase tracking-wide mb-0.5">
                Unstable Structure — Mechanism or Insufficient Restraints
              </div>
              <div className="text-rose-200/90 font-mono text-[11px]">
                {solverOutput.instabilityReason ||
                  'Add supports, springs, or restrain free hinge mechanisms to restore stability.'}
              </div>
            </div>
          ) : null}

          {/* Toast Feedback Notification */}
          {toastMessage ? (
            <div className="absolute top-16 right-4 z-30 bg-slate-900/95 border border-sky-400/60 text-sky-200 px-3 py-1.5 rounded-lg shadow-xl text-xs font-mono">
              {toastMessage}
            </div>
          ) : null}

          {/* HTML5 Canvas */}
          <canvas
            id="structural-fem-canvas"
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onWheel={handleCanvasWheel}
            style={{
              width: `${viewport.width}px`,
              height: `${viewport.height}px`,
            }}
            className={`block select-none ${
              activeTool === 'draw_member'
                ? 'cursor-crosshair'
                : activeTool === 'delete'
                  ? 'cursor-pointer'
                  : 'cursor-default'
            }`}
          />

          {/* Contextual Parameter Pop-Up Editor (Member, Node, or Load) */}
          <ContextualPopup
            model={model}
            selectedNodeId={selectedNodeId}
            selectedElementId={selectedElementId}
            selectedLoadId={selectedLoadId}
            onUpdateModel={updateModelWithHistory}
            onClose={() => {
              setSelectedNodeId(null);
              setSelectedElementId(null);
              setSelectedLoadId(null);
            }}
            onDeleteEntity={handleDeleteSelected}
            onPinParameter={handlePinParameter}
            onQuickAddMemberLoad={handleQuickAddMemberLoad}
            onQuickAddNodalLoad={handleQuickAddNodalLoad}
          />

          {/* Bottom CAD Status & Coordinate HUD Bar */}
          <div className="absolute bottom-0 inset-x-0 h-7 bg-slate-900/90 backdrop-blur border-t border-slate-800 px-3 flex items-center justify-between text-[11px] font-mono text-slate-400 select-none pointer-events-none">
            <div className="flex items-center gap-4">
              <span className="text-sky-400 font-semibold">
                {snapTarget
                  ? `X: ${snapTarget.x.toFixed(1)} m, Y: ${snapTarget.y.toFixed(1)} m (Z: 0.0 m)`
                  : 'X: 0.0 m, Y: 0.0 m'}
              </span>
              <span className="hidden sm:inline text-slate-500">|</span>
              <span className="hidden sm:inline text-slate-300">
                {activeTool === 'select'
                  ? 'Click any Member, Node, or Load to edit parameters · Drag background to pan · Scroll to zoom'
                  : activeTool === 'draw_member'
                    ? drawStartPoint
                      ? 'Click or release on end point (snaps to 0.1m grid, existing nodes, or T-splits members)'
                      : 'Click start point to draw new 1D Frame Member'
                    : activeTool === 'assign_support'
                      ? 'Click any node to cycle/edit support restraint (Fixed, Pinned, Roller, Inclined)'
                      : activeTool === 'add_nodal_load'
                        ? 'Click any node to add a concentrated Nodal Load'
                        : activeTool === 'add_member_load'
                          ? 'Click any member to add a Distributed (UDL/Trapezoidal) or Point Load'
                          : 'Click any Member, Node, or Load to delete it'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span>Nodes: {model.nodes.length}</span>
              <span>Members: {model.elements.length}</span>
              <span>Loads: {model.loads.length}</span>
              <span>Grid: 0.1 m</span>
            </div>
          </div>
        </div>

        {/* Right Dockable Real-Time Sensitivity & Telemetry Panel */}
        <SensitivityPanel
          model={model}
          solverOutput={solverOutput}
          layers={layers}
          onUpdateLayers={(patch) => setLayers((l) => ({ ...l, ...patch }))}
          pinnedParams={pinnedParams}
          onSlidePinnedParam={handleSlidePinnedParam}
          onUnpinParam={(pinId) =>
            setPinnedParams((prev) => prev.filter((p) => p.id !== pinId))
          }
          onResetPinnedParams={handleResetPinnedParams}
          onAddQuickPin={handlePinParameter}
          onSelectEntity={(kind, id) => {
            if (kind === 'node') {
              setSelectedNodeId(id);
              setSelectedElementId(null);
              setSelectedLoadId(null);
            } else if (kind === 'member') {
              setSelectedElementId(id);
              setSelectedNodeId(null);
              setSelectedLoadId(null);
            } else {
              setSelectedLoadId(id);
              setSelectedNodeId(null);
              setSelectedElementId(null);
            }
          }}
        />
      </main>
    </div>
  );
}

export default App;
