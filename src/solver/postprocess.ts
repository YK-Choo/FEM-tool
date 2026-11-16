import type {
  StructuralModel,
  SolverResults,
  SolverOutput,
  NodalAnalysisResult,
  ElementAnalysisResult,
  ElementSamplePoint,
  ElementEnvelopeExtrema,
  GoverningMemberSummary,
} from '../types/model.ts';
import {
  type AssembledSystem,
  type AssembledElementData,
  recoverMemberLocalDisplacements,
} from './assemble.ts';
import type { LinearSolution } from './solve.ts';

/**
 * Evaluate exact internal forces N(x), V(x), M(x), local/global deflections u(x), v(x),
 * and combined stress sigma_max(x) at any position x in [0, L] along an assembled element.
 */
export function evaluateElementAtX(
  xRaw: number,
  elData: AssembledElementData,
  nodeI: { x: number; y: number },
  uMemberLocal: [number, number, number, number, number, number],
  fEndLocalSI: [number, number, number, number, number, number],
  includePointLoadRightLimit: boolean = true
): ElementSamplePoint {
  const { element, L, cos, sin, EA, EI, pointLoads, distLoads } = elData;
  const x = Math.min(L, Math.max(0, xRaw));
  const xi = L > 1e-9 ? x / L : 0;

  const ux1 = uMemberLocal[0];
  const uy1 = uMemberLocal[1];
  const rz1 = uMemberLocal[2];

  const fx1 = fEndLocalSI[0];
  const fy1 = fEndLocalSI[1];
  const fm1 = fEndLocalSI[2];

  // 1. Exact internal forces in base SI (N, N*m)
  // Axial force N(x) (Tension positive):
  let N_SI = -fx1;
  // Shear force V(x):
  let V_SI = fy1;
  // Bending moment M(x) (Sagging / bottom-fiber tension positive):
  let M_SI = -fm1 + fy1 * x;

  // Axial displacement integral and transverse deflection integral
  let uIntegral = -fx1 * x;
  let vIntegral = -0.5 * fm1 * x * x + (1 / 6) * fy1 * x * x * x;

  const x2 = x * x;
  const x3 = x2 * x;
  const x4 = x3 * x;
  const x5 = x4 * x;

  for (const dl of distLoads) {
    const dqx = dl.qx2 - dl.qx1;
    const dwy = dl.wy2 - dl.wy1;

    // Axial distributed load contribution
    N_SI -= dl.qx1 * x + (dqx / (2 * L)) * x2;
    uIntegral -= 0.5 * dl.qx1 * x2 + (dqx / (6 * L)) * x3;

    // Transverse trapezoidal load contribution:
    // V(x) is quadratic, M(x) is cubic, v(x) is quintic (5th degree)
    V_SI += dl.wy1 * x + (dwy / (2 * L)) * x2;
    M_SI += 0.5 * dl.wy1 * x2 + (dwy / (6 * L)) * x3;
    vIntegral += (1 / 24) * dl.wy1 * x4 + (dwy / (120 * L)) * x5;
  }

  for (const pl of pointLoads) {
    const active = includePointLoadRightLimit ? x >= pl.a - 1e-9 : x > pl.a + 1e-9;
    if (active) {
      const dx = Math.max(0, x - pl.a);
      N_SI -= pl.px;
      uIntegral -= pl.px * dx;

      V_SI += pl.py;
      M_SI += pl.py * dx;
      vIntegral += (1 / 6) * pl.py * dx * dx * dx;
    }
  }

  // Local displacements in meters
  const uLocalM = ux1 + (EA > 1e-12 ? uIntegral / EA : 0);
  const vLocalM = uy1 + rz1 * x + (EI > 1e-12 ? vIntegral / EI : 0);

  // Convert local displacements to mm
  const uLocalMm = uLocalM * 1e3;
  const vLocalMm = vLocalM * 1e3;

  // Transform local displacement (u, v) to global (dx, dy) in mm:
  // dx = u * cos - v * sin
  // dy = u * sin + v * cos
  const dxGlobalMm = uLocalMm * cos - vLocalMm * sin;
  const dyGlobalMm = uLocalMm * sin + vLocalMm * cos;
  const deflectionMm = Math.hypot(uLocalMm, vLocalMm);

  // Convert internal forces to kN and kNm
  const N_kN = N_SI * 1e-3;
  const V_kN = V_SI * 1e-3;
  const M_kNm = M_SI * 1e-3;

  // Stress calculation in MPa:
  // sigma_max(x) = |N(kN)|*1e3 / A(mm^2) + |M(kNm)|*1e6 / S(mm^3)
  const A_mm2 = Math.max(1e-3, element.section.A);
  const S_mm3 = Math.max(1e-3, element.section.S);
  const fy_MPa = Math.max(1e-3, element.material.fy);

  const sigmaAxialMpa = (Math.abs(N_kN) * 1e3) / A_mm2;
  const sigmaBendingMpa = (Math.abs(M_kNm) * 1e6) / S_mm3;
  const sigmaMaxMpa = sigmaAxialMpa + sigmaBendingMpa;
  const utilization = sigmaMaxMpa / fy_MPa;

  return {
    x,
    xi,
    worldX: nodeI.x + x * cos,
    worldY: nodeI.y + x * sin,
    uLocalMm,
    vLocalMm,
    dxGlobalMm,
    dyGlobalMm,
    deflectionMm,
    N: N_kN,
    V: V_kN,
    M: M_kNm,
    sigmaMaxMpa,
    utilization,
  };
}

