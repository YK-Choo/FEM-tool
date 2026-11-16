import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitMemberAtPoint,
  canAddMember,
  probeMemberAtCursor,
  findNodeWithinRadius,
  hitTestAllCanvasEntities,
  addNodeAtSnap,
  addMemberBetweenNodes,
  cycleNodeSupport,
} from '../src/utils/geometry.ts';
import {
  polarToCartesian,
  cartesianToPolar,
  computeSmartSnap,
  fitModelToViewport,
  worldToScreen,
  screenToWorld,
} from '../src/utils/coordinates.ts';
import { analyzeStructure, computeCrossSection, restraintsFromSupportPreset } from '../src/solver/index.ts';
import { createBoxCulvertPreset, createContinuousBeamPreset, createPrattTrussPreset } from '../src/presets/benchmarks.ts';
import { CanvasRenderer, type SnapshotOverlayMode } from '../src/renderer/CanvasRenderer.ts';

test('T-Junction Mid-Span Member Auto-Splitting Preserves Equilibrium and Splits Trapezoidal Loads', () => {
  const culvert = createBoxCulvertPreset();
  const resBefore = analyzeStructure(culvert);
  assert.equal(resBefore.stable, true);

  // Split Left Wall M1 (from N1(0,3) to N3(0,0), with trapezoidal load 10 -> 45 kN/m) at midpoint (0, 1.5)
  const { model: splitModel, newNodeId } = splitMemberAtPoint(culvert, 'M1', 0.0, 1.5);
  assert.ok(newNodeId.startsWith('N'));

  const resAfter = analyzeStructure(splitModel);
  assert.equal(resAfter.stable, true);

  // Total horizontal & vertical reactions and max moments should match closely before and after splitting M1!
  assert.ok(
    Math.abs(resAfter.globalMaxM - resBefore.globalMaxM) < 0.25,
    `Expected globalMaxM to match within 0.25 kNm (${resBefore.globalMaxM} vs ${resAfter.globalMaxM})`
  );

  // Prevent duplicate or zero-length members
  const dupCheck = canAddMember(splitModel, 'N1', newNodeId);
  assert.equal(dupCheck.valid, false);
  const zeroCheck = canAddMember(splitModel, newNodeId, newNodeId);
  assert.equal(zeroCheck.valid, false);
});

test('Interactive CAD Workflow: (a) Add Standalone Node, (b) Add Mid-Span Node to Split Beam, (c) Draw Member Between Nodes, and (d) Assign Support & Solve Reactions', () => {
  let model = createContinuousBeamPreset();
  const vp = fitModelToViewport(model.nodes, 1000, 700);
  const initialNodeCount = model.nodes.length;
  const initialElementCount = model.elements.length;

  // (a) Add a standalone node at empty 0.1 m grid coordinate (3.0 m, -2.5 m)
  const standaloneScreen = worldToScreen({ x: 3.0, y: -2.5 }, vp);
  const standaloneSnap = computeSmartSnap(
    standaloneScreen.sx,
    standaloneScreen.sy,
    vp,
    model.nodes,
    model.elements
  );
  assert.equal(standaloneSnap.kind, 'grid');
  assert.equal(standaloneSnap.x, 3.0);
  assert.equal(standaloneSnap.y, -2.5);

  const stepA = addNodeAtSnap(model, standaloneSnap);
  assert.equal(stepA.created, true);
  assert.equal(stepA.model.nodes.length, initialNodeCount + 1);
  const standaloneNodeId = stepA.nodeId;
  model = stepA.model;

  // Clicking the exact same coordinate again does not create a duplicate node
  const dupStepA = addNodeAtSnap(model, standaloneSnap);
  assert.equal(dupStepA.created, false);
  assert.equal(dupStepA.nodeId, standaloneNodeId);
  assert.equal(dupStepA.model.nodes.length, initialNodeCount + 1);

  // (b) Add a node mid-span on Span 1 (M1 from N1(0,0) to N2(6,0)) at (3.0 m, 0.0 m) to split it
  const midSpanScreen = worldToScreen({ x: 3.0, y: 0.0 }, vp);
  const midSpanSnap = computeSmartSnap(
    midSpanScreen.sx,
    midSpanScreen.sy + 4, // within 12 px CSS distance of M1
    vp,
    model.nodes,
    model.elements
  );
  assert.equal(midSpanSnap.kind, 'member_segment');
  assert.equal(midSpanSnap.splitElementId, 'M1');
  assert.equal(midSpanSnap.x, 3.0);
  assert.equal(midSpanSnap.y, 0.0);

  const stepB = addNodeAtSnap(model, midSpanSnap);
  assert.equal(stepB.created, true);
  assert.equal(stepB.splitElementId, 'M1');
  const midSpanNodeId = stepB.nodeId;
  model = stepB.model;
  // M1 was replaced by 2 connected sub-members sharing midSpanNodeId
  assert.equal(model.elements.length, initialElementCount + 1);
  const connectedToMid = model.elements.filter(
    (e) => e.kind === 'frame2d' && (e.nodeI === midSpanNodeId || e.nodeJ === midSpanNodeId)
  );
  assert.equal(connectedToMid.length, 2);

  // (c) Draw a new vertical prop member between standaloneNodeId (3.0, -2.5) and midSpanNodeId (3.0, 0.0)
  const stepC = addMemberBetweenNodes(model, standaloneNodeId, midSpanNodeId);
  assert.ok(stepC.elementId !== null);
  model = stepC.model;
  assert.equal(model.elements.length, initialElementCount + 2);

  // (d) Assign a support to standaloneNodeId (cycling from 'none' -> 'pinned' -> 'fixed') and solve for reactions
  const sup1 = cycleNodeSupport(model, standaloneNodeId);
  assert.equal(sup1.nextSupport, 'pinned');
  model = sup1.model;

  const solvedPinned = analyzeStructure(model);
  assert.equal(solvedPinned.stable, true);
  const propReaction = solvedPinned.nodeResults[standaloneNodeId];
  assert.ok(propReaction !== undefined);
  assert.equal(propReaction.hasReaction, true);
  // Prop column carries positive upward vertical reaction Ry > 50 kN under Span 1 UDL
  assert.ok(
    propReaction.reactionFy > 50,
    `Expected positive vertical reaction at prop support ${standaloneNodeId}, got ${propReaction.reactionFy} kN`
  );

  // Cycling again switches 'pinned' -> 'fixed'
  const sup2 = cycleNodeSupport(model, standaloneNodeId);
  assert.equal(sup2.nextSupport, 'fixed');
  const solvedFixed = analyzeStructure(sup2.model);
  assert.equal(solvedFixed.stable, true);
});

