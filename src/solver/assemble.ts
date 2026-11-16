import type {
  StructuralModel,
  Frame2DElement,
  MemberPointLoad,
  MemberDistributedLoad,
} from '../types/model.ts';

export interface LocalResolvedPointLoad {
  id: string;
  a: number;  // m
  px: number; // N (local +x axial)
  py: number; // N (local +y transverse)
}

export interface LocalResolvedDistLoad {
  id: string;
  qx1: number; // N/m at x = 0 (local +x)
  qx2: number; // N/m at x = L (local +x)
  wy1: number; // N/m at x = 0 (local +y)
  wy2: number; // N/m at x = L (local +y)
}

export interface AssembledElementData {
  element: Frame2DElement;
  nodeIndexI: number;
  nodeIndexJ: number;
  L: number;
  cos: number;
  sin: number;
  EA: number; // N
  EI: number; // N*m^2
  /** Uncondensed 6x6 local stiffness matrix (base SI: N, m, rad) */
  kLocalUncondensed: number[][];
  /** Uncondensed 6x1 local equivalent nodal load vector [NF1, VF1, MF1, NF2, VF2, MF2] (N, N*m) */
  fEqLocalUncondensed: [number, number, number, number, number, number];
  /** Condensed 6x6 local stiffness matrix after static condensation of end hinges */
  kLocalCondensed: number[][];
  /** Condensed 6x1 local equivalent nodal load vector after static condensation */
  fEqLocalCondensed: [number, number, number, number, number, number];
  /** 6x6 transformation matrix T (u_local = T * u_global) */
  T: number[][];
  /** Resolved local point loads (in N and m) */
  pointLoads: LocalResolvedPointLoad[];
  /** Resolved local distributed loads (in N/m) */
  distLoads: LocalResolvedDistLoad[];
}

export interface AssembledSystem {
  numNodes: number;
  numDofs: number;
  nodeIdToIndex: Map<string, number>;
  /** Global stiffness matrix K (size 3N x 3N, in N/m and N*m/rad) including springs */
  K: number[][];
  /** Pure structural stiffness matrix without nodal springs (for total reaction extraction) */
  KStruct: number[][];
  /** Global nodal external + equivalent member load vector F (size 3N, in N and N*m) */
  F: number[];
  /** Direct nodal load vector only (without member FEFs, for reaction equilibrium check) */
  FNodalOnly: number[];
  /** Sum of global equivalent nodal loads from members */
  FMemberEqGlobal: number[];
  /** Per-element assembled data for post-processing */
  elementsData: AssembledElementData[];
}

/**
 * Convert a force/intensity value from its specified coordinate direction into local (axial +x, transverse +y).
 * Given element direction cosines (c = cos(phi), s = sin(phi)):
 * - Global +X projects to: local_x = +c, local_y = -s
 * - Global +Y projects to: local_x = +s, local_y = +c
 * - Local perpendicular projects to: local_x = 0, local_y = +1
 */
export function projectLoadToLocal(
  val: number,
  direction: 'local_perp' | 'global_x' | 'global_y',
  cos: number,
  sin: number
): { axial: number; transverse: number } {
  if (direction === 'global_x') {
    return {
      axial: val * cos,
      transverse: -val * sin,
    };
  }
  if (direction === 'global_y') {
    return {
      axial: val * sin,
      transverse: val * cos,
    };
  }
  // 'local_perp'
  return {
    axial: 0,
    transverse: val,
  };
}

/**
 * Build the uncondensed 6x6 2D Euler-Bernoulli frame local stiffness matrix in base SI.
 * Local DOFs: [ux1, uy1, rz1, ux2, uy2, rz2]
 */
