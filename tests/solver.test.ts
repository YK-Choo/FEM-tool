import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeStructure,
  computeCrossSection,
  createMaterialFromPreset,
  restraintsFromSupportPreset,
} from '../src/solver/index.ts';
import { BENCHMARK_PRESETS } from '../src/presets/benchmarks.ts';
import type { StructuralModel } from '../src/types/model.ts';

test('1. Propped Cantilever under Trapezoidal Load & End Hinge Static Condensation', () => {
  const mat = createMaterialFromPreset('steel'); // E = 200 GPa
  const sec = computeCrossSection('rectangular', { b: 200, h: 400 });
  // Fixed at Node 1 (x=0), RollerX at Node 2 (x=6m), with releaseEnd = true on element
  const L = 6.0;
  const w = -24; // 24 kN/m downward
  const model: StructuralModel = {
    name: 'Propped Cantilever UDL',
    dimension: '2d',
    nodes: [
      {
        id: 'N1',
        x: 0,
        y: 0,
        z: 0,
        support: 'fixed',
        restraints: restraintsFromSupportPreset('fixed'),
        springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
      },
      {
        id: 'N2',
        x: L,
        y: 0,
        z: 0,
        support: 'rollerX',
        restraints: restraintsFromSupportPreset('rollerX'),
        springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
      },
    ],
    elements: [
      {
        id: 'M1',
        kind: 'frame2d',
        nodeI: 'N1',
        nodeJ: 'N2',
        section: sec,
        material: mat,
        releaseStart: false,
        releaseEnd: true, // Hinge at right end
      },
    ],
    loads: [
      {
        id: 'L1',
        kind: 'member_distributed',
        elementId: 'M1',
        w1: w,
        w2: w,
        direction: 'local_perp',
      },
    ],
  };

  const res = analyzeStructure(model, 60);
  assert.equal(res.stable, true);

  // Exact textbook propped cantilever reactions for downward UDL |w| = 24 kN/m, L = 6 m:
  // R_y1 = 5/8 * |w| * L = 5/8 * 144 = 90 kN
  // R_y2 = 3/8 * |w| * L = 3/8 * 144 = 54 kN
  // M_z1 = 1/8 * |w| * L^2 = 1/8 * 24 * 36 = 108 kNm
  assert.ok(Math.abs(res.nodeResults['N1'].reactionFy - 90) < 1e-6);
  assert.ok(Math.abs(res.nodeResults['N2'].reactionFy - 54) < 1e-6);
  assert.ok(Math.abs(res.nodeResults['N1'].reactionMz - 108) < 1e-6);
  // End moment at hinged end N2 must be identically 0:
  const elRes = res.elementResults['M1'];
  assert.ok(Math.abs(elRes.stations[elRes.stations.length - 1].M) < 1e-6);
});

test('2. Fixed-Fixed Beam under Linearly Varying Trapezoidal Load (Exact FEF Check)', () => {
  const mat = createMaterialFromPreset('concrete');
  const sec = computeCrossSection('rectangular', { b: 300, h: 500 });
  const L = 5.0;
  const w1 = 10; // +10 kN/m in local +y at x=0
  const w2 = 45; // +45 kN/m in local +y at x=L

  const model: StructuralModel = {
    name: 'Fixed-Fixed Trapezoidal Load',
    dimension: '2d',
    nodes: [
      {
        id: 'N1',
        x: 0,
        y: 0,
        z: 0,
        support: 'fixed',
        restraints: restraintsFromSupportPreset('fixed'),
        springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
      },
      {
        id: 'N2',
        x: L,
        y: 0,
        z: 0,
        support: 'fixed',
        restraints: restraintsFromSupportPreset('fixed'),
        springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
      },
    ],
    elements: [
      {
        id: 'M1',
        kind: 'frame2d',
        nodeI: 'N1',
        nodeJ: 'N2',
        section: sec,
        material: mat,
        releaseStart: false,
        releaseEnd: false,
      },
    ],
    loads: [
      {
        id: 'L1',
        kind: 'member_distributed',
        elementId: 'M1',
        w1,
        w2,
        direction: 'local_perp',
      },
    ],
  };

  const res = analyzeStructure(model, 50);
  assert.equal(res.stable, true);

  // Exact FEF formulas from specification:
  // VF1 = (L/20)*(7*w1 + 3*w2), VF2 = (L/20)*(3*w1 + 7*w2)
  // MF1 = (L^2/60)*(3*w1 + 2*w2), MF2 = -(L^2/60)*(2*w1 + 3*w2)
  const expectedVF1 = (L / 20) * (7 * w1 + 3 * w2);
  const expectedVF2 = (L / 20) * (3 * w1 + 7 * w2);
  const expectedMF1 = ((L * L) / 60) * (3 * w1 + 2 * w2);
  const expectedMF2 = -((L * L) / 60) * (2 * w1 + 3 * w2);

  // Fixed support reactions oppose the equivalent nodal forces:
  assert.ok(Math.abs(res.nodeResults['N1'].reactionFy - -expectedVF1) < 1e-6);
  assert.ok(Math.abs(res.nodeResults['N2'].reactionFy - -expectedVF2) < 1e-6);
  assert.ok(Math.abs(res.nodeResults['N1'].reactionMz - -expectedMF1) < 1e-6);
  assert.ok(Math.abs(res.nodeResults['N2'].reactionMz - -expectedMF2) < 1e-6);
});