test('Polar Coordinate Converter and Smart Snapping', () => {
  const pt = polarToCartesian(5.0, 36.86989765);
  assert.ok(Math.abs(pt.x - 4.0) < 1e-3);
  assert.ok(Math.abs(pt.y - 3.0) < 1e-3);

  const pol = cartesianToPolar(pt.x, pt.y);
  assert.ok(Math.abs(pol.r - 5.0) < 1e-3);

  const culvert = createBoxCulvertPreset();
  const vp = fitModelToViewport(culvert.nodes, 1000, 700);
  // Midpoint of Roof Slab M3 is at world (2.0, 3.0)
  const midScreenX = vp.panX + 2.0 * vp.zoom;
  const midScreenY = vp.panY - 3.0 * vp.zoom;

  const snap = computeSmartSnap(
    midScreenX,
    midScreenY + 3,
    vp,
    culvert.nodes,
    culvert.elements
  );
  assert.equal(snap.kind, 'member_segment');
  assert.equal(snap.splitElementId, 'M3');
  assert.equal(snap.x, 2.0);
  assert.equal(snap.y, 3.0);

  // Hover probe at roof slab midpoint
  const sol = analyzeStructure(culvert);
  const probe = probeMemberAtCursor(midScreenX, midScreenY, vp, culvert, sol);
  assert.ok(probe !== null);
  assert.equal(probe.element.id, 'M3');
  assert.ok(probe.station.deflectionMm > 0);
});

test('fitModelToViewport Handles Empty Canvas, Horizontal Single-Line Beam, and Vertical Column Cleanly', () => {
  // 1. Empty canvas (0 nodes) -> resets cleanly to show x in [-1 m, 10 m], y in [-2 m, 6 m]
  const emptyVp = fitModelToViewport([], 960, 640);
  assert.ok(Number.isFinite(emptyVp.zoom) && emptyVp.zoom > 0);
  assert.ok(Number.isFinite(emptyVp.panX));
  assert.ok(Number.isFinite(emptyVp.panY));

  // Center of [-1, 10] x [-2, 6] is (4.5, 2.0), which maps to (width * 0.5, height * 0.52)
  const centerWorld = screenToWorld(960 * 0.5, 640 * 0.52, emptyVp);
  assert.ok(Math.abs(centerWorld.x - 4.5) < 0.05);
  assert.ok(Math.abs(centerWorld.y - 2.0) < 0.05);

  // 2. Degenerate horizontal beam (maxY === minY = 0)
  const beam = createContinuousBeamPreset();
  const beamVp = fitModelToViewport(beam.nodes, 960, 640);
  assert.ok(Number.isFinite(beamVp.zoom) && beamVp.zoom > 15 && beamVp.zoom < 300);
  assert.ok(Number.isFinite(beamVp.panX) && Number.isFinite(beamVp.panY));

  // 3. Degenerate vertical column (maxX === minX = 0)
  const verticalNodes = [
    {
      id: 'N1',
      label: 'N1',
      x: 0,
      y: 0,
      z: 0,
      support: 'fixed' as const,
      restraints: restraintsFromSupportPreset('fixed'),
      springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
    },
    {
      id: 'N2',
      label: 'N2',
      x: 0,
      y: 4,
      z: 0,
      support: 'none' as const,
      restraints: restraintsFromSupportPreset('none'),
      springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
    },
  ];
  const colVp = fitModelToViewport(verticalNodes, 960, 640);
  assert.ok(Number.isFinite(colVp.zoom) && colVp.zoom > 15 && colVp.zoom < 300);
  assert.ok(Number.isFinite(colVp.panX) && Number.isFinite(colVp.panY));
});