/**
 * Post-process global nodal displacements & reactions into rich, JSON-serializable
 * SolverResults with per-member envelope extrema (N_max/min, V_max/min, M_max/min with x/L)
 * and governing utilization ratios (sigma_max / fy) for calculation report exports.
 */
export function postProcessSolution(
  model: StructuralModel,
  sys: AssembledSystem,
  sol: LinearSolution,
  numSubdivisions: number = 48
): SolverResults {
  const nodeResults: Record<string, NodalAnalysisResult> = {};
  const elementResults: Record<string, ElementAnalysisResult> = {};

  if (!sol.stable) {
    for (const node of model.nodes) {
      nodeResults[node.id] = {
        nodeId: node.id,
        dxMm: 0,
        dyMm: 0,
        rzMrad: 0,
        reactionFx: 0,
        reactionFy: 0,
        reactionMz: 0,
        hasReaction: node.support !== 'none',
      };
    }
    return {
      stable: false,
      statusMessage: sol.statusMessage,
      instabilityReason: sol.instabilityReason,
      nodeResults,
      elementResults,
      governingMember: {
        elementId: null,
        utilization: 0,
        sigmaMaxMpa: 0,
        fyMpa: 0,
        x: 0,
        xOverL: 0,
      },
      reactionSum: {
        sumRx: 0,
        sumRy: 0,
        sumMzAboutOrigin: 0,
      },
      globalMaxDeflectionMm: 0,
      globalMaxN: 0,
      globalMaxV: 0,
      globalMaxM: 0,
      globalMaxSigmaMpa: 0,
      globalMaxUtilization: 0,
    };
  }

  let globalMaxDeflectionMm = 0;
  let globalMaxN = 0;
  let globalMaxV = 0;
  let globalMaxM = 0;
  let globalMaxSigmaMpa = 0;
  let globalMaxUtilization = 0;

  let sumRx = 0;
  let sumRy = 0;
  let sumMzAboutOrigin = 0;

  const governingMember: GoverningMemberSummary = {
    elementId: null,
    utilization: 0,
    sigmaMaxMpa: 0,
    fyMpa: 0,
    x: 0,
    xOverL: 0,
  };

  // 1. Nodal results & global reaction sums
  model.nodes.forEach((node, idx) => {
    const dxMm = sol.U[idx * 3 + 0] * 1e3;
    const dyMm = sol.U[idx * 3 + 1] * 1e3;
    const rzMrad = sol.U[idx * 3 + 2] * 1e3;

    const reactionFx = sol.R[idx * 3 + 0] * 1e-3;
    const reactionFy = sol.R[idx * 3 + 1] * 1e-3;
    const reactionMz = sol.R[idx * 3 + 2] * 1e-3;

    const hasSupport =
      node.support !== 'none' ||
      node.restraints.ux ||
      node.restraints.uy ||
      node.restraints.rz ||
      node.springs.kx > 0 ||
      node.springs.ky > 0 ||
      node.springs.krz > 0;

    const rx = hasSupport ? reactionFx : 0;
    const ry = hasSupport ? reactionFy : 0;
    const rmz = hasSupport ? reactionMz : 0;

    sumRx += rx;
    sumRy += ry;
    sumMzAboutOrigin += rmz + node.x * ry - node.y * rx;

    nodeResults[node.id] = {
      nodeId: node.id,
      dxMm,
      dyMm,
      rzMrad,
      reactionFx: rx,
      reactionFy: ry,
      reactionMz: rmz,
      hasReaction: hasSupport,
    };

    const nodalDefl = Math.hypot(dxMm, dyMm);
    if (nodalDefl > globalMaxDeflectionMm) {
      globalMaxDeflectionMm = nodalDefl;
    }
  });

  // 2. Element results & envelope extrema
  for (const elData of sys.elementsData) {
    const {
      element,
      nodeIndexI,
      nodeIndexJ,
      L,
      cos,
      sin,
      T,
      kLocalUncondensed,
      fEqLocalUncondensed,
    } = elData;
    const nodeI = model.nodes[nodeIndexI];

    const uGlobal6: [number, number, number, number, number, number] = [
      sol.U[nodeIndexI * 3 + 0],
      sol.U[nodeIndexI * 3 + 1],
      sol.U[nodeIndexI * 3 + 2],
      sol.U[nodeIndexJ * 3 + 0],
      sol.U[nodeIndexJ * 3 + 1],
      sol.U[nodeIndexJ * 3 + 2],
    ];

    // uNodeLocal = T * uGlobal6
    const uNodeLocal: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
    for (let r = 0; r < 6; r++) {
      let s = 0;
      for (let c = 0; c < 6; c++) {
        s += T[r][c] * uGlobal6[c];
      }
      uNodeLocal[r] = s;
    }

    // Recover internal member end rotations accounting for moment hinges
    const uMemberLocal = recoverMemberLocalDisplacements(uNodeLocal, elData);

    // Compute local member end forces in base SI: fEndLocalSI = kUncond * uMemberLocal - fEqUncond
    const fEndLocalSI: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
    for (let r = 0; r < 6; r++) {
      let s = -fEqLocalUncondensed[r];
      for (let c = 0; c < 6; c++) {
        s += kLocalUncondensed[r][c] * uMemberLocal[c];
      }
      fEndLocalSI[r] = s;
    }

    if (element.releaseStart) fEndLocalSI[2] = 0;
    if (element.releaseEnd) fEndLocalSI[5] = 0;

    // Build sorted sample positions along [0, L], including left/right limits at point loads
    const samplePositions: Array<{ x: number; rightLimit: boolean }> = [];
    for (let k = 0; k <= numSubdivisions; k++) {
      const xk = (k / numSubdivisions) * L;
      samplePositions.push({ x: xk, rightLimit: k < numSubdivisions });
    }
    for (const pl of elData.pointLoads) {
      if (pl.a > 1e-5 && pl.a < L - 1e-5) {
        samplePositions.push({ x: pl.a, rightLimit: false });
        samplePositions.push({ x: pl.a, rightLimit: true });
      }
    }

    // Also include analytical zero-shear points (M extrema) & zero-load points (V extrema)
    let totalWy1 = 0;
    let totalWy2 = 0;
    for (const dl of elData.distLoads) {
      totalWy1 += dl.wy1;
      totalWy2 += dl.wy2;
    }
    const dWy = totalWy2 - totalWy1;
    // Zero-load point where dV/dx = wy(x) = 0 -> x = -wy1 * L / dWy
    if (Math.abs(dWy) > 1e-9) {
      const xZeroW = (-totalWy1 * L) / dWy;
      if (xZeroW > 1e-5 && xZeroW < L - 1e-5) {
        samplePositions.push({ x: xZeroW, rightLimit: true });
      }
    }
    // Zero-shear points where dM/dx = V(x) = 0 (quadratic root or linear root)
    if (elData.pointLoads.length === 0) {
      const aQuad = dWy / (2 * L);
      const bQuad = totalWy1;
      const cQuad = fEndLocalSI[1];
      if (Math.abs(aQuad) > 1e-9) {
        const disc = bQuad * bQuad - 4 * aQuad * cQuad;
        if (disc >= 0) {
          const sqrtD = Math.sqrt(disc);
          for (const r of [(-bQuad + sqrtD) / (2 * aQuad), (-bQuad - sqrtD) / (2 * aQuad)]) {
            if (r > 1e-5 && r < L - 1e-5) {
              samplePositions.push({ x: r, rightLimit: true });
            }
          }
        }
      } else if (Math.abs(bQuad) > 1e-9) {
        const r = -cQuad / bQuad;
        if (r > 1e-5 && r < L - 1e-5) {
          samplePositions.push({ x: r, rightLimit: true });
        }
      }
    }

    samplePositions.sort((a, b) => {
      if (Math.abs(a.x - b.x) > 1e-7) return a.x - b.x;
      return (a.rightLimit ? 1 : 0) - (b.rightLimit ? 1 : 0);
    });

    const stations: ElementSamplePoint[] = [];
    let maxAbsN = 0;
    let maxAbsV = 0;
    let maxAbsM = 0;
    let maxDeflectionMm = 0;
    let maxSigmaMpa = 0;
    let maxUtilization = 0;

    // Initialize envelope extrema trackers
    let NMax = { value: -Infinity, x: 0, xOverL: 0 };
    let NMin = { value: Infinity, x: 0, xOverL: 0 };
    let VMax = { value: -Infinity, x: 0, xOverL: 0 };
    let VMin = { value: Infinity, x: 0, xOverL: 0 };
    let MMax = { value: -Infinity, x: 0, xOverL: 0 };
    let MMin = { value: Infinity, x: 0, xOverL: 0 };
    let deflectionMax = { value: -Infinity, x: 0, xOverL: 0 };
    let sigmaMax = { value: -Infinity, x: 0, xOverL: 0 };
    let governingUtilization = { value: -Infinity, x: 0, xOverL: 0 };

    for (const sp of samplePositions) {
      const pt = evaluateElementAtX(
        sp.x,
        elData,
        nodeI,
        uMemberLocal,
        fEndLocalSI,
        sp.rightLimit
      );
      stations.push(pt);

      const xLoc = Number(pt.x.toFixed(4));
      const xiLoc = Number(pt.xi.toFixed(4));

      if (pt.N > NMax.value) NMax = { value: pt.N, x: xLoc, xOverL: xiLoc };
      if (pt.N < NMin.value) NMin = { value: pt.N, x: xLoc, xOverL: xiLoc };

      if (pt.V > VMax.value) VMax = { value: pt.V, x: xLoc, xOverL: xiLoc };
      if (pt.V < VMin.value) VMin = { value: pt.V, x: xLoc, xOverL: xiLoc };

      if (pt.M > MMax.value) MMax = { value: pt.M, x: xLoc, xOverL: xiLoc };
      if (pt.M < MMin.value) MMin = { value: pt.M, x: xLoc, xOverL: xiLoc };

      if (pt.deflectionMm > deflectionMax.value) {
        deflectionMax = { value: pt.deflectionMm, x: xLoc, xOverL: xiLoc };
      }
      if (pt.sigmaMaxMpa > sigmaMax.value) {
        sigmaMax = { value: pt.sigmaMaxMpa, x: xLoc, xOverL: xiLoc };
      }
      if (pt.utilization > governingUtilization.value) {
        governingUtilization = { value: pt.utilization, x: xLoc, xOverL: xiLoc };
      }

      if (Math.abs(pt.N) > maxAbsN) maxAbsN = Math.abs(pt.N);
      if (Math.abs(pt.V) > maxAbsV) maxAbsV = Math.abs(pt.V);
      if (Math.abs(pt.M) > maxAbsM) maxAbsM = Math.abs(pt.M);
      if (pt.deflectionMm > maxDeflectionMm) maxDeflectionMm = pt.deflectionMm;
      if (pt.sigmaMaxMpa > maxSigmaMpa) maxSigmaMpa = pt.sigmaMaxMpa;
      if (pt.utilization > maxUtilization) maxUtilization = pt.utilization;
    }

    if (maxAbsN > globalMaxN) globalMaxN = maxAbsN;
    if (maxAbsV > globalMaxV) globalMaxV = maxAbsV;
    if (maxAbsM > globalMaxM) globalMaxM = maxAbsM;
    if (maxDeflectionMm > globalMaxDeflectionMm) globalMaxDeflectionMm = maxDeflectionMm;
    if (maxSigmaMpa > globalMaxSigmaMpa) globalMaxSigmaMpa = maxSigmaMpa;
    if (maxUtilization > globalMaxUtilization) {
      globalMaxUtilization = maxUtilization;
    }

    if (governingUtilization.value >= governingMember.utilization) {
      governingMember.elementId = element.id;
      governingMember.utilization = governingUtilization.value;
      governingMember.sigmaMaxMpa = sigmaMax.value;
      governingMember.fyMpa = element.material.fy;
      governingMember.x = governingUtilization.x;
      governingMember.xOverL = governingUtilization.xOverL;
    }

    const extrema: ElementEnvelopeExtrema = {
      NMax,
      NMin,
      VMax,
      VMin,
      MMax,
      MMin,
      deflectionMax,
      sigmaMax,
      governingUtilization,
    };

    elementResults[element.id] = {
      elementId: element.id,
      lengthM: L,
      cos,
      sin,
      localEndDisplacements: uMemberLocal,
      localEndForces: [
        fEndLocalSI[0] * 1e-3,
        fEndLocalSI[1] * 1e-3,
        fEndLocalSI[2] * 1e-3,
        fEndLocalSI[3] * 1e-3,
        fEndLocalSI[4] * 1e-3,
        fEndLocalSI[5] * 1e-3,
      ],
      stations,
      extrema,
      maxAbsN,
      maxAbsV,
      maxAbsM,
      maxDeflectionMm,
      maxSigmaMpa,
      maxUtilization,
    };
  }

  return {
    stable: true,
    statusMessage: sol.statusMessage,
    nodeResults,
    elementResults,
    governingMember,
    reactionSum: {
      sumRx: Number(sumRx.toFixed(4)),
      sumRy: Number(sumRy.toFixed(4)),
      sumMzAboutOrigin: Number(sumMzAboutOrigin.toFixed(4)),
    },
    globalMaxDeflectionMm,
    globalMaxN,
    globalMaxV,
    globalMaxM,
    globalMaxSigmaMpa,
    globalMaxUtilization,
  };
}