test('3. Custom Inclined Roller Support Transformation', () => {
  const mat = createMaterialFromPreset('steel');
  const sec = computeCrossSection('rectangular', { b: 200, h: 300 });
  // Horizontal beam supported by Pinned at N1(0,0) and Inclined Roller at N2(4,0) with angle alpha = 30 deg
  const model: StructuralModel = {
    name: 'Inclined Roller Test',
    dimension: '2d',
    nodes: [
      {
        id: 'N1',
        x: 0,
        y: 0,
        z: 0,
        support: 'pinned',
        restraints: restraintsFromSupportPreset('pinned'),
        springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
      },
      {
        id: 'N2',
        x: 4,
        y: 0,
        z: 0,
        support: 'inclinedRoller',
        inclinedAngleDeg: 30,
        restraints: restraintsFromSupportPreset('inclinedRoller'),
        springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
      },
    ],
    elements: [
      {
        id: 'M1',
        kind: 'frame2d',
        nodeI: 'N1',
        nodeJ: 'N2',
        section: sec,
        material: mat,
        releaseStart: false,
        releaseEnd: false,
      },
    ],
    loads: [
      {
        id: 'L1',
        kind: 'member_point',
        elementId: 'M1',
        p: -40,
        a: 2.0,
        direction: 'global_y',
      },
    ],
  };

  const res = analyzeStructure(model);
  assert.equal(res.stable, true);
  // At N2, displacement perpendicular to 30 deg incline must be zero:
  // u_n = -dx * sin(30) + dy * cos(30) = 0
  const n2 = res.nodeResults['N2'];
  const rad = (30 * Math.PI) / 180;
  const un = -n2.dxMm * Math.sin(rad) + n2.dyMm * Math.cos(rad);
  assert.ok(Math.abs(un) < 1e-6);
  // And reaction along the 30 deg incline (tangent) must be zero:
  const rt = n2.reactionFx * Math.cos(rad) + n2.reactionFy * Math.sin(rad);
  assert.ok(Math.abs(rt) < 1e-6);
});

test('4. All 4 Built-in Preset Benchmarks Solve Cleanly and Equilibrate', () => {
  for (const preset of BENCHMARK_PRESETS) {
    const res = analyzeStructure(preset.model);
    assert.equal(res.stable, true, `Preset ${preset.id} should be stable`);
    assert.ok(res.globalMaxDeflectionMm > 0, `Preset ${preset.id} should have non-zero deflection`);
    assert.ok(res.globalMaxSigmaMpa > 0, `Preset ${preset.id} should have non-zero stress`);

    if (preset.id === 'pratt_truss') {
      // Pratt Truss has pin-ended members with nodal loads only -> zero bending moment everywhere
      assert.ok(res.globalMaxM < 1e-6, 'Pratt truss should have pure axial behavior (M = 0)');
      assert.ok(res.globalMaxN > 50, 'Pratt truss should carry axial forces');
    }
  }
});

test('5. Unstable Mechanism Detection Catches Insufficient Restraints Without NaN', () => {
  const mat = createMaterialFromPreset('steel');
  const sec = computeCrossSection('rectangular', { b: 200, h: 300 });
  // Beam on two horizontal rollers (no horizontal X restraint anywhere!) under horizontal load
  const model: StructuralModel = {
    name: 'Mechanism Test',
    dimension: '2d',
    nodes: [
      {
        id: 'N1',
        x: 0,
        y: 0,
        z: 0,
        support: 'rollerX',
        restraints: restraintsFromSupportPreset('rollerX'),
        springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
      },
      {
        id: 'N2',
        x: 4,
        y: 0,
        z: 0,
        support: 'rollerX',
        restraints: restraintsFromSupportPreset('rollerX'),
        springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
      },
    ],
    elements: [
      {
        id: 'M1',
        kind: 'frame2d',
        nodeI: 'N1',
        nodeJ: 'N2',
        section: sec,
        material: mat,
        releaseStart: false,
        releaseEnd: false,
      },
    ],
    loads: [
      {
        id: 'L1',
        kind: 'nodal',
        nodeId: 'N1',
        fx: 25,
        fy: -10,
        mz: 0,
      },
    ],
  };

  const res = analyzeStructure(model);
  assert.equal(res.stable, false);
  assert.equal(res.statusMessage, 'Unstable Structure');
});