export function buildUncondensedLocalStiffness(EA: number, EI: number, L: number): number[][] {
  const kA = EA / L;
  const L2 = L * L;
  const L3 = L2 * L;
  const k12 = (12 * EI) / L3;
  const k6 = (6 * EI) / L2;
  const k4 = (4 * EI) / L;
  const k2 = (2 * EI) / L;

  return [
    [kA, 0, 0, -kA, 0, 0],
    [0, k12, k6, 0, -k12, k6],
    [0, k6, k4, 0, -k6, k2],
    [-kA, 0, 0, kA, 0, 0],
    [0, -k12, -k6, 0, k12, -k6],
    [0, k6, k2, 0, -k6, k4],
  ];
}

/**
 * Perform static condensation of the 6x6 local stiffness matrix and 6x1 equivalent nodal load vector
 * for start hinge (DOF 2: rz1), end hinge (DOF 5: rz2), or both hinges (truss / pin-ended beam).
 */
export function condenseElementReleases(
  kUncond: number[][],
  fEqUncond: [number, number, number, number, number, number],
  releaseStart: boolean,
  releaseEnd: boolean
): {
  kCond: number[][];
  fEqCond: [number, number, number, number, number, number];
} {
  // Deep copy
  const k = kUncond.map((row) => [...row]);
  const f = [...fEqUncond] as [number, number, number, number, number, number];

  if (!releaseStart && !releaseEnd) {
    return { kCond: k, fEqCond: f };
  }

  // Condense single DOF helper: k_ij' = k_ij - (k_ic * k_cj) / k_cc, f_i' = f_i - (k_ic / k_cc) * f_c
  const condenseSingleDof = (dofC: number) => {
    const kcc = k[dofC][dofC];
    if (Math.abs(kcc) < 1e-14) return;
    const fc = f[dofC];

    const kNext = k.map((r) => [...r]);
    const fNext = [...f] as [number, number, number, number, number, number];

    for (let i = 0; i < 6; i++) {
      if (i === dofC) {
        fNext[i] = 0;
        for (let j = 0; j < 6; j++) kNext[i][j] = 0;
        continue;
      }
      const factor = k[i][dofC] / kcc;
      fNext[i] = f[i] - factor * fc;
      for (let j = 0; j < 6; j++) {
        if (j === dofC) {
          kNext[i][j] = 0;
        } else {
          kNext[i][j] = k[i][j] - factor * k[dofC][j];
        }
      }
    }

    for (let i = 0; i < 6; i++) {
      f[i] = fNext[i];
      for (let j = 0; j < 6; j++) {
        k[i][j] = kNext[i][j];
      }
    }
  };

  if (releaseStart && !releaseEnd) {
    condenseSingleDof(2);
  } else if (!releaseStart && releaseEnd) {
    condenseSingleDof(5);
  } else {
    // Both start (2) and end (5) released sequentially (Gaussian elimination on DOFs 2 and 5 is exact)
    condenseSingleDof(2);
    condenseSingleDof(5);
  }

  return { kCond: k, fEqCond: f };
}

/**
 * Recover internal member end rotations (rz1, rz2) after solving global nodal displacements,
 * accounting for start/end moment releases and fixed-end moments.
 */
