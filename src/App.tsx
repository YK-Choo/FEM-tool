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
  hitTestAllCanvasEntities,
  findNodeWithinRadius,
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
        id: 'pin_load_magnitude_L1',
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
        id: 'pin_load_magnitude_L3',
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
        id: 'pin_member_E_M3',
        label: 'Roof Slab Modulus E (M3)',
        kind: 'member_E',
        elementId: 'M3',
        baseValue: m3.material.E,
        multiplier: 1.0,
      });
    }
    const n5 = model.nodes.find((n) => n.id === 'N5');
    if (n5) {
      pins.push({
        id: 'pin_node_spring_ky_N5',
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
        id: 'pin_load_magnitude_L1',
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
        id: 'pin_load_magnitude_L2',
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
        id: 'pin_member_E_M2',
        label: 'Center Column Modulus E (M2)',
        kind: 'member_E',
        elementId: 'M2',
        baseValue: m2.material.E,
        multiplier: 1.0,
      });
    }
    return pins;
  }

  if (presetId === 'continuous_beam') {
    const n2 = model.nodes.find((n) => n.id === 'N2');
    if (n2) {
      pins.push({
        id: 'pin_node_spring_krz_N2',
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
        id: 'pin_load_magnitude_L1',
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
        id: 'pin_load_magnitude_L2',
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
      id: 'pin_load_magnitude_L2',
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
      id: 'pin_member_E_M6',
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

type DraftStartPoint = {
  x: number;
  y: number;
  nodeId?: string;
  splitElementId?: string;
};

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
  const [drawStartPoint, setDrawStartPointState] = React.useState<DraftStartPoint | null>(null);
  const [hoverProbe, setHoverProbe] = React.useState<HoverProbeData | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const loadHandlesRef = React.useRef<LoadScreenHandle[]>([]);

  // Synchronized mutable refs to prevent stale React state closures in pointer/mouse event handlers
  const modelRef = React.useRef<StructuralModel>(model);
  modelRef.current = model;
  const viewportRef = React.useRef<ViewportTransform>(viewport);
  viewportRef.current = viewport;
  const activeToolRef = React.useRef<ActiveToolMode>(activeTool);
  activeToolRef.current = activeTool;
  const drawStartPointRef = React.useRef<DraftStartPoint | null>(drawStartPoint);

  const setDrawStartPoint = (pt: DraftStartPoint | null) => {
    drawStartPointRef.current = pt;
    setDrawStartPointState(pt);
  };

  // Track click-through selection cycling at busy nodes (within 8 px of previous click)
  const lastSelectClickRef = React.useRef<{
    sx: number;
    sy: number;
    cycleIndex: number;
  }>({
    sx: -9999,
    sy: -9999,
    cycleIndex: 0,
  });

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
    const prev = modelRef.current;
    const next = updater(structuredClone(prev));
    modelRef.current = next;
    if (recordUndo) {
      setUndoStack((u) => [...u.slice(-29), prev]);
      setRedoStack([]);
    }
    setModel(next);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prevModel = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, modelRef.current]);
    modelRef.current = prevModel;
    setModel(prevModel);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextModel = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, modelRef.current]);
    modelRef.current = nextModel;
    setModel(nextModel);
  };

  // Fit structure to usable canvas area (excluding top toolbar height & open right-hand Sensitivity Panel width)
  const fitNodesToUsableCanvas = (nodesToFit: StructuralNode[]) => {
    const el = containerRef.current;
    const rect = el ? el.getBoundingClientRect() : null;
    const usableW = rect && rect.width > 0 ? rect.width : viewportRef.current.width;
    const usableH = rect && rect.height > 0 ? rect.height : viewportRef.current.height;
    setViewport((vp) => fitModelToViewport(nodesToFit, usableW, usableH, vp));
  };

  const handleSelectEntity = (kind: 'node' | 'member' | 'load', id: string) => {
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
  };

  const handleSelectPreset = (presetId: string) => {
    const found = BENCHMARK_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    const freshModel = structuredClone(found.model);
    setActivePresetId(presetId);
    setUndoStack([]);
    setRedoStack([]);
    modelRef.current = freshModel;
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

    fitNodesToUsableCanvas(freshModel.nodes);
  };

  // New Blank Project button handler: clears all nodes, members, loads, and sensitivity pins
  // into an empty 0.1 m Cartesian workspace while pushing previous state onto Undo stack
  const handleNewBlankProject = () => {
    const blankModel: StructuralModel = {
      name: 'Blank Project',
      dimension: '2d',
      nodes: [],
      elements: [],
      loads: [],
    };
    updateModelWithHistory(() => blankModel, true);
    setPinnedParams([]);
    setSelectedNodeId(null);
    setSelectedElementId(null);
    setSelectedLoadId(null);
    setDrawStartPoint(null);
    setHoverProbe(null);
    setViewport((vp) => ({ ...vp, coordSystem: 'cartesian' }));
    fitNodesToUsableCanvas([]);
    showToast('Cleared workspace to new 0.1 m Cartesian project (Ctrl+Z to undo).');
  };

  // Fit viewport on mount and container resize
  React.useEffect(() => {
    const updateSize = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewport((vp) =>
          fitModelToViewport(modelRef.current.nodes, rect.width, rect.height, vp)
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
    // 1. Reuse existing node if snap.nodeId is present and valid
    if (snap.kind === 'node' && snap.nodeId) {
      const exists = workingModel.nodes.find((n) => n.id === snap.nodeId);
      if (exists) {
        return { model: workingModel, nodeId: exists.id };
      }
    }

    // 2. Check if any existing node is already at (snap.x, snap.y)
    const existingAtCoord = workingModel.nodes.find(
      (n) => Math.hypot(n.x - snap.x, n.y - snap.y) < 0.04
    );
    if (existingAtCoord) {
      return { model: workingModel, nodeId: existingAtCoord.id };
    }

    // 3. Auto-split existing member at mid-span intersection
    if (snap.kind === 'member_segment' && snap.splitElementId) {
      let targetElId: string | undefined = snap.splitElementId;
      if (!workingModel.elements.some((e) => e.id === targetElId)) {
        // If the start point already split this member, find which sub-member contains (snap.x, snap.y)
        const nodeMap = new Map(workingModel.nodes.map((n) => [n.id, n]));
        for (const el of workingModel.elements) {
          if (el.kind !== 'frame2d') continue;
          const ni = nodeMap.get(el.nodeI);
          const nj = nodeMap.get(el.nodeJ);
          if (!ni || !nj) continue;
          const dx = nj.x - ni.x;
          const dy = nj.y - ni.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq < 1e-9) continue;
          const t = ((snap.x - ni.x) * dx + (snap.y - ni.y) * dy) / lenSq;
          if (t > 0.02 && t < 0.98) {
            const projX = ni.x + t * dx;
            const projY = ni.y + t * dy;
            if (Math.hypot(snap.x - projX, snap.y - projY) < 0.05) {
              targetElId = el.id;
              break;
            }
          }
        }
      }
      if (targetElId && workingModel.elements.some((e) => e.id === targetElId)) {
        const splitRes = splitMemberAtPoint(
          workingModel,
          targetElId,
          snap.x,
          snap.y
        );
        showToast(`Split member ${targetElId} at node ${splitRes.newNodeId} (${snap.x}m, ${snap.y}m)`);
        return { model: splitRes.model, nodeId: splitRes.newNodeId };
      }
    }

    // 4. Create and append a new StructuralNode (z = 0) at the 0.1 m grid coordinate
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
    startSnap: DraftStartPoint,
    endSnap: SnapResult
  ) => {
    if (Math.hypot(endSnap.x - startSnap.x, endSnap.y - startSnap.y) < 0.05) {
      return;
    }

    let createdElementId: string | null = null;

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

      createdElementId = newElId;

      return {
        ...working,
        elements: [...working.elements, newEl],
      };
    });

    if (createdElementId) {
      setSelectedNodeId(null);
      setSelectedLoadId(null);
      setSelectedElementId(createdElementId);
    }
  };

  // Canvas Mouse / Pointer Handlers
  const handleCanvasMouseDown = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const currentVp = viewportRef.current;
    const currentModel = modelRef.current;
    const currentTool = activeToolRef.current;

    // Middle mouse button or right mouse button -> pan
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      panDragRef.current = {
        active: true,
        startSx: sx,
        startSy: sy,
        origPanX: currentVp.panX,
        origPanY: currentVp.panY,
        moved: false,
      };
      return;
    }

    const currentSnap = computeSmartSnap(
      sx,
      sy,
      currentVp,
      currentModel.nodes,
      currentModel.elements
    );
    setSnapTarget(currentSnap);

    // 1. Draw Member Tool: supports both Two-Click (click start -> move -> click end)
    // and Click-and-Drag (mousedown start -> drag -> mouseup end)
    if (currentTool === 'draw_member') {
      const activeStart = drawStartPointRef.current;
      if (!activeStart) {
        setDrawStartPoint({
          x: currentSnap.x,
          y: currentSnap.y,
          nodeId: currentSnap.nodeId,
          splitElementId: currentSnap.splitElementId,
        });
      } else {
        completeDrawMember(activeStart, currentSnap);
        setDrawStartPoint(null);
      }
      return;
    }

    // 2. Assign Support Tool: generous 16 px screen-space node hit radius via worldToScreen
    if (currentTool === 'assign_support') {
      const nodeHit = findNodeWithinRadius(sx, sy, currentVp, currentModel.nodes, 16);
      if (nodeHit) {
        const targetNodeId = nodeHit.node.id;
        const order: StructuralNode['support'][] = [
          'pinned',
          'fixed',
          'rollerX',
          'rollerY',
          'none',
        ];
        let assignedSupport: StructuralNode['support'] = 'pinned';
        updateModelWithHistory((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => {
            if (n.id !== targetNodeId) return n;
            const curIdx = order.indexOf(n.support);
            const nextSup = order[(curIdx + 1) % order.length];
            assignedSupport = nextSup;
            return {
              ...n,
              support: nextSup,
              restraints: restraintsFromSupportPreset(nextSup),
            };
          }),
        }));
        setSelectedNodeId(targetNodeId);
        setSelectedElementId(null);
        setSelectedLoadId(null);
        showToast(`Node ${targetNodeId} support → ${assignedSupport}`);
      } else {
        showToast('Click within 16 px of any node to assign or cycle its support restraint.');
      }
      return;
    }

    // 3. Add Nodal Load Tool: generous 16 px screen-space node hit radius
    if (currentTool === 'add_nodal_load') {
      const nodeHit = findNodeWithinRadius(sx, sy, currentVp, currentModel.nodes, 16);
      if (nodeHit) {
        handleQuickAddNodalLoad(nodeHit.node.id);
      } else {
        showToast('Click any node to apply a concentrated Nodal Load (Fx, Fy, Mz).');
      }
      return;
    }

    const hit = hitTestCanvas(sx, sy, currentVp, currentModel, loadHandlesRef.current);

    // 4. Delete Tool
    if (currentTool === 'delete') {
      if (hit) {
        handleDeleteEntityById(
          hit.kind,
          hit.kind === 'node' ? hit.nodeId : hit.kind === 'member' ? hit.elementId : hit.loadId
        );
      }
      return;
    }

    // 5. Add Member Load Tool
    if (currentTool === 'add_member_load') {
      if (hit && hit.kind === 'member') {
        handleQuickAddMemberLoad(hit.elementId, 'distributed');
      } else {
        showToast('Click any member to apply a Distributed or Point Load.');
      }
      return;
    }

    // 6. Select / Inspect Tool: support Click-Through Cycling within 8 px over busy nodes!
    // Cycle order: Node -> Nodal Load #1 -> Nodal Load #2 (etc.) -> Connected Member(s) -> back to Node
    const allHits = hitTestAllCanvasEntities(
      sx,
      sy,
      currentVp,
      currentModel,
      loadHandlesRef.current
    );

    if (allHits.length > 0) {
      const prevClick = lastSelectClickRef.current;
      const distFromLastClick = Math.hypot(sx - prevClick.sx, sy - prevClick.sy);
      const nextCycleIdx =
        distFromLastClick <= 8 ? (prevClick.cycleIndex + 1) % allHits.length : 0;

      lastSelectClickRef.current = {
        sx,
        sy,
        cycleIndex: nextCycleIdx,
      };

      const chosen = allHits[nextCycleIdx];
      if (chosen.kind === 'node') {
        handleSelectEntity('node', chosen.nodeId);
      } else if (chosen.kind === 'load') {
        handleSelectEntity('load', chosen.loadId);
      } else if (chosen.kind === 'member') {
        handleSelectEntity('member', chosen.elementId);
      }
    } else {
      lastSelectClickRef.current = { sx: -9999, sy: -9999, cycleIndex: 0 };
      panDragRef.current = {
        active: true,
        startSx: sx,
        startSy: sy,
        origPanX: currentVp.panX,
        origPanY: currentVp.panY,
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
    const currentVp = viewportRef.current;
    const currentModel = modelRef.current;

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

    const currentSnap = computeSmartSnap(
      sx,
      sy,
      currentVp,
      currentModel.nodes,
      currentModel.elements
    );
    setSnapTarget(currentSnap);

    // Interactive Hover Probe along any member
    const probe = probeMemberAtCursor(sx, sy, currentVp, currentModel, solverOutput, 18);
    setHoverProbe(probe);
    setHoveredElementId(probe ? probe.element.id : null);
  };

  const handleCanvasMouseUp = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const currentVp = viewportRef.current;
    const currentModel = modelRef.current;
    const currentTool = activeToolRef.current;

    if (panDragRef.current.active) {
      const wasMoved = panDragRef.current.moved;
      panDragRef.current.active = false;
      if (!wasMoved && currentTool === 'select') {
        setSelectedNodeId(null);
        setSelectedElementId(null);
        setSelectedLoadId(null);
      }
      return;
    }

    // Support click-and-drag release in Draw Member mode (when dragged >= 0.1 m away from start)
    const activeStart = drawStartPointRef.current;
    if (currentTool === 'draw_member' && activeStart) {
      const currentSnap = computeSmartSnap(
        sx,
        sy,
        currentVp,
        currentModel.nodes,
        currentModel.elements
      );
      if (Math.hypot(currentSnap.x - activeStart.x, currentSnap.y - activeStart.y) >= 0.09) {
        completeDrawMember(activeStart, currentSnap);
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
    const currentModel = modelRef.current;
    const newLoadId = nextEntityId(
      'L',
      currentModel.loads.map((l) => l.id)
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
    handleSelectEntity('load', newLoadId);
  };

  const handleQuickAddNodalLoad = (nodeId: string) => {
    const currentModel = modelRef.current;
    const newLoadId = nextEntityId(
      'L',
      currentModel.loads.map((l) => l.id)
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
    handleSelectEntity('load', newLoadId);
  };

  // Pin a parameter to the Real-Time Sensitivity Panel (E, kx, ky, kθ, or Load magnitude)
  const handlePinParameter = (
    kind: PinnedParameterTarget['kind'],
    targetId: string
  ) => {
    const pinId = `pin_${kind}_${targetId}`;
    if (pinnedParams.some((p) => p.id === pinId)) {
      showToast('Parameter is already pinned to the Sensitivity Panel.');
      return;
    }

    const currentModel = modelRef.current;

    if (kind === 'member_E') {
      const el = currentModel.elements.find(
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
    } else if (kind === 'node_spring_kx') {
      const n = currentModel.nodes.find((item) => item.id === targetId);
      if (!n) return;
      const baseKx = n.springs.kx > 0 ? n.springs.kx : 25000;
      if (n.springs.kx === 0) {
        updateModelWithHistory((prev) => ({
          ...prev,
          nodes: prev.nodes.map((nd) =>
            nd.id === n.id ? { ...nd, springs: { ...nd.springs, kx: baseKx } } : nd
          ),
        }));
      }
      setPinnedParams((prev) => [
        ...prev,
        {
          id: pinId,
          label: `Node ${n.id} Spring kx`,
          kind: 'node_spring_kx',
          nodeId: n.id,
          baseValue: baseKx,
          multiplier: 1.0,
        },
      ]);
    } else if (kind === 'node_spring_ky') {
      const n = currentModel.nodes.find((item) => item.id === targetId);
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
      const n = currentModel.nodes.find((item) => item.id === targetId);
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
      const ld = currentModel.loads.find((l) => l.id === targetId);
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
      let next = prev;
      if (targetPin.kind === 'member_E') {
        const nextE = Number(Math.max(1, targetPin.baseValue * multiplier).toFixed(1));
        next = {
          ...prev,
          elements: prev.elements.map((el) =>
            el.id === targetPin.elementId && el.kind === 'frame2d'
              ? { ...el, material: { ...el.material, E: nextE } }
              : el
          ),
        };
      } else if (targetPin.kind === 'node_spring_kx') {
        const nextKx = Math.round(targetPin.baseValue * multiplier);
        next = {
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === targetPin.nodeId
              ? { ...n, springs: { ...n.springs, kx: nextKx } }
              : n
          ),
        };
      } else if (targetPin.kind === 'node_spring_ky') {
        const nextKy = Math.round(targetPin.baseValue * multiplier);
        next = {
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === targetPin.nodeId
              ? { ...n, springs: { ...n.springs, ky: nextKy } }
              : n
          ),
        };
      } else if (targetPin.kind === 'node_spring_krz') {
        const nextKrz = Math.round(targetPin.baseValue * multiplier);
        next = {
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === targetPin.nodeId
              ? { ...n, springs: { ...n.springs, krz: nextKrz } }
              : n
          ),
        };
      } else if (targetPin.kind === 'load_magnitude') {
        next = {
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
      modelRef.current = next;
      return next;
    });
  };

  const handleResetPinnedParams = () => {
    pinnedParams.forEach((p) => {
      handleSlidePinnedParam(p.id, 1.0);
    });
  };

  // JSON Export / Import
  const handleExportJson = () => {
    const json = JSON.stringify(modelRef.current, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${modelRef.current.name.toLowerCase().replace(/\s+/g, '_')}.fem.json`;
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
      fitNodesToUsableCanvas(parsed.nodes);
      showToast(`Imported "${parsed.name || 'Custom Model'}" successfully.`);
    } catch {
      showToast('Failed to parse JSON file.');
    }
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Top Toolbar */}
      <Toolbar
        activePresetId={activePresetId}
        onSelectPreset={handleSelectPreset}
        onNewProject={handleNewBlankProject}
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
        onFitView={() => fitNodesToUsableCanvas(modelRef.current.nodes)}
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
          className="relative flex-1 h-full overflow-hidden bg-white"
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
              className="absolute top-16 left-3 z-20 max-w-lg bg-red-50/95 border border-red-300 text-red-900 px-3.5 py-2 rounded-lg shadow-lg text-xs"
            >
              <div className="font-bold text-red-700 uppercase tracking-wide mb-0.5">
                Unstable Structure — Mechanism or Insufficient Restraints
              </div>
              <div className="text-red-600 font-mono text-[11px]">
                {solverOutput.instabilityReason ||
                  'Add supports, springs, or restrain free hinge mechanisms to restore stability.'}
              </div>
            </div>
          ) : null}

          {/* Toast Feedback Notification */}
          {toastMessage ? (
            <div className="absolute top-16 right-4 z-30 bg-white/95 border border-blue-300 text-blue-800 px-3 py-1.5 rounded-lg shadow-md text-xs font-mono">
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
                : activeTool === 'delete' || activeTool === 'assign_support'
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
            onSelectEntity={handleSelectEntity}
          />

          {/* Bottom CAD Status & Coordinate HUD Bar */}
          <div className="absolute bottom-0 inset-x-0 h-7 bg-white/95 backdrop-blur border-t border-slate-200 px-3 flex items-center justify-between text-[11px] font-mono text-slate-600 select-none pointer-events-none">
            <div className="flex items-center gap-4">
              <span className="text-blue-700 font-semibold">
                {snapTarget
                  ? `X: ${snapTarget.x.toFixed(1)} m, Y: ${snapTarget.y.toFixed(1)} m (Z: 0.0 m)`
                  : 'X: 0.0 m, Y: 0.0 m'}
              </span>
              <span className="hidden sm:inline text-slate-300">|</span>
              <span className="hidden sm:inline text-slate-600">
                {activeTool === 'select'
                  ? 'Click any Member, Node, or Load to edit (click repeatedly on busy node to cycle) · Drag background to pan'
                  : activeTool === 'draw_member'
                    ? drawStartPoint
                      ? 'Click or release on end point (snaps to 0.1m grid, existing nodes, or T-splits members)'
                      : 'Click or drag from start point to draw new 1D Frame Member'
                    : activeTool === 'assign_support'
                      ? 'Click any node (16 px radius) to cycle support: Pinned → Fixed → Roller X → Roller Y → None'
                      : activeTool === 'add_nodal_load'
                        ? 'Click any node to add a concentrated Nodal Load'
                        : activeTool === 'add_member_load'
                          ? 'Click any member to add a Distributed (UDL/Trapezoidal) or Point Load'
                          : 'Click any Member, Node, or Load to delete it'}
              </span>
            </div>

            <div className="flex items-center gap-3 text-slate-500">
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
          onSelectEntity={handleSelectEntity}
          onCollapseChange={() => {
            setTimeout(() => {
              const el = containerRef.current;
              if (!el) return;
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                setViewport((vp) => ({
                  ...vp,
                  width: rect.width,
                  height: rect.height,
                }));
              }
            }, 0);
          }}
        />
      </main>
    </div>
  );
}

export default App;
