/**
 * 2D/3D Structural Analysis FEM Data Model
 *
 * Future-Proofing Architecture:
 * - All node coordinates are stored in 3D Cartesian (x, y, z) from day one.
 *   In 2D mode, z = 0 is locked and out-of-plane DOFs (uz, rx, ry) are restrained.
 * - Elements and Loads are modeled as discriminated unions so 3D space frames
 *   and 2D CST/Q4 continuum elements can be registered later without rewriting
 *   state management.
 *
 * Strict SI Unit System (UI / Model storage):
 * - Coordinates, lengths, load positions (x, y, z, L, a): m
 * - Cross-section dimensions (b, h, d, t, tw, tf): mm
 * - Section properties: A (mm^2), I (mm^4), S (mm^3)
 * - Point loads & support reactions (P, Fx, Fy, Rx, Ry): kN
 * - Distributed loads (w1, w2): kN/m
 * - Concentrated & bending moments (Mz, M): kNm
 * - Young's Modulus (E): GPa
 * - Material yield strength (fy) & member stresses (sigma): MPa
 * - Spring stiffnesses: kx, ky (kN/m); rotational krz (kNm/rad)
 * - Calculated deflections: mm
 */

export type AnalysisDimensionMode = '2d' | '3d';

export type SupportPreset =
  | 'none'
  | 'fixed'          // ux, uy, rz fixed
  | 'pinned'         // ux, uy fixed
  | 'rollerX'        // uy fixed (rolls along global X)
  | 'rollerY'        // ux fixed (rolls along global Y)
  | 'inclinedRoller'; // un fixed perpendicular to angle alphaDeg

export interface DofRestraints3D {
  ux: boolean;
  uy: boolean;
  uz: boolean; // Locked true in 2D mode
  rx: boolean; // Locked true in 2D mode
  ry: boolean; // Locked true in 2D mode
  rz: boolean;
}

export interface NodalSprings3D {
  kx: number;  // kN/m
  ky: number;  // kN/m
  kz: number;  // kN/m (reserved for 3D)
  krx: number; // kNm/rad (reserved for 3D)
  kry: number; // kNm/rad (reserved for 3D)
  krz: number; // kNm/rad (rotational spring k_theta in 2D)
}

export interface StructuralNode {
  id: string;
  label?: string;
  // 3D Cartesian coordinates in meters (m). In 2D mode, z = 0.
  x: number;
  y: number;
  z: number;
  support: SupportPreset;
  /** Inclination angle alpha in degrees for 'inclinedRoller' support (0 deg = horizontal rollerX) */
  inclinedAngleDeg?: number;
  restraints: DofRestraints3D;
  springs: NodalSprings3D;
}

export type CrossSectionShape =
  | 'rectangular'
  | 'circular'
  | 'hollow_rect'
  | 'i_section'
  | 'custom';

export interface CrossSectionDimensions {
  /** Width b (mm) for rectangular, hollow_rect, i_section */
  b?: number;
  /** Depth/height h (mm) for rectangular, hollow_rect, i_section, custom */
  h?: number;
  /** Outer diameter d (mm) for circular */
  d?: number;
  /** Wall thickness t (mm) for hollow_rect */
  t?: number;
  /** Web thickness tw (mm) for i_section */
  tw?: number;
  /** Flange thickness tf (mm) for i_section */
  tf?: number;
}

export interface CrossSection {
  shape: CrossSectionShape;
  name: string;
  dimensions: CrossSectionDimensions;
  /** Cross-sectional area A (mm^2) */
  A: number;
  /** Second moment of area I_zz (mm^4) */
  I: number;
  /** Elastic section modulus S_zz (mm^3) */
  S: number;
  /** Effective section depth for proportional rendering (mm) */
  depthMm: number;
}

export type MaterialPresetName = 'steel' | 'concrete' | 'timber' | 'custom';

export interface Material {
  preset: MaterialPresetName;
  name: string;
  /** Young's Modulus E (GPa) */
  E: number;
  /** Yield / Design Strength fy (MPa) */
  fy: number;
  /** Poisson's ratio nu (dimensionless, used for future 2D continuum/3D torsion) */
  nu?: number;
}

/** 1D 2D-Plane Frame Euler-Bernoulli Element (6-DOF: ux, uy, rz at start i and end j) */
export interface Frame2DElement {
  id: string;
  kind: 'frame2d';
  label?: string;
  nodeI: string;
  nodeJ: string;
  section: CrossSection;
  material: Material;
  /** Moment hinge at start node i */
  releaseStart: boolean;
  /** Moment hinge at end node j */
  releaseEnd: boolean;
}