export function recoverMemberLocalDisplacements(
  uNodeLocal: [number, number, number, number, number, number],
  elData: AssembledElementData
): [number, number, number, number, number, number] {
  const { element, kLocalUncondensed: k, fEqLocalUncondensed: f } = elData;
  const u = [...uNodeLocal] as [number, number, number, number, number, number];

  const rStart = element.releaseStart;
  const rEnd = element.releaseEnd;

  if (!rStart && !rEnd) {
    return u;
  }

  if (rStart && !rEnd) {
    // k[2][0]*u0 + k[2][1]*u1 + k[2][2]*rz1 + k[2][3]*u3 + k[2][4]*u4 + k[2][5]*u5 - f[2] = 0
    const k22 = k[2][2];
    if (Math.abs(k22) > 1e-14) {
      let rhs = f[2];
      for (const j of [0, 1, 3, 4, 5]) {
        rhs -= k[2][j] * u[j];
      }
      u[2] = rhs / k22;
    }
    return u;
  }

  if (!rStart && rEnd) {
    const k55 = k[5][5];
    if (Math.abs(k55) > 1e-14) {
      let rhs = f[5];
      for (const j of [0, 1, 2, 3, 4]) {
        rhs -= k[5][j] * u[j];
      }
      u[5] = rhs / k55;
    }
    return u;
  }

  // Both ends released: solve 2x2 system for [rz1, rz2]
  // [k22 k25] [rz1] = [f2 - sum_{j in 0,1,3,4} k_{2j} u_j]
  // [k52 k55] [rz2]   [f5 - sum_{j in 0,1,3,4} k_{5j} u_j]
  let rhs2 = f[2];
  let rhs5 = f[5];
  for (const j of [0, 1, 3, 4]) {
    rhs2 -= k[2][j] * u[j];
    rhs5 -= k[5][j] * u[j];
  }
  const det = k[2][2] * k[5][5] - k[2][5] * k[5][2];
  if (Math.abs(det) > 1e-18) {
    u[2] = (rhs2 * k[5][5] - rhs5 * k[2][5]) / det;
    u[5] = (k[2][2] * rhs5 - k[5][2] * rhs2) / det;
  }
  return u;
}

/**
 * Build 6x6 coordinate transformation matrix T (u_local = T * u_global)
 */
export function buildTransformationMatrix(c: number, s: number): number[][] {
  return [
    [c, s, 0, 0, 0, 0],
    [-s, c, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0],
    [0, 0, 0, c, s, 0],
    [0, 0, 0, -s, c, 0],
    [0, 0, 0, 0, 0, 1],
  ];
}

/**
 * Multiply T^T * kLocal * T (6x6)
 */
function transformStiffnessToGlobal(kLocal: number[][], T: number[][]): number[][] {
  const temp: number[][] = Array.from({ length: 6 }, () => Array(6).fill(0));
  const kGlobal: number[][] = Array.from({ length: 6 }, () => Array(6).fill(0));

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let sum = 0;
      for (let m = 0; m < 6; m++) {
        sum += kLocal[i][m] * T[m][j];
      }
      temp[i][j] = sum;
    }
  }

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let sum = 0;
      for (let m = 0; m < 6; m++) {
        sum += T[m][i] * temp[m][j];
      }
      kGlobal[i][j] = sum;
    }
  }

  return kGlobal;
}

/**
 * Multiply T^T * fLocal (6x1)
 */
function transformForcesToGlobal(
  fLocal: [number, number, number, number, number, number],
  T: number[][]
): [number, number, number, number, number, number] {
  const out: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 6; i++) {
    let sum = 0;
    for (let m = 0; m < 6; m++) {
      sum += T[m][i] * fLocal[m];
    }
    out[i] = sum;
  }
  return out;
}

/**
 * Assemble the complete global 2D Plane Frame system in base SI units (m, N, Pa).
 */
