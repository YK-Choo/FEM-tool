import type { StructuralModel, StructuralNode, Frame2DElement, StructuralLoad } from '../types/model.ts';
import {
  computeCrossSection,
  createMaterialFromPreset,
  restraintsFromSupportPreset,
} from '../solver/sections.ts';

function makeNode(
  id: string,
  label: string,
  x: number,
  y: number,
  support: StructuralNode['support'] = 'none',
  springs: Partial<StructuralNode['springs']> = {},
  inclinedAngleDeg?: number
): StructuralNode {
  return {
    id,
    label,
    x,
    y,
    z: 0,
    support,
    inclinedAngleDeg,
    restraints: restraintsFromSupportPreset(support),
    springs: {
      kx: springs.kx ?? 0,
      ky: springs.ky ?? 0,
      kz: 0,
      krx: 0,
      kry: 0,
      krz: springs.krz ?? 0,
    },
  };
}

export interface BenchmarkPreset {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  model: StructuralModel;
}

/**
 * 1. Underground Box Culvert:
 * Closed rectangular concrete frame (4.0m wide x 3.0m high) with lateral trapezoidal
 * earth/water pressure on both walls (w1 = 10 kN/m at top to w2 = 45 kN/m at base),
 * uniform roof surcharge (-35 kN/m), and elastic vertical soil springs along the base slab.
 */
export function createBoxCulvertPreset(): StructuralModel {
  const concrete = createMaterialFromPreset('concrete'); // E = 30 GPa, fy = 35 MPa
  const wallSec = computeCrossSection('rectangular', { b: 1000, h: 350 }, { name: 'Wall 1000×350 mm' });
  const roofSec = computeCrossSection('rectangular', { b: 1000, h: 400 }, { name: 'Roof Slab 1000×400 mm' });
  const baseSec = computeCrossSection('rectangular', { b: 1000, h: 450 }, { name: 'Base Slab 1000×450 mm' });

  // Base slab subdivided at x = 0, 1.0, 2.0, 3.0, 4.0 m with vertical elastic soil springs (Winkler subgrade)
  // Lateral soil friction springs kx provided at base nodes for horizontal stability
  const nodes: StructuralNode[] = [
    makeNode('N1', 'N1 (Top-Left)', 0.0, 3.0, 'none'),
    makeNode('N2', 'N2 (Top-Right)', 4.0, 3.0, 'none'),
    makeNode('N3', 'N3 (Base-0m)', 0.0, 0.0, 'none', { kx: 15000, ky: 25000 }),
    makeNode('N4', 'N4 (Base-1m)', 1.0, 0.0, 'none', { ky: 40000 }),
    makeNode('N5', 'N5 (Base-2m)', 2.0, 0.0, 'none', { kx: 20000, ky: 40000 }),
    makeNode('N6', 'N6 (Base-3m)', 3.0, 0.0, 'none', { ky: 40000 }),
    makeNode('N7', 'N7 (Base-4m)', 4.0, 0.0, 'none', { kx: 15000, ky: 25000 }),
  ];

  // Note: Left wall M1 goes from Top-Left (N1, x=0 along member) to Base-Left (N3, x=L along member)
  // so w1 = 10 kN/m is at top and w2 = 45 kN/m is at base!
  // Right wall M2 goes from Top-Right (N2, x=0 along member) to Base-Right (N7, x=L along member)
  // so w1 = -10 kN/m (leftward) is at top and w2 = -45 kN/m (leftward) is at base!
  const elements: Frame2DElement[] = [
    {
      id: 'M1',
      kind: 'frame2d',
      label: 'Left Wall',
      nodeI: 'N1',
      nodeJ: 'N3',
      section: wallSec,
      material: concrete,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M2',
      kind: 'frame2d',
      label: 'Right Wall',
      nodeI: 'N2',
      nodeJ: 'N7',
      section: wallSec,
      material: concrete,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M3',
      kind: 'frame2d',
      label: 'Roof Slab',
      nodeI: 'N1',
      nodeJ: 'N2',
      section: roofSec,
      material: concrete,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M4',
      kind: 'frame2d',
      label: 'Base Slab 1',
      nodeI: 'N3',
      nodeJ: 'N4',
      section: baseSec,
      material: concrete,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M5',
      kind: 'frame2d',
      label: 'Base Slab 2',
      nodeI: 'N4',
      nodeJ: 'N5',
      section: baseSec,
      material: concrete,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M6',
      kind: 'frame2d',
      label: 'Base Slab 3',
      nodeI: 'N5',
      nodeJ: 'N6',
      section: baseSec,
      material: concrete,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M7',
      kind: 'frame2d',
      label: 'Base Slab 4',
      nodeI: 'N6',
      nodeJ: 'N7',
      section: baseSec,
      material: concrete,
      releaseStart: false,
      releaseEnd: false,
    },
  ];

  const loads: StructuralLoad[] = [
    {
      id: 'L1',
      kind: 'member_distributed',
      elementId: 'M1',
      w1: 10,
      w2: 45,
      direction: 'global_x',
      label: 'Left Earth+Water Pressure',
    },
    {
      id: 'L2',
      kind: 'member_distributed',
      elementId: 'M2',
      w1: -10,
      w2: -45,
      direction: 'global_x',
      label: 'Right Earth+Water Pressure',
    },
    {
      id: 'L3',
      kind: 'member_distributed',
      elementId: 'M3',
      w1: -36,
      w2: -36,
      direction: 'global_y',
      label: 'Roof Soil Overburden',
    },
  ];

  return {
    name: 'Underground Box Culvert',
    description:
      'Closed RC culvert with lateral trapezoidal earth/water pressure (10 to 45 kN/m), roof surcharge, and Winkler soil springs.',
    dimension: '2d',
    nodes,
    elements,
    loads,
  };
}

