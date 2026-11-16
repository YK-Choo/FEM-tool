# FEM Studio 2D — Interactive Structural Analysis Sandbox

Client-side, interactive 2D Structural Analysis web application built with **6-DOF 1D Euler-Bernoulli Plane Frame Finite Element Method (FEM)** elements, real-time parametric sensitivity sliders, and future-proofed 3D/continuum data schemas.

## Architecture & Separation of Concerns

- **`src/types/model.ts`**: 3D Cartesian `(x, y, z)` nodal storage (`z = 0` locked and out-of-plane DOFs $u_z, \theta_x, \theta_y$ restrained in 2D mode) and discriminated union schemas for `StructuralElement` (`'frame2d' | 'frame3d' | 'cst2d' | 'q4_2d'`) and `StructuralLoad` (`'nodal' | 'member_point' | 'member_distributed' | 'continuum_edge_2d'`).
- **`src/utils/coordinates.ts`**: Viewport screen-to-world transforms, `0.1 m` Cartesian grid snapping, Polar $(r, \theta)$ coordinate conversion ($x = r\cos\theta, y = r\sin\theta$), and T-junction mid-span member smart snapping.
- **`src/solver/`**: Framework-agnostic TypeScript FEM engine:
  - `sections.ts`: Cross-section geometry calculator ($\text{mm} \to A, I, S$) and material presets.
  - `assemble.ts`: 6-DOF local/global stiffness assembly, static condensation for member end hinges (`releaseStart`, `releaseEnd`), nodal elastic springs ($k_x, k_y, k_\theta$), and exact Fixed-End Forces (FEF) for point and uniform/trapezoidal distributed loads.
  - `solve.ts`: Gaussian elimination with scaled partial pivoting, custom inclined roller local boundary transformation ($\alpha^\circ$), pin-joint handling, and mechanism/instability detection.
  - `postprocess.ts`: Exact local equilibrium polynomial superposition for quadratic shear $V(x)$, cubic moment $M(x)$, quintic/Hermite deflection $v(x)$, and combined normal stress utilization $\eta = \sigma_{\max} / f_y$.
- **`src/renderer/CanvasRenderer.ts`**: Dedicated HTML5 `<canvas>` 60fps renderer with `devicePixelRatio` scaling, proportional member depths, hinges, supports, spring coils, load envelopes, N/V/M diagrams, and stress heatmaps.

## Quick Start

```bash
npm test       # Run unit & benchmark verification tests
npm run build  # Compile & bundle TypeScript/TSX into dist/
npm run dev    # Launch local server on http://localhost:5173
```