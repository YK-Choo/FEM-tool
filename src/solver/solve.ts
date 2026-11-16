import type { StructuralModel } from '../types/model.ts';
import type { AssembledSystem } from './assemble.ts';

export interface LinearSolution {
  stable: boolean;
  statusMessage: string;
  instabilityReason?: string;
  /** Global nodal displacements U (size 3N, in m and rad) in global Cartesian coordinates */
  U: number[];
  /** Global support + spring reactions R (size 3N, in N and N*m) in global Cartesian coordinates */
  R: number[];
}

/**
 * Solve [K]{U} = {F} using Gaussian elimination with partial pivoting and pivot-tolerance checking.
 * Handles:
 * - Standard presets (Fixed, Pinned, RollerX, RollerY)
 * - Custom Inclined Roller at angle alphaDeg via local orthogonal transformation
 * - Elastic translational & rotational springs (kx, ky, krz)
 * - Pin-connected truss nodes where all incident members have moment hinges
 * - Graceful detection of mechanisms and singular stiffness matrices without NaN crashes
 */
export function solveAssembledSystem(
  model: StructuralModel,
  sys: AssembledSystem
): LinearSolution {
  const { numNodes, numDofs, K, KStruct, F, FNodalOnly, FMemberEqGlobal, elementsData } = sys;
  const zeroU = Array(numDofs).fill(0);
  const zeroR = Array(numDofs).fill(0);

  if (numNodes === 0 || elementsData.length === 0) {
    return {
      stable: false,
      statusMessage: 'Unstable Structure',
      instabilityReason: 'Model contains no active structural frame elements.',
      U: zeroU,
      R: zeroR,
    };
  }

  // Deep copy K and F so we can apply inclined roller nodal basis rotations cleanly
  const KWork: number[][] = K.map((row) => [...row]);
  const FWork: number[] = [...F];

  // Track which nodes are connected to at least one element
  const connectedNodes = new Set<number>();
  for (const ed of elementsData) {
    connectedNodes.add(ed.nodeIndexI);
    connectedNodes.add(ed.nodeIndexJ);
  }

  // 1. Apply local boundary transformation for 'inclinedRoller' supports
  // For an inclined roller at angle alpha (deg):
  // Tangent unit vector (free): t = (cos a, sin a)
  // Normal unit vector (restrained): n = (-sin a, cos a)
  // [Ux] = [cos a  -sin a] [ut]
  // [Uy]   [sin a   cos a] [un]
  const nodeBasisCos = Array(numNodes).fill(1);
  const nodeBasisSin = Array(numNodes).fill(0);

  for (let i = 0; i < numNodes; i++) {
    const node = model.nodes[i];
    if (node.support === 'inclinedRoller') {
      const alphaRad = ((node.inclinedAngleDeg ?? 0) * Math.PI) / 180;
      const c = Math.cos(alphaRad);
      const s = Math.sin(alphaRad);
      nodeBasisCos[i] = c;
      nodeBasisSin[i] = s;

      const ix = i * 3 + 0;
      const iy = i * 3 + 1;

      // Rotate rows ix, iy: K_rot = R^T * K
      for (let col = 0; col < numDofs; col++) {
        const kxj = KWork[ix][col];
        const kyj = KWork[iy][col];
        KWork[ix][col] = c * kxj + s * kyj;
        KWork[iy][col] = -s * kxj + c * kyj;
      }

      // Rotate columns ix, iy: K_rot = K_rot * R
      for (let row = 0; row < numDofs; row++) {
        const kix = KWork[row][ix];
        const kiy = KWork[row][iy];
        KWork[row][ix] = c * kix + s * kiy;
        KWork[row][iy] = -s * kix + c * kiy;
      }

      // Rotate force vector F_rot = R^T * F
      const fx = FWork[ix];
      const fy = FWork[iy];
      FWork[ix] = c * fx + s * fy;
      FWork[iy] = -s * fx + c * fy;
    }
  }

  // 2. Determine restrained DOFs and free DOFs
  const isRestrained = Array<boolean>(numDofs).fill(false);

  for (let i = 0; i < numNodes; i++) {
    const node = model.nodes[i];
    if (!connectedNodes.has(i)) {
      // Disconnected orphan node: restrain to avoid trivial singularity
      isRestrained[i * 3 + 0] = true;
      isRestrained[i * 3 + 1] = true;
      isRestrained[i * 3 + 2] = true;
      continue;
    }

    if (node.support === 'fixed') {
      isRestrained[i * 3 + 0] = true;
      isRestrained[i * 3 + 1] = true;
      isRestrained[i * 3 + 2] = true;
    } else if (node.support === 'pinned') {
      isRestrained[i * 3 + 0] = true;
      isRestrained[i * 3 + 1] = true;
    } else if (node.support === 'rollerX') {
      isRestrained[i * 3 + 1] = true; // uy fixed
    } else if (node.support === 'rollerY') {
      isRestrained[i * 3 + 0] = true; // ux fixed
    } else if (node.support === 'inclinedRoller') {
      // In rotated basis [ut, un], index (i*3 + 1) is normal displacement un, which is fixed!
      isRestrained[i * 3 + 1] = true;
    } else {
      // Custom manual restraints if set
      if (node.restraints.ux) isRestrained[i * 3 + 0] = true;
      if (node.restraints.uy) isRestrained[i * 3 + 1] = true;
      if (node.restraints.rz) isRestrained[i * 3 + 2] = true;
    }

    // Check if rotational DOF (i*3 + 2) is a pure truss pin joint (zero rotational stiffness from all members & springs)
    const rzDof = i * 3 + 2;
    if (!isRestrained[rzDof]) {
      let rowNorm = 0;
      for (let j = 0; j < numDofs; j++) {
        rowNorm += Math.abs(KWork[rzDof][j]);
      }
      if (rowNorm < 1e-10) {
        // Pure pin joint with no rotational stiffness:
        // If a concentrated nodal moment is applied here, the joint spins freely (unstable).
        if (Math.abs(FWork[rzDof]) > 1e-6) {
          return {
            stable: false,
            statusMessage: 'Unstable Structure',
            instabilityReason: `Node ${node.label ?? node.id} is a frictionless pin joint and cannot resist an applied concentrated moment.`,
            U: zeroU,
            R: zeroR,
          };
        }
        // Otherwise lock dummy truss joint rotation to 0 (member end rotations are recovered locally)
        isRestrained[rzDof] = true;
      }
    }
  }

  const freeDofs: number[] = [];
  for (let d = 0; d < numDofs; d++) {
    if (!isRestrained[d]) {
      freeDofs.push(d);
    }
  }

  // Extract reduced system [K_ff]{U_f} = {F_f}
  const nFree = freeDofs.length;
  const UWork = Array<number>(numDofs).fill(0);

  if (nFree > 0) {
    const A: number[][] = Array.from({ length: nFree }, (_, r) => {
      const gr = freeDofs[r];
      return freeDofs.map((gc) => KWork[gr][gc]);
    });
    const b: number[] = freeDofs.map((gr) => FWork[gr]);

    // Compute scale norm of diagonal entries for relative pivot tolerance checking
    let maxDiag = 0;
    for (let i = 0; i < nFree; i++) {
      const d = Math.abs(A[i][i]);
      if (d > maxDiag) maxDiag = d;
    }

    if (maxDiag < 1e-12) {
      return {
        stable: false,
        statusMessage: 'Unstable Structure',
        instabilityReason: 'Global stiffness matrix has zero stiffness on active DOFs.',
        U: zeroU,
        R: zeroR,
      };
    }

    // Track initial diagonal scale per row for dimensionless conditioning check
    const rowScale = A.map((row, i) => {
      let m = Math.abs(row[i]);
      for (let j = 0; j < nFree; j++) {
        if (Math.abs(row[j]) > m) m = Math.abs(row[j]);
      }
      return m;
    });

    const relTol = 1e-10;

    // Gaussian elimination with scaled partial pivoting
    for (let k = 0; k < nFree; k++) {
      let pivotRow = k;
      let bestScaledPivot = 0;

      for (let i = k; i < nFree; i++) {
        const scale = rowScale[i] > 1e-16 ? rowScale[i] : 1;
        const scaled = Math.abs(A[i][k]) / scale;
        if (scaled > bestScaledPivot) {
          bestScaledPivot = scaled;
          pivotRow = i;
        }
      }

      const absPivot = Math.abs(A[pivotRow][k]);
      if (absPivot < 1e-9 || bestScaledPivot < relTol) {
        return {
          stable: false,
          statusMessage: 'Unstable Structure',
          instabilityReason:
            'Singular stiffness matrix (mechanism or insufficient boundary restraints detected).',
          U: zeroU,
          R: zeroR,
        };
      }

      if (pivotRow !== k) {
        const tmpRow = A[k];
        A[k] = A[pivotRow];
        A[pivotRow] = tmpRow;

        const tmpB = b[k];
        b[k] = b[pivotRow];
        b[pivotRow] = tmpB;

        const tmpS = rowScale[k];
        rowScale[k] = rowScale[pivotRow];
        rowScale[pivotRow] = tmpS;
      }

      const pivotVal = A[k][k];
      for (let i = k + 1; i < nFree; i++) {
        const factor = A[i][k] / pivotVal;
        if (Math.abs(factor) < 1e-18) continue;
        b[i] -= factor * b[k];
        for (let j = k + 1; j < nFree; j++) {
          A[i][j] -= factor * A[k][j];
        }
        A[i][k] = 0;
      }
    }

    // Back-substitution
    const xFree = Array<number>(nFree).fill(0);
    for (let i = nFree - 1; i >= 0; i--) {
      let sum = b[i];
      for (let j = i + 1; j < nFree; j++) {
        sum -= A[i][j] * xFree[j];
      }
      const val = sum / A[i][i];
      if (!Number.isFinite(val) || Math.abs(val) > 1e4) {
        return {
          stable: false,
          statusMessage: 'Unstable Structure',
          instabilityReason:
            'Excessive rigid-body mechanism displacement detected due to insufficient restraints.',
          U: zeroU,
          R: zeroR,
        };
      }
      xFree[i] = val;
    }

    for (let i = 0; i < nFree; i++) {
      UWork[freeDofs[i]] = xFree[i];
    }
  }

  // 3. Transform nodal displacements back from inclined roller basis to global Cartesian (X, Y)
  const UGlobal = [...UWork];
  for (let i = 0; i < numNodes; i++) {
    const node = model.nodes[i];
    if (node.support === 'inclinedRoller') {
      const c = nodeBasisCos[i];
      const s = nodeBasisSin[i];
      const ut = UWork[i * 3 + 0];
      const un = UWork[i * 3 + 1]; // 0
      UGlobal[i * 3 + 0] = c * ut - s * un;
      UGlobal[i * 3 + 1] = s * ut + c * un;
    }
  }

  // 4. Compute total global support & spring reactions:
  // Equilibrium of the structure at every node requires:
  // [KStruct]{UGlobal} = {FNodalOnly} + {FMemberEqGlobal} + {R_support_and_springs}
  // Therefore, the total external reaction force (from rigid supports + elastic springs) is:
  // {R} = [KStruct]{UGlobal} - {FNodalOnly} - {FMemberEqGlobal}
  const RGlobal = Array<number>(numDofs).fill(0);
  for (let i = 0; i < numDofs; i++) {
    let kDotU = 0;
    for (let j = 0; j < numDofs; j++) {
      kDotU += KStruct[i][j] * UGlobal[j];
    }
    RGlobal[i] = kDotU - FNodalOnly[i] - FMemberEqGlobal[i];
  }

  return {
    stable: true,
    statusMessage: 'Structure Stable — Converged',
    U: UGlobal,
    R: RGlobal,
  };
}