/**
 * 2. 2-Bay Indeterminate Portal Frame:
 * Steel columns and rafters with a horizontal wind point load and roof UDL.
 */
export function createTwoBayPortalPreset(): StructuralModel {
  const steel = createMaterialFromPreset('steel'); // E = 200 GPa, fy = 355 MPa
  const colSec = computeCrossSection(
    'i_section',
    { h: 360, b: 170, tw: 8.0, tf: 12.7 },
    { name: 'IPE 360 Column' }
  );
  const rafterSec = computeCrossSection(
    'i_section',
    { h: 400, b: 180, tw: 8.6, tf: 13.5 },
    { name: 'IPE 400 Rafter' }
  );

  const nodes: StructuralNode[] = [
    makeNode('N1', 'Base Left', 0.0, 0.0, 'fixed'),
    makeNode('N2', 'Base Center', 6.0, 0.0, 'fixed'),
    makeNode('N3', 'Base Right', 12.0, 0.0, 'fixed'),
    makeNode('N4', 'Eave Left', 0.0, 4.5, 'none'),
    makeNode('N5', 'Eave Center', 6.0, 4.5, 'none'),
    makeNode('N6', 'Eave Right', 12.0, 4.5, 'none'),
  ];

  const elements: Frame2DElement[] = [
    {
      id: 'M1',
      kind: 'frame2d',
      label: 'Left Column',
      nodeI: 'N1',
      nodeJ: 'N4',
      section: colSec,
      material: steel,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M2',
      kind: 'frame2d',
      label: 'Center Column',
      nodeI: 'N2',
      nodeJ: 'N5',
      section: colSec,
      material: steel,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M3',
      kind: 'frame2d',
      label: 'Right Column',
      nodeI: 'N3',
      nodeJ: 'N6',
      section: colSec,
      material: steel,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M4',
      kind: 'frame2d',
      label: 'Bay 1 Rafter',
      nodeI: 'N4',
      nodeJ: 'N5',
      section: rafterSec,
      material: steel,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M5',
      kind: 'frame2d',
      label: 'Bay 2 Rafter',
      nodeI: 'N5',
      nodeJ: 'N6',
      section: rafterSec,
      material: steel,
      releaseStart: false,
      releaseEnd: false,
    },
  ];

  const loads: StructuralLoad[] = [
    {
      id: 'L1',
      kind: 'member_point',
      elementId: 'M1',
      p: 45,
      a: 3.0,
      direction: 'global_x',
      label: 'Lateral Wind Load',
    },
    {
      id: 'L2',
      kind: 'member_distributed',
      elementId: 'M4',
      w1: -22,
      w2: -22,
      direction: 'global_y',
      label: 'Bay 1 Roof UDL',
    },
    {
      id: 'L3',
      kind: 'member_distributed',
      elementId: 'M5',
      w1: -22,
      w2: -22,
      direction: 'global_y',
      label: 'Bay 2 Roof UDL',
    },
  ];

  return {
    name: '2-Bay Indeterminate Portal Frame',
    description:
      'Two-bay fixed-base steel portal frame with lateral wind point load on the windward column and uniform gravity roof load.',
    dimension: '2d',
    nodes,
    elements,
    loads,
  };
}

