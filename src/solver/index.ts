import type { StructuralModel, SolverResults, SolverOutput } from '../types/model.ts';
import { assembleSystem } from './assemble.ts';
import { solveAssembledSystem } from './solve.ts';
import { postProcessSolution } from './postprocess.ts';

export * from './sections.ts';
export * from './assemble.ts';
export * from './solve.ts';
export * from './postprocess.ts';

/**
 * Full 2D Plane Frame FEM Analysis pipeline:
 * 1. Assemble global stiffness matrix [K] and load vector {F} in base SI (m, N, Pa)
 *    with static condensation for member end hinges and exact trapezoidal/point FEFs.
 * 2. Solve [K]{U} = {F} via Gaussian elimination with scaled partial pivoting,
 *    inclined roller transformations, and mechanism stability checks.
 * 3. Post-process exact quadratic shear V(x), cubic moment M(x), Hermite+local deflection v(x),
 *    per-member envelope extrema (N_max/min, V_max/min, M_max/min with x/L locations),
 *    and combined normal stress utilization eta(x) = sigma_max(x) / fy.
 */
export function analyzeStructure(
  model: StructuralModel,
  subdivisions: number = 48
): SolverResults {
  try {
    const sys = assembleSystem(model);
    const sol = solveAssembledSystem(model, sys);
    return postProcessSolution(model, sys, sol, subdivisions);
  } catch (err) {
    return {
      stable: false,
      statusMessage: 'Unstable Structure',
      instabilityReason: err instanceof Error ? err.message : 'Numerical solver error',
      nodeResults: {},
      elementResults: {},
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
}

export type { SolverResults, SolverOutput };