export function assembleSystem(model: StructuralModel): AssembledSystem {
  const numNodes = model.nodes.length;
  const numDofs = numNodes * 3;
  const nodeIdToIndex = new Map<string, number>();

  model.nodes.forEach((node, idx) => {
    nodeIdToIndex.set(node.id, idx);
  });

  const K: number[][] = Array.from({ length: numDofs }, () => Array(numDofs).fill(0));
  const KStruct: number[][] = Array.from({ length: numDofs }, () => Array(numDofs).fill(0));
  const F: number[] = Array(numDofs).fill(0);
  const FNodalOnly: number[] = Array(numDofs).fill(0);
  const FMemberEqGlobal: number[] = Array(numDofs).fill(0);

  // Group member loads by elementId
  const pointLoadsByEl = new Map<string, MemberPointLoad[]>();
  const distLoadsByEl = new Map<string, MemberDistributedLoad[]>();

  for (const load of model.loads) {
    if (load.kind === 'nodal') {
      const nIdx = nodeIdToIndex.get(load.nodeId);
      if (nIdx !== undefined) {
        // Convert kN -> N, kNm -> N*m
        const fxN = load.fx * 1e3;
        const fyN = load.fy * 1e3;
        const mzNm = load.mz * 1e3;
        F[nIdx * 3 + 0] += fxN;
        F[nIdx * 3 + 1] += fyN;
        F[nIdx * 3 + 2] += mzNm;
        FNodalOnly[nIdx * 3 + 0] += fxN;
        FNodalOnly[nIdx * 3 + 1] += fyN;
        FNodalOnly[nIdx * 3 + 2] += mzNm;
      }
    } else if (load.kind === 'member_point') {
      const list = pointLoadsByEl.get(load.elementId) ?? [];
      list.push(load);
      pointLoadsByEl.set(load.elementId, list);
    } else if (load.kind === 'member_distributed') {
      const list = distLoadsByEl.get(load.elementId) ?? [];
      list.push(load);
      distLoadsByEl.set(load.elementId, list);
    }
  }

  const elementsData: AssembledElementData[] = [];

  for (const el of model.elements) {
    if (el.kind !== 'frame2d') continue;
    const idxI = nodeIdToIndex.get(el.nodeI);
    const idxJ = nodeIdToIndex.get(el.nodeJ);
    if (idxI === undefined || idxJ === undefined) continue;

    const nodeI = model.nodes[idxI];
    const nodeJ = model.nodes[idxJ];
    const dx = nodeJ.x - nodeI.x;
    const dy = nodeJ.y - nodeI.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;

    const cos = dx / L;
    const sin = dy / L;

    // Base SI conversions:
    // E: GPa -> Pa (* 1e9)
    // A: mm^2 -> m^2 (* 1e-6) => E * A in N = E_GPa * A_mm2 * 1e3
    // I: mm^4 -> m^4 (* 1e-12) => E * I in N*m^2 = E_GPa * I_mm4 * 1e-3
    const E_Pa = el.material.E * 1e9;
    const A_m2 = el.section.A * 1e-6;
    const I_m4 = el.section.I * 1e-12;
    const EA = E_Pa * A_m2;
    const EI = E_Pa * I_m4;

    const kLocalUncondensed = buildUncondensedLocalStiffness(EA, EI, L);
    const fEqLocalUncondensed: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];

    const resolvedPointLoads: LocalResolvedPointLoad[] = [];
    const resolvedDistLoads: LocalResolvedDistLoad[] = [];

    // 1. Member Distributed Loads (Uniform & Trapezoidal)
    const elDistLoads = distLoadsByEl.get(el.id) ?? [];
    for (const dl of elDistLoads) {
      // Convert kN/m -> N/m (* 1e3)
      const w1_Nm = dl.w1 * 1e3;
      const w2_Nm = dl.w2 * 1e3;
      const p1 = projectLoadToLocal(w1_Nm, dl.direction, cos, sin);
      const p2 = projectLoadToLocal(w2_Nm, dl.direction, cos, sin);

      const qx1 = p1.axial;
      const qx2 = p2.axial;
      const wy1 = p1.transverse;
      const wy2 = p2.transverse;

      resolvedDistLoads.push({
        id: dl.id,
        qx1,
        qx2,
        wy1,
        wy2,
      });

      // Exact Fixed-End Forces for trapezoidal axial & transverse load:
      const NF1 = (L / 6) * (2 * qx1 + qx2);
      const NF2 = (L / 6) * (qx1 + 2 * qx2);
      const VF1 = (L / 20) * (7 * wy1 + 3 * wy2);
      const VF2 = (L / 20) * (3 * wy1 + 7 * wy2);
      const MF1 = ((L * L) / 60) * (3 * wy1 + 2 * wy2);
      const MF2 = -((L * L) / 60) * (2 * wy1 + 3 * wy2);

      fEqLocalUncondensed[0] += NF1;
      fEqLocalUncondensed[1] += VF1;
      fEqLocalUncondensed[2] += MF1;
      fEqLocalUncondensed[3] += NF2;
      fEqLocalUncondensed[4] += VF2;
      fEqLocalUncondensed[5] += MF2;
    }

    // 2. Member Point Loads
    const elPointLoads = pointLoadsByEl.get(el.id) ?? [];
    for (const pl of elPointLoads) {
      const a = Math.min(L, Math.max(0, pl.a));
      const b = L - a;
      // Convert kN -> N (* 1e3)
      const P_N = pl.p * 1e3;
      const proj = projectLoadToLocal(P_N, pl.direction, cos, sin);
      const px = proj.axial;
      const py = proj.transverse;

      resolvedPointLoads.push({
        id: pl.id,
        a,
        px,
        py,
      });

      const L2 = L * L;
      const L3 = L2 * L;
      const NF1 = (px * b) / L;
      const NF2 = (px * a) / L;
      const VF1 = (py * b * b * (3 * a + b)) / L3;
      const VF2 = (py * a * a * (a + 3 * b)) / L3;
      const MF1 = (py * a * b * b) / L2;
      const MF2 = -(py * a * a * b) / L2;

      fEqLocalUncondensed[0] += NF1;
      fEqLocalUncondensed[1] += VF1;
      fEqLocalUncondensed[2] += MF1;
      fEqLocalUncondensed[3] += NF2;
      fEqLocalUncondensed[4] += VF2;
      fEqLocalUncondensed[5] += MF2;
    }

    // 3. Static condensation for member end moment releases (hinges)
    const { kCond: kLocalCondensed, fEqCond: fEqLocalCondensed } = condenseElementReleases(
      kLocalUncondensed,
      fEqLocalUncondensed,
      el.releaseStart,
      el.releaseEnd
    );

    // 4. Transform to Global Coordinates
    const T = buildTransformationMatrix(cos, sin);
    const kGlobal = transformStiffnessToGlobal(kLocalCondensed, T);
    const fEqGlobal = transformForcesToGlobal(fEqLocalCondensed, T);

    const dofMap = [
      idxI * 3 + 0,
      idxI * 3 + 1,
      idxI * 3 + 2,
      idxJ * 3 + 0,
      idxJ * 3 + 1,
      idxJ * 3 + 2,
    ];

    for (let r = 0; r < 6; r++) {
      const gr = dofMap[r];
      F[gr] += fEqGlobal[r];
      FMemberEqGlobal[gr] += fEqGlobal[r];
      for (let c = 0; c < 6; c++) {
        const gc = dofMap[c];
        K[gr][gc] += kGlobal[r][c];
        KStruct[gr][gc] += kGlobal[r][c];
      }
    }

    elementsData.push({
      element: el,
      nodeIndexI: idxI,
      nodeIndexJ: idxJ,
      L,
      cos,
      sin,
      EA,
      EI,
      kLocalUncondensed,
      fEqLocalUncondensed,
      kLocalCondensed,
      fEqLocalCondensed,
      T,
      pointLoads: resolvedPointLoads,
      distLoads: resolvedDistLoads,
    });
  }

  // 5. Add Nodal Elastic Springs directly to the global stiffness matrix diagonal
  // kx, ky: kN/m -> N/m (* 1e3); krz: kNm/rad -> N*m/rad (* 1e3)
  model.nodes.forEach((node, idx) => {
    const kx_SI = Math.max(0, node.springs.kx) * 1e3;
    const ky_SI = Math.max(0, node.springs.ky) * 1e3;
    const krz_SI = Math.max(0, node.springs.krz) * 1e3;

    K[idx * 3 + 0][idx * 3 + 0] += kx_SI;
    K[idx * 3 + 1][idx * 3 + 1] += ky_SI;
    K[idx * 3 + 2][idx * 3 + 2] += krz_SI;
  });

  return {
    numNodes,
    numDofs,
    nodeIdToIndex,
    K,
    KStruct,
    F,
    FNodalOnly,
    FMemberEqGlobal,
    elementsData,
  };
}