/**
 * 3. Continuous 2-Span Beam:
 * With UDL on Span 1, point load on Span 2, and a rotational spring at the center support.
 */
export function createContinuousBeamPreset(): StructuralModel {
  const steel = createMaterialFromPreset('steel');
  const beamSec = computeCrossSection(
    'i_section',
    { h: 320, b: 160, tw: 7.5, tf: 11.5 },
    { name: 'IPE 320 Girder' }
  );

  const nodes: StructuralNode[] = [
    makeNode('N1', 'Support A (Pin)', 0.0, 0.0, 'pinned'),
    makeNode('N2', 'Support B (Roller + kθ)', 6.0, 0.0, 'rollerX', { krz: 18000 }),
    makeNode('N3', 'Support C (Roller)', 12.0, 0.0, 'rollerX'),
  ];

  const elements: Frame2DElement[] = [
    {
      id: 'M1',
      kind: 'frame2d',
      label: 'Span 1 (0–6 m)',
      nodeI: 'N1',
      nodeJ: 'N2',
      section: beamSec,
      material: steel,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M2',
      kind: 'frame2d',
      label: 'Span 2 (6–12 m)',
      nodeI: 'N2',
      nodeJ: 'N3',
      section: beamSec,
      material: steel,
      releaseStart: false,
      releaseEnd: false,
    },
  ];

  const loads: StructuralLoad[] = [
    {
      id: 'L1',
      kind: 'member_distributed',
      elementId: 'M1',
      w1: -28,
      w2: -28,
      direction: 'global_y',
      label: 'Span 1 UDL',
    },
    {
      id: 'L2',
      kind: 'member_point',
      elementId: 'M2',
      p: -75,
      a: 3.0,
      direction: 'global_y',
      label: 'Span 2 Midspan Point Load',
    },
  ];

  return {
    name: 'Continuous 2-Span Beam',
    description:
      'Two-span continuous steel girder with UDL on Span 1, midspan point load on Span 2, and rotational spring restraint kθ at the interior pier.',
    dimension: '2d',
    nodes,
    elements,
    loads,
  };
}

/**
 * 4. Pratt Truss:
 * Pin-ended members (releaseStart = true, releaseEnd = true) demonstrating pure axial behavior.
 */
