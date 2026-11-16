import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitMemberAtPoint,
  canAddMember,
  probeMemberAtCursor,
} from '../src/utils/geometry.ts';
import {
  polarToCartesian,
  cartesianToPolar,
  computeSmartSnap,
  fitModelToViewport,
} from '../src/utils/coordinates.ts';
import { analyzeStructure } from '../src/solver/index.ts';
import { createBoxCulvertPreset, createContinuousBeamPreset } from '../src/presets/benchmarks.ts';
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