/** Future expansion: 3D Space Frame Element (12-DOF) */
export interface Frame3DElement {
  id: string;
  kind: 'frame3d';
  label?: string;
  nodeI: string;
  nodeJ: string;
  section: CrossSection;
  material: Material;
  rollAngleDeg: number;
  releaseStart: boolean;
  releaseEnd: boolean;
}

/** Future expansion: 2D Constant Strain Triangle (CST) Continuum Element */
export interface CST2DElement {
  id: string;
  kind: 'cst2d';
  nodeIds: [string, string, string];
  thicknessMm: number;
  material: Material;
  planeStress: boolean;
}

/** Future expansion: 2D Bilinear Quadrilateral (Q4) Continuum Element */
export interface Q42DElement {
  id: string;
  kind: 'q4_2d';
  nodeIds: [string, string, string, string];
  thicknessMm: number;
  material: Material;
  planeStress: boolean;
}

export type StructuralElement =
  | Frame2DElement
  | Frame3DElement
  | CST2DElement
  | Q42DElement;

export type LoadCoordinateDirection = 'local_perp' | 'global_x' | 'global_y';

/** Concentrated Nodal Force / Moment Load */
export interface NodalLoad {
  id: string;
  kind: 'nodal';
  nodeId: string;
  /** Force along Global X (kN) */
  fx: number;
  /** Force along Global Y (kN) */
  fy: number;
  /** Moment about Global Z (kNm, positive = counter-clockwise) */
  mz: number;
  /** Reserved for 3D */
  fz?: number;
  mx?: number;
  my?: number;
  label?: string;
}

/** Concentrated Point Load along a 1D Frame Member */
export interface MemberPointLoad {
  id: string;
  kind: 'member_point';
  elementId: string;
  /** Magnitude P (kN) */
  p: number;
  /** Distance a (m) measured along element from start node i */
  a: number;
  /** Coordinate direction */
  direction: LoadCoordinateDirection;
  label?: string;
}

/** Uniform or Linearly Varying (Trapezoidal) Distributed Load along a 1D Frame Member */
export interface MemberDistributedLoad {
  id: string;
  kind: 'member_distributed';
  elementId: string;
  /** Start intensity w1 at x = 0 (kN/m) */
  w1: number;
  /** End intensity w2 at x = L (kN/m) */
  w2: number;
  /** Coordinate direction */
  direction: LoadCoordinateDirection;
  label?: string;
}

/** Future expansion: 2D Continuum Edge Traction Load */
export interface ContinuumEdgeLoad2D {
  id: string;
  kind: 'continuum_edge_2d';
  elementId: string;
  edgeIndex: number;
  tx: number; // kN/m
  ty: number; // kN/m
}

export type StructuralLoad =
  | NodalLoad
  | MemberPointLoad
  | MemberDistributedLoad
  | ContinuumEdgeLoad2D;

export interface StructuralModel {
  name: string;
  description?: string;
  dimension: AnalysisDimensionMode;
  nodes: StructuralNode[];
  elements: StructuralElement[];
  loads: StructuralLoad[];
}

/** Result sample point along a 1D Frame2D element */
export interface ElementSamplePoint {
  /** Local position x along member (m), from 0 to L */
  x: number;
  /** Normalized coordinate xi = x / L in [0, 1] */
  xi: number;
  /** Undeformed world coordinates (m) */
  worldX: number;
  worldY: number;
  /** Local axial displacement u(x) (mm) */
  uLocalMm: number;
  /** Local transverse deflection v(x) (mm) */
  vLocalMm: number;
  /** Global displacement components (mm) */
  dxGlobalMm: number;
  dyGlobalMm: number;
  /** Resultant total deflection magnitude (mm) */
  deflectionMm: number;
  /** Internal Axial Force N(x) (kN, positive = tension) */
  N: number;
  /** Internal Shear Force V(x) (kN) */
  V: number;
  /** Internal Bending Moment M(x) (kNm, positive = sagging / bottom fiber tension) */
  M: number;
  /** Maximum combined normal stress sigma_max(x) = |N|/A + |M|/S (MPa) */
  sigmaMaxMpa: number;
  /** Stress utilization ratio eta = sigma_max / fy (dimensionless) */
  utilization: number;
}