export function createPrattTrussPreset(): StructuralModel {
  const steel = createMaterialFromPreset('steel');
  const chordSec = computeCrossSection(
    'hollow_rect',
    { b: 160, h: 160, t: 10 },
    { name: 'SHS 160×160×10 Chord' }
  );
  const webSec = computeCrossSection(
    'hollow_rect',
    { b: 120, h: 120, t: 8 },
    { name: 'SHS 120×120×8 Web' }
  );

  // 4-panel Pratt truss: span = 12.0 m (panels at 0, 3, 6, 9, 12 m), height = 3.0 m
  const nodes: StructuralNode[] = [
    makeNode('N1', 'Bot-0m (Pin)', 0.0, 0.0, 'pinned'),
    makeNode('N2', 'Bot-3m', 3.0, 0.0, 'none'),
    makeNode('N3', 'Bot-6m', 6.0, 0.0, 'none'),
    makeNode('N4', 'Bot-9m', 9.0, 0.0, 'none'),
    makeNode('N5', 'Bot-12m (Roller)', 12.0, 0.0, 'rollerX'),
    makeNode('N6', 'Top-3m', 3.0, 3.0, 'none'),
    makeNode('N7', 'Top-6m', 6.0, 3.0, 'none'),
    makeNode('N8', 'Top-9m', 9.0, 3.0, 'none'),
  ];

  const makeTrussBar = (
    id: string,
    label: string,
    nodeI: string,
    nodeJ: string,
    isChord: boolean
  ): Frame2DElement => ({
    id,
    kind: 'frame2d',
    label,
    nodeI,
    nodeJ,
    section: isChord ? chordSec : webSec,
    material: steel,
    releaseStart: true,
    releaseEnd: true,
  });

  const elements: Frame2DElement[] = [
    // Bottom chord
    makeTrussBar('M1', 'Bot Chord 1', 'N1', 'N2', true),
    makeTrussBar('M2', 'Bot Chord 2', 'N2', 'N3', true),
    makeTrussBar('M3', 'Bot Chord 3', 'N3', 'N4', true),
    makeTrussBar('M4', 'Bot Chord 4', 'N4', 'N5', true),
    // Top chord & end inclines
    makeTrussBar('M5', 'Left End Post', 'N1', 'N6', true),
    makeTrussBar('M6', 'Top Chord 1', 'N6', 'N7', true),
    makeTrussBar('M7', 'Top Chord 2', 'N7', 'N8', true),
    makeTrussBar('M8', 'Right End Post', 'N8', 'N5', true),
    // Verticals
    makeTrussBar('M9', 'Vertical Left', 'N2', 'N6', false),
    makeTrussBar('M10', 'Vertical Center', 'N3', 'N7', false),
    makeTrussBar('M11', 'Vertical Right', 'N4', 'N8', false),
    // Pratt diagonals (sloping down toward center -> in tension under gravity load)
    makeTrussBar('M12', 'Diagonal Left', 'N6', 'N3', false),
    makeTrussBar('M13', 'Diagonal Right', 'N8', 'N3', false),
  ];

  const loads: StructuralLoad[] = [
    {
      id: 'L1',
      kind: 'nodal',
      nodeId: 'N2',
      fx: 0,
      fy: -60,
      mz: 0,
      label: 'Panel Point Load 1',
    },
    {
      id: 'L2',
      kind: 'nodal',
      nodeId: 'N3',
      fx: 0,
      fy: -90,
      mz: 0,
      label: 'Center Joint Load',
    },
    {
      id: 'L3',
      kind: 'nodal',
      nodeId: 'N4',
      fx: 0,
      fy: -60,
      mz: 0,
      label: 'Panel Point Load 3',
    },
  ];

  return {
    name: 'Pratt Truss',
    description:
      'Pin-ended 4-panel steel Pratt bridge truss (releaseStart = true, releaseEnd = true) demonstrating pure axial force distribution.',
    dimension: '2d',
    nodes,
    elements,
    loads,
  };
}

export const BENCHMARK_PRESETS: BenchmarkPreset[] = [
  {
    id: 'culvert',
    title: 'Underground Box Culvert',
    subtitle: 'Trapezoidal earth/water pressure + Winkler soil springs',
    badge: 'Geotech / RC',
    model: createBoxCulvertPreset(),
  },
  {
    id: 'portal',
    title: '2-Bay Indeterminate Portal Frame',
    subtitle: 'Steel columns & rafters with lateral wind + roof UDL',
    badge: 'Steel Frame',
    model: createTwoBayPortalPreset(),
  },
  {
    id: 'continuous_beam',
    title: 'Continuous 2-Span Beam',
    subtitle: 'Span 1 UDL, Span 2 Point Load + Rotational Spring kθ',
    badge: 'Girder / Spring',
    model: createContinuousBeamPreset(),
  },
  {
    id: 'pratt_truss',
    title: 'Pratt Truss',
    subtitle: 'Pin-ended members (releaseStart & releaseEnd) — Pure Axial',
    badge: 'Truss / Axial',
    model: createPrattTrussPreset(),
  },
];
