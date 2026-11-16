import type {
  CrossSection,
  CrossSectionDimensions,
  CrossSectionShape,
  Material,
  MaterialPresetName,
  SupportPreset,
  DofRestraints3D,
} from '../types/model.ts';

export const MATERIAL_PRESETS: Record<Exclude<MaterialPresetName, 'custom'>, Material> = {
  steel: {
    preset: 'steel',
    name: 'Structural Steel S355',
    E: 200,
    fy: 355,
    nu: 0.3,
  },
  concrete: {
    preset: 'concrete',
    name: 'Concrete C30/37',
    E: 30,
    fy: 35,
    nu: 0.2,
  },
  timber: {
    preset: 'timber',
    name: 'Glulam Timber GL24h',
    E: 11,
    fy: 24,
    nu: 0.25,
  },
};

export function createMaterialFromPreset(preset: MaterialPresetName, customE = 200, customFy = 355): Material {
  if (preset === 'custom') {
    return {
      preset: 'custom',
      name: 'Custom Material',
      E: Math.max(0.1, customE),
      fy: Math.max(1, customFy),
      nu: 0.25,
    };
  }
  return { ...MATERIAL_PRESETS[preset] };
}

/**
 * Auto-compute CrossSection properties A (mm^2), I (mm^4), S (mm^3) from dimensions in mm.
 */
export function computeCrossSection(
  shape: CrossSectionShape,
  dims: CrossSectionDimensions,
  customProps?: { A?: number; I?: number; S?: number; name?: string }
): CrossSection {
  if (shape === 'rectangular') {
    const b = Math.max(10, dims.b ?? 300);
    const h = Math.max(10, dims.h ?? 500);
    const A = b * h;
    const I = (b * Math.pow(h, 3)) / 12;
    const S = (b * Math.pow(h, 2)) / 6;
    return {
      shape: 'rectangular',
      name: customProps?.name ?? `Rect ${Math.round(b)}×${Math.round(h)} mm`,
      dimensions: { b, h },
      A: Number(A.toFixed(1)),
      I: Number(I.toFixed(1)),
      S: Number(S.toFixed(1)),
      depthMm: h,
    };
  }

  if (shape === 'circular') {
    const d = Math.max(10, dims.d ?? 300);
    const A = (Math.PI * d * d) / 4;
    const I = (Math.PI * Math.pow(d, 4)) / 64;
    const S = (Math.PI * Math.pow(d, 3)) / 32;
    return {
      shape: 'circular',
      name: customProps?.name ?? `Circular Ø${Math.round(d)} mm`,
      dimensions: { d },
      A: Number(A.toFixed(1)),
      I: Number(I.toFixed(1)),
      S: Number(S.toFixed(1)),
      depthMm: d,
    };
  }

  if (shape === 'hollow_rect') {
    const b = Math.max(20, dims.b ?? 200);
    const h = Math.max(20, dims.h ?? 300);
    const t = Math.min(Math.min(b, h) * 0.45, Math.max(2, dims.t ?? 12));
    const bi = Math.max(0, b - 2 * t);
    const hi = Math.max(0, h - 2 * t);
    const A = b * h - bi * hi;
    const I = (b * Math.pow(h, 3) - bi * Math.pow(hi, 3)) / 12;
    const S = (2 * I) / h;
    return {
      shape: 'hollow_rect',
      name: customProps?.name ?? `RHS ${Math.round(b)}×${Math.round(h)}×${Math.round(t)} mm`,
      dimensions: { b, h, t },
      A: Number(A.toFixed(1)),
      I: Number(I.toFixed(1)),
      S: Number(S.toFixed(1)),
      depthMm: h,
    };
  }

  if (shape === 'i_section') {
    const h = Math.max(40, dims.h ?? 360);
    const b = Math.max(30, dims.b ?? 170);
    const tf = Math.min(h * 0.4, Math.max(3, dims.tf ?? 12.7));
    const tw = Math.min(b * 0.8, Math.max(2, dims.tw ?? 8.0));
    const hw = Math.max(0, h - 2 * tf);
    const A = 2 * b * tf + hw * tw;
    const I = (b * Math.pow(h, 3) - (b - tw) * Math.pow(hw, 3)) / 12;
    const S = (2 * I) / h;
    return {
      shape: 'i_section',
      name: customProps?.name ?? `I-Beam ${Math.round(h)}×${Math.round(b)}×${tw}/${tf} mm`,
      dimensions: { h, b, tw, tf },
      A: Number(A.toFixed(1)),
      I: Number(I.toFixed(1)),
      S: Number(S.toFixed(1)),
      depthMm: h,
    };
  }

  // Custom A, I, S
  const h = Math.max(20, dims.h ?? 350);
  const A = Math.max(10, customProps?.A ?? 7500);
  const I = Math.max(1000, customProps?.I ?? 1.2e8);
  const S = Math.max(100, customProps?.S ?? (2 * I) / h);
  return {
    shape: 'custom',
    name: customProps?.name ?? 'Custom Section',
    dimensions: { h },
    A,
    I,
    S,
    depthMm: h,
  };
}

/**
 * Compute 3D DOF restraints from a 2D SupportPreset (with out-of-plane DOFs uz, rx, ry locked).
 */
export function restraintsFromSupportPreset(support: SupportPreset): DofRestraints3D {
  switch (support) {
    case 'fixed':
      return { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true };
    case 'pinned':
      return { ux: true, uy: true, uz: true, rx: true, ry: true, rz: false };
    case 'rollerX':
      // Rolls along X -> uy is restrained
      return { ux: false, uy: true, uz: true, rx: true, ry: true, rz: false };
    case 'rollerY':
      // Rolls along Y -> ux is restrained
      return { ux: true, uy: false, uz: true, rx: true, ry: true, rz: false };
    case 'inclinedRoller':
      // Normal displacement un is restrained in rotated coordinates
      return { ux: false, uy: true, uz: true, rx: true, ry: true, rz: false };
    case 'none':
    default:
      return { ux: false, uy: false, uz: true, rx: true, ry: true, rz: false };
  }
}