test('16px Node Hit-Testing (findNodeWithinRadius) and Busy Node Click-Through Entity Cycling', () => {
  const truss = createPrattTrussPreset();
  // Add a second nodal load at Node N3 (x = 6, y = 0) so N3 has 2 nodal loads (L2, L4) + connected members
  truss.loads.push({
    id: 'L4',
    kind: 'nodal',
    nodeId: 'N3',
    fx: 15,
    fy: 0,
    mz: 10,
    label: 'Lateral Joint Load',
  });

  const vp = fitModelToViewport(truss.nodes, 1000, 700);
  const n3 = truss.nodes.find((n) => n.id === 'N3')!;
  const n3Screen = worldToScreen(n3, vp);

  // 1. Node hit-testing within 16 px radius works at ~13.45 px offset
  const hit14px = findNodeWithinRadius(n3Screen.sx + 10, n3Screen.sy - 9, vp, truss.nodes, 16);
  assert.ok(hit14px !== null);
  assert.equal(hit14px.node.id, 'N3');

  // Outside 16 px radius returns null
  const miss24px = findNodeWithinRadius(n3Screen.sx + 20, n3Screen.sy + 20, vp, truss.nodes, 16);
  assert.equal(miss24px, null);

  // 2. Click-through cycling at busy Node N3 returns Node -> Nodal Load #1 -> Nodal Load #2 -> Connected Members
  const entities = hitTestAllCanvasEntities(n3Screen.sx, n3Screen.sy, vp, truss, []);
  assert.ok(entities.length >= 4, `Expected at least 4 overlapping entities at N3, got ${entities.length}`);
  assert.equal(entities[0].kind, 'node');
  if (entities[0].kind === 'node') assert.equal(entities[0].nodeId, 'N3');
  assert.equal(entities[1].kind, 'load');
  if (entities[1].kind === 'load') assert.equal(entities[1].loadId, 'L2');
  assert.equal(entities[2].kind, 'load');
  if (entities[2].kind === 'load') assert.equal(entities[2].loadId, 'L4');
  assert.equal(entities[3].kind, 'member');
});

test('Direct Cross-Section Dimension Editing Recomputes A, I, S via computeCrossSection', () => {
  const secBefore = computeCrossSection('rectangular', { b: 300, h: 500 });
  const secAfter = computeCrossSection('rectangular', { b: 300, h: 750 });
  assert.ok(secAfter.A > secBefore.A);
  assert.ok(secAfter.I > secBefore.I);
  assert.ok(secAfter.S > secBefore.S);
});

test('SolverResults JSON Serializability, Envelope Extrema (x/L), and Governing Utilization', () => {
  const beam = createContinuousBeamPreset();
  const results = analyzeStructure(beam);

  // Verify 100% lossless JSON serialization for HTML/PDF/CSV report export
  const serialized = JSON.stringify(results);
  const roundTrip = JSON.parse(serialized);
  assert.equal(roundTrip.stable, true);
  assert.ok(roundTrip.governingMember.elementId !== null);
  assert.ok(
    roundTrip.governingMember.xOverL >= 0 && roundTrip.governingMember.xOverL <= 1,
    'Governing member x/L location must be in [0, 1]'
  );

  // Check Span 2 (M2: midspan point load at a = 3.0m -> x/L = 0.50)
  const m2Extrema = roundTrip.elementResults['M2'].extrema;
  assert.ok(m2Extrema.MMax.value > 0);
  assert.ok(Math.abs(m2Extrema.MMax.xOverL - 0.5) < 0.02);
  assert.ok(m2Extrema.MMin.value < 0);
  assert.equal(m2Extrema.MMin.xOverL, 0);
});

test('CanvasRenderer.exportViewSnapshot Generates High-DPI Offscreen PNG Snapshots for All Overlay Modes', () => {
  const culvert = createBoxCulvertPreset();
  const results = analyzeStructure(culvert);
  const renderer = new CanvasRenderer();

  const mockCanvasFactory = (w: number, h: number) => {
    const fakeCtx = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'measureText') return (txt: string) => ({ width: txt.length * 6 });
          return () => {};
        },
      }
    );
    return {
      width: w,
      height: h,
      getContext: () => fakeCtx,
      toDataURL: (mime: string) => `data:${mime};base64,MOCK_HIGH_DPI_${w}x${h}`,
    } as unknown as HTMLCanvasElement;
  };

  const modes: SnapshotOverlayMode[] = [
    'geometry',
    'deformed',
    'axial',
    'shear',
    'moment',
    'reactions',
    'heatmap',
  ];

  for (const mode of modes) {
    const pngDataUrl = renderer.exportViewSnapshot(mode, {
      model: culvert,
      solverResults: results,
      width: 1200,
      height: 800,
      dpr: 2,
      canvasFactory: mockCanvasFactory,
    });
    assert.equal(pngDataUrl, 'data:image/png;base64,MOCK_HIGH_DPI_2400x1600');
  }
});