/** Value and location (x in m and normalized x/L in [0, 1]) of an internal force or stress extremum */
export interface ExtremaLocationValue {
  value: number;
  /** Distance from member start node i (m) */
  x: number;
  /** Normalized position x / L in [0, 1] */
  xOverL: number;
}

/** Per-member envelope extrema for calculation report tables (HTML/PDF/CSV) */
export interface ElementEnvelopeExtrema {
  NMax: ExtremaLocationValue; // kN
  NMin: ExtremaLocationValue; // kN
  VMax: ExtremaLocationValue; // kN
  VMin: ExtremaLocationValue; // kN
  MMax: ExtremaLocationValue; // kNm
  MMin: ExtremaLocationValue; // kNm
  deflectionMax: ExtremaLocationValue; // mm
  sigmaMax: ExtremaLocationValue; // MPa
  governingUtilization: ExtremaLocationValue; // sigma_max / fy
}

export interface ElementAnalysisResult {
  elementId: string;
  lengthM: number;
  cos: number;
  sin: number;
  /** Local end displacements [ux1(m), uy1(m), rz1(rad), ux2(m), uy2(m), rz2(rad)] */
  localEndDisplacements: [number, number, number, number, number, number];
  /** Local member end forces [fx1(kN), fy1(kN), fm1(kNm), fx2(kN), fy2(kN), fm2(kNm)] */
  localEndForces: [number, number, number, number, number, number];
  /** Dense stations along the element for smooth cubic/quartic diagrams & hover probing */
  stations: ElementSamplePoint[];
  /** Report-ready envelope extrema (N_max/min, V_max/min, M_max/min with x and x/L locations) */
  extrema: ElementEnvelopeExtrema;
  maxAbsN: number;
  maxAbsV: number;
  maxAbsM: number;
  maxDeflectionMm: number;
  maxSigmaMpa: number;
  maxUtilization: number;
}

export interface NodalAnalysisResult {
  nodeId: string;
  /** Global displacements: dx (mm), dy (mm), rz (mrad) */
  dxMm: number;
  dyMm: number;
  rzMrad: number;
  /** Global support + spring reactions: Rx (kN), Ry (kN), Mz (kNm) */
  reactionFx: number;
  reactionFy: number;
  reactionMz: number;
  /** Whether this node has any active support or spring restraint */
  hasReaction: boolean;
}

export interface GoverningMemberSummary {
  elementId: string | null;
  utilization: number;
  sigmaMaxMpa: number;
  fyMpa: number;
  x: number;
  xOverL: number;
}

/**
 * Self-contained, JSON-serializable summary of the structural FEM analysis
 * primed for future HTML/PDF/CSV calculation report generation.
 */
export interface SolverResults {
  stable: boolean;
  statusMessage: string;
  instabilityReason?: string;
  nodeResults: Record<string, NodalAnalysisResult>;
  elementResults: Record<string, ElementAnalysisResult>;
  /** Governing utilization summary (sigma_max / fy) across all members */
  governingMember: GoverningMemberSummary;
  /** Global sum of support/spring reactions (kN, kNm) for equilibrium verification */
  reactionSum: {
    sumRx: number;
    sumRy: number;
    sumMzAboutOrigin: number;
  };
  globalMaxDeflectionMm: number;
  globalMaxN: number;
  globalMaxV: number;
  globalMaxM: number;
  globalMaxSigmaMpa: number;
  globalMaxUtilization: number;
}

export type SolverOutput = SolverResults;

/** Pinned parameter for Real-Time Sensitivity Analysis */
export type PinnedParameterTarget =
  | {
      id: string;
      label: string;
      kind: 'member_E';
      elementId: string;
      baseValue: number; // GPa
      multiplier: number; // 0.2x to 3.0x
    }
  | {
      id: string;
      label: string;
      kind: 'node_spring_kx';
      nodeId: string;
      baseValue: number; // kN/m
      multiplier: number;
    }
  | {
      id: string;
      label: string;
      kind: 'node_spring_ky';
      nodeId: string;
      baseValue: number; // kN/m
      multiplier: number;
    }
  | {
      id: string;
      label: string;
      kind: 'node_spring_krz';
      nodeId: string;
      baseValue: number; // kNm/rad
      multiplier: number;
    }
  | {
      id: string;
      label: string;
      kind: 'load_magnitude';
      loadId: string;
      basePrimary: number;
      baseSecondary?: number;
      multiplier: number;
    };

