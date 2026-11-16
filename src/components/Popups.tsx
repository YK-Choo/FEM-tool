import React from '../vendor/react-runtime.ts';
import type {
  StructuralModel,
  StructuralNode,
  Frame2DElement,
  StructuralLoad,
  CrossSectionShape,
  MaterialPresetName,
  SupportPreset,
  LoadCoordinateDirection,
} from '../types/model.ts';
import {
  computeCrossSection,
  createMaterialFromPreset,
  restraintsFromSupportPreset,
} from '../solver/sections.ts';
import { cartesianToPolar, polarToCartesian } from '../utils/coordinates.ts';
import { X, Pin, Trash2, Plus } from '../vendor/lucide-react.tsx';

/**
 * Mini SVG Cross-Section Preview (renders Rectangular, Circular, Hollow Rect Tube, I-Section, or Custom)
 */
function CrossSectionPreviewSvg({ element }: { element: Frame2DElement }) {
  const { shape, dimensions } = element.section;
  const b = dimensions.b ?? 250;
  const h = dimensions.h ?? 400;
  const d = dimensions.d ?? 300;
  const t = dimensions.t ?? 14;
  const tw = dimensions.tw ?? 10;
  const tf = dimensions.tf ?? 16;

  const maxDim = Math.max(b, h, d, 100);
  const scale = 58 / maxDim;

  const wScaled = b * scale;
  const hScaled = h * scale;
  const rScaled = (d * scale) / 2;

  return (
    <div className="flex flex-col items-center justify-center bg-slate-950/90 border border-slate-800 rounded-lg p-2 w-24 h-24 shrink-0">
      <svg width="72" height="72" viewBox="-38 -38 76 76" className="overflow-visible">
        {/* Neutral axis dashed line */}
        <line
          x1="-34"
          y1="0"
          x2="34"
          y2="0"
          stroke="rgba(56, 189, 248, 0.35)"
          strokeWidth="1"
          strokeDasharray="3 2"
        />
        {shape === 'rectangular' || shape === 'custom' ? (
          <rect
            x={-wScaled / 2}
            y={-hScaled / 2}
            width={wScaled}
            height={hScaled}
            fill="rgba(56, 189, 248, 0.22)"
            stroke="#38bdf8"
            strokeWidth="1.6"
          />
        ) : null}
        {shape === 'circular' ? (
          <circle
            cx="0"
            cy="0"
            r={rScaled}
            fill="rgba(56, 189, 248, 0.22)"
            stroke="#38bdf8"
            strokeWidth="1.6"
          />
        ) : null}
        {shape === 'hollow_rect' ? (
          <g>
            <rect
              x={-wScaled / 2}
              y={-hScaled / 2}
              width={wScaled}
              height={hScaled}
              fill="rgba(56, 189, 248, 0.22)"
              stroke="#38bdf8"
              strokeWidth="1.6"
            />
            <rect
              x={-(wScaled - 2 * Math.max(3, t * scale)) / 2}
              y={-(hScaled - 2 * Math.max(3, t * scale)) / 2}
              width={Math.max(4, wScaled - 2 * Math.max(3, t * scale))}
              height={Math.max(4, hScaled - 2 * Math.max(3, t * scale))}
              fill="#020617"
              stroke="#38bdf8"
              strokeWidth="1.2"
            />
          </g>
        ) : null}
        {shape === 'i_section' ? (
          <path
            d={(() => {
              const hw = wScaled / 2;
              const hh = hScaled / 2;
              const tfS = Math.max(3.5, tf * scale);
              const twS = Math.max(2.5, tw * scale);
              const htw = twS / 2;
              return `M ${-hw} ${-hh} H ${hw} V ${-hh + tfS} H ${htw} V ${hh - tfS} H ${hw} V ${hh} H ${-hw} V ${hh - tfS} H ${-htw} V ${-hh + tfS} H ${-hw} Z`;
            })()}
            fill="rgba(56, 189, 248, 0.25)"
            stroke="#38bdf8"
            strokeWidth="1.5"
          />
        ) : null}
      </svg>
    </div>
  );
}

export interface ContextualPopupProps {
  model: StructuralModel;
  selectedNodeId: string | null;
  selectedElementId: string | null;
  selectedLoadId: string | null;
  onUpdateModel: (updater: (prev: StructuralModel) => StructuralModel, recordUndo?: boolean) => void;
  onClose: () => void;
  onDeleteEntity: () => void;
  onPinParameter: (
    kind:
      | 'member_depth'
      | 'member_E'
      | 'node_spring_ky'
      | 'node_spring_krz'
      | 'load_magnitude',
    targetId: string
  ) => void;
  onQuickAddMemberLoad: (elementId: string, loadType: 'distributed' | 'point') => void;
  onQuickAddNodalLoad: (nodeId: string) => void;
}

export function ContextualPopup({
  model,
  selectedNodeId,
  selectedElementId,
  selectedLoadId,
  onUpdateModel,
  onClose,
  onDeleteEntity,
  onPinParameter,
  onQuickAddMemberLoad,
  onQuickAddNodalLoad,
}: ContextualPopupProps) {
  if (selectedElementId) {
    const el = model.elements.find(
      (e): e is Frame2DElement => e.kind === 'frame2d' && e.id === selectedElementId
    );
    if (!el) return null;
    const nodeI = model.nodes.find((n) => n.id === el.nodeI);
    const nodeJ = model.nodes.find((n) => n.id === el.nodeJ);
    if (!nodeI || !nodeJ) return null;

    const dx = nodeJ.x - nodeI.x;
    const dy = nodeJ.y - nodeI.y;
    const lengthM = Math.hypot(dx, dy);

    const handleLengthChange = (newLenRaw: number) => {
      const newLen = Math.max(0.1, Number(newLenRaw) || 0.1);
      if (lengthM < 1e-6) return;
      const ux = dx / lengthM;
      const uy = dy / lengthM;
      const nextJx = Number((nodeI.x + ux * newLen).toFixed(3));
      const nextJy = Number((nodeI.y + uy * newLen).toFixed(3));

      onUpdateModel((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === nodeJ.id ? { ...n, x: nextJx, y: nextJy } : n
        ),
      }));
    };

    const handleNodeCoordChange = (which: 'I' | 'J', axis: 'x' | 'y', valRaw: number) => {
      const val = Number(valRaw);
      if (!Number.isFinite(val)) return;
      const targetId = which === 'I' ? nodeI.id : nodeJ.id;
      onUpdateModel((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === targetId ? { ...n, [axis]: val } : n)),
      }));
    };

    const handleShapeChange = (shape: CrossSectionShape) => {
      const nextSec = computeCrossSection(shape, el.section.dimensions);
      onUpdateModel((prev) => ({
        ...prev,
        elements: prev.elements.map((item) =>
          item.id === el.id && item.kind === 'frame2d' ? { ...item, section: nextSec } : item
        ),
      }));
    };

    const handleDimChange = (dimKey: string, valRaw: number) => {
      const val = Math.max(1, Number(valRaw) || 1);
      const nextDims = { ...el.section.dimensions, [dimKey]: val };
      const nextSec = computeCrossSection(el.section.shape, nextDims, {
        A: el.section.A,
        I: el.section.I,
        S: el.section.S,
      });
      onUpdateModel((prev) => ({
        ...prev,
        elements: prev.elements.map((item) =>
          item.id === el.id && item.kind === 'frame2d' ? { ...item, section: nextSec } : item
        ),
      }));
    };

    const handleCustomSectionPropChange = (propKey: 'A' | 'I' | 'S', valRaw: number) => {
      const val = Math.max(1, Number(valRaw) || 1);
      const customProps = {
        A: propKey === 'A' ? val : el.section.A,
        I: propKey === 'I' ? val : el.section.I,
        S: propKey === 'S' ? val : el.section.S,
      };
      const nextSec = computeCrossSection('custom', el.section.dimensions, customProps);
      onUpdateModel((prev) => ({
        ...prev,
        elements: prev.elements.map((item) =>
          item.id === el.id && item.kind === 'frame2d' ? { ...item, section: nextSec } : item
        ),
      }));
    };

    const handleMaterialPresetChange = (preset: MaterialPresetName) => {
      const nextMat = createMaterialFromPreset(preset, el.material.E, el.material.fy);
      onUpdateModel((prev) => ({
        ...prev,
        elements: prev.elements.map((item) =>
          item.id === el.id && item.kind === 'frame2d' ? { ...item, material: nextMat } : item
        ),
      }));
    };

    const handleMaterialPropChange = (prop: 'E' | 'fy', valRaw: number) => {
      const val = Math.max(0.1, Number(valRaw) || 1);
      onUpdateModel((prev) => ({
        ...prev,
        elements: prev.elements.map((item) =>
          item.id === el.id && item.kind === 'frame2d'
            ? {
                ...item,
                material: {
                  ...item.material,
                  preset: 'custom',
                  name: 'Custom Material',
                  [prop]: val,
                },
              }
            : item
        ),
      }));
    };

    const toggleHinge = (end: 'releaseStart' | 'releaseEnd') => {
      onUpdateModel((prev) => ({
        ...prev,
        elements: prev.elements.map((item) =>
          item.id === el.id && item.kind === 'frame2d'
            ? { ...item, [end]: !item[end] }
            : item
        ),
      }));
    };

    const dims = el.section.dimensions;

    return (
      <div
        id="contextual-member-popup"
        className="absolute bottom-4 left-4 z-20 w-[410px] max-w-[calc(100vw-32px)] bg-slate-900/95 backdrop-blur-md border border-sky-500/40 rounded-xl shadow-2xl text-slate-100 p-3.5 select-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 block">
              1D Frame Element Inspector
            </span>
            <h3 className="text-sm font-bold text-slate-100">
              {el.id} · {el.label || 'Structural Member'} ({nodeI.id} → {nodeJ.id})
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDeleteEntity}
              title="Delete Member"
              className="p-1.5 rounded-md text-rose-400 hover:bg-rose-500/20 cursor-pointer"
            >
              <Trash2 size={14} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close Inspector"
              className="p-1.5 rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Geometry: Length (m) and Start/End Node Coordinates (m) */}
        <div className="grid grid-cols-5 gap-2 mb-3 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 text-xs">
          <div className="col-span-1">
            <label className="text-[10px] text-slate-400 block mb-0.5">Length (m)</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={Number(lengthM.toFixed(3))}
              onChange={(e: any) => handleLengthChange( parseFloat(e.target.value) )}
              className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs text-sky-300"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-0.5">{nodeI.id} X (m)</label>
            <input
              type="number"
              step="0.1"
              value={nodeI.x}
              onChange={(e: any) => handleNodeCoordChange('I', 'x', parseFloat(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-0.5">{nodeI.id} Y (m)</label>
            <input
              type="number"
              step="0.1"
              value={nodeI.y}
              onChange={(e: any) => handleNodeCoordChange('I', 'y', parseFloat(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-0.5">{nodeJ.id} X (m)</label>
            <input
              type="number"
              step="0.1"
              value={nodeJ.x}
              onChange={(e: any) => handleNodeCoordChange('J', 'x', parseFloat(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-0.5">{nodeJ.id} Y (m)</label>
            <input
              type="number"
              step="0.1"
              value={nodeJ.y}
              onChange={(e: any) => handleNodeCoordChange('J', 'y', parseFloat(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
            />
          </div>
        </div>

        {/* Cross-Section Shape Preset + Mini SVG Preview + Dimensions (mm) */}
        <div className="flex gap-3 mb-3">
          <CrossSectionPreviewSvg element={el} />

          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-medium text-slate-300">Cross-Section:</label>
              <select
                value={el.section.shape}
                onChange={(e: any) => handleShapeChange(e.target.value as CrossSectionShape)}
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
              >
                <option value="rectangular">Rectangular (b × h)</option>
                <option value="circular">Circular (Ø d)</option>
                <option value="hollow_rect">Hollow Tube (b × h × t)</option>
                <option value="i_section">I-Section (h × b × tw × tf)</option>
                <option value="custom">Custom (A, I, S)</option>
              </select>
            </div>

            {/* Dimension Inputs in mm */}
            {el.section.shape === 'rectangular' ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block">Width b (mm)</label>
                  <input
                    type="number"
                    step="10"
                    value={dims.b ?? 300}
                    onChange={(e: any) => handleDimChange('b', parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Depth h (mm)</label>
                  <input
                    type="number"
                    step="10"
                    value={dims.h ?? 500}
                    onChange={(e: any) => handleDimChange('h', parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs"
                  />
                </div>
              </div>
            ) : null}

            {el.section.shape === 'circular' ? (
              <div>
                <label className="text-[10px] text-slate-400 block">Diameter d (mm)</label>
                <input
                  type="number"
                  step="10"
                  value={dims.d ?? 300}
                  onChange={(e: any) => handleDimChange('d', parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs"
                />
              </div>
            ) : null}

            {el.section.shape === 'hollow_rect' ? (
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="text-[10px] text-slate-400 block">b (mm)</label>
                  <input
                    type="number"
                    step="10"
                    value={dims.b ?? 200}
                    onChange={(e: any) => handleDimChange('b', parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">h (mm)</label>
                  <input
                    type="number"
                    step="10"
                    value={dims.h ?? 300}
                    onChange={(e: any) => handleDimChange('h', parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Wall t (mm)</label>
                  <input
                    type="number"
                    step="1"
                    value={dims.t ?? 12}
                    onChange={(e: any) => handleDimChange('t', parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
                  />
                </div>
              </div>
            ) : null}

            {el.section.shape === 'i_section' ? (
              <div className="grid grid-cols-4 gap-1.5">
                <div>
                  <label className="text-[10px] text-slate-400 block">h (mm)</label>
                  <input
                    type="number"
                    step="10"
                    value={dims.h ?? 360}
                    onChange={(e: any) => handleDimChange('h', parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">b (mm)</label>
                  <input
                    type="number"
                    step="10"
                    value={dims.b ?? 170}
                    onChange={(e: any) => handleDimChange('b', parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">tw (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={dims.tw ?? 8}
                    onChange={(e: any) => handleDimChange('tw', parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">tf (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={dims.tf ?? 12.7}
                    onChange={(e: any) => handleDimChange('tf', parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
                  />
                </div>
              </div>
            ) : null}

            {el.section.shape === 'custom' ? (
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="text-[10px] text-slate-400 block">A (mm²)</label>
                  <input
                    type="number"
                    step="100"
                    value={el.section.A}
                    onChange={(e: any) =>
                      handleCustomSectionPropChange('A', parseFloat(e.target.value))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">I (mm⁴)</label>
                  <input
                    type="number"
                    step="1000000"
                    value={el.section.I}
                    onChange={(e: any) =>
                      handleCustomSectionPropChange('I', parseFloat(e.target.value))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">S (mm³)</label>
                  <input
                    type="number"
                    step="10000"
                    value={el.section.S}
                    onChange={(e: any) =>
                      handleCustomSectionPropChange('S', parseFloat(e.target.value))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
                  />
                </div>
              </div>
            ) : null}

            {/* Auto-computed A, I, S readout */}
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 bg-slate-950/70 px-2 py-1 rounded border border-slate-800/80">
              <span>A={el.section.A.toExponential(2)} mm²</span>
              <span>I={el.section.I.toExponential(2)} mm⁴</span>
              <span>S={el.section.S.toExponential(2)} mm³</span>
            </div>
          </div>
        </div>

        {/* Material Presets & Properties (E in GPa, fy in MPa) */}
        <div className="grid grid-cols-3 gap-2 mb-3 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
          <div>
            <label className="text-[10px] text-slate-400 block mb-0.5">Material Preset</label>
            <select
              value={el.material.preset}
              onChange={(e: any) =>
                handleMaterialPresetChange(e.target.value as MaterialPresetName)
              }
              className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs"
            >
              <option value="steel">Steel (200 GPa)</option>
              <option value="concrete">Concrete (30 GPa)</option>
              <option value="timber">Timber (11 GPa)</option>
              <option value="custom">Custom E, fy</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-0.5">Modulus E (GPa)</label>
            <input
              type="number"
              step="5"
              min="0.5"
              value={el.material.E}
              onChange={(e: any) => handleMaterialPropChange('E', parseFloat(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-0.5">Yield fy (MPa)</label>
            <input
              type="number"
              step="5"
              min="1"
              value={el.material.fy}
              onChange={(e: any) => handleMaterialPropChange('fy', parseFloat(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
            />
          </div>
        </div>

        {/* Member End Moment Releases (Hinges) + Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleHinge('releaseStart')}
              className={`px-2.5 py-1 rounded text-xs font-medium border cursor-pointer transition-colors ${
                el.releaseStart
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400/60'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              ○ Start Hinge ({nodeI.id})
            </button>
            <button
              type="button"
              onClick={() => toggleHinge('releaseEnd')}
              className={`px-2.5 py-1 rounded text-xs font-medium border cursor-pointer transition-colors ${
                el.releaseEnd
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400/60'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              ○ End Hinge ({nodeJ.id})
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPinParameter('member_depth', el.id)}
              title="Pin Section Depth (h) to Real-Time Sensitivity Slider"
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-400/40 cursor-pointer"
            >
              <Pin size={11} />
              <span>Pin h</span>
            </button>
            <button
              type="button"
              onClick={() => onPinParameter('member_E', el.id)}
              title="Pin Young's Modulus (E) to Real-Time Sensitivity Slider"
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-400/40 cursor-pointer"
            >
              <Pin size={11} />
              <span>Pin E</span>
            </button>
            <button
              type="button"
              onClick={() => onQuickAddMemberLoad(el.id, 'distributed')}
              title="Add Distributed Load on this Member"
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-400/40 cursor-pointer"
            >
              <Plus size={11} />
              <span>Add Load</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedNodeId) {
    const node = model.nodes.find((n) => n.id === selectedNodeId);
    if (!node) return null;
    const polar = cartesianToPolar(node.x, node.y);

    const updateNode = (patch: Partial<StructuralNode>) => {
      onUpdateModel((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === node.id ? { ...n, ...patch } : n)),
      }));
    };

    const handleSupportChange = (support: SupportPreset) => {
      updateNode({
        support,
        restraints: restraintsFromSupportPreset(support),
        inclinedAngleDeg:
          support === 'inclinedRoller' ? (node.inclinedAngleDeg ?? 30) : node.inclinedAngleDeg,
      });
    };

    const handlePolarInput = (r: number, thetaDeg: number) => {
      const cart = polarToCartesian(r, thetaDeg);
      updateNode({ x: cart.x, y: cart.y });
    };

    return (
      <div
        id="contextual-node-popup"
        className="absolute bottom-4 left-4 z-20 w-[370px] max-w-[calc(100vw-32px)] bg-slate-900/95 backdrop-blur-md border border-teal-500/40 rounded-xl shadow-2xl text-slate-100 p-3.5 select-none"
      >
        <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-teal-400 block">
              Node & Support Inspector
            </span>
            <h3 className="text-sm font-bold text-slate-100">
              {node.id} · {node.label || 'Structural Node'} (z = 0.0 m)
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDeleteEntity}
              title="Delete Node"
              className="p-1.5 rounded-md text-rose-400 hover:bg-rose-500/20 cursor-pointer"
            >
              <Trash2 size={14} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Cartesian (X, Y) and Polar (r, theta) Coordinates */}
        <div className="grid grid-cols-4 gap-2 mb-3 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
          <div>
            <label className="text-[10px] text-slate-400 block mb-0.5">X (m)</label>
            <input
              type="number"
              step="0.1"
              value={node.x}
              onChange={(e: any) => updateNode({ x: parseFloat(e.target.value) || 0 })}
              className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-0.5">Y (m)</label>
            <input
              type="number"
              step="0.1"
              value={node.y}
              onChange={(e: any) => updateNode({ y: parseFloat(e.target.value) || 0 })}
              className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-sky-400 block mb-0.5">Polar r (m)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={polar.r}
              onChange={(e: any) =>
                handlePolarInput(parseFloat(e.target.value) || 0, polar.thetaDeg)
              }
              className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs text-sky-300"
            />
          </div>
          <div>
            <label className="text-[10px] text-sky-400 block mb-0.5">Angle θ (°)</label>
            <input
              type="number"
              step="5"
              value={polar.thetaDeg}
              onChange={(e: any) =>
                handlePolarInput(polar.r, parseFloat(e.target.value) || 0)
              }
              className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs text-sky-300"
            />
          </div>
        </div>

        {/* Nodal Restraint Support Preset */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-slate-300">Support Preset:</label>
            <select
              value={node.support}
              onChange={(e: any) => handleSupportChange(e.target.value as SupportPreset)}
              className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100"
            >
              <option value="none">Free Joint (No Rigid Restraint)</option>
              <option value="fixed">Fixed (ux, uy, θz fixed)</option>
              <option value="pinned">Pinned (ux, uy fixed)</option>
              <option value="rollerX">Roller X (uy fixed, rolls along X)</option>
              <option value="rollerY">Roller Y (ux fixed, rolls along Y)</option>
              <option value="inclinedRoller">Custom Inclined Roller (Angle α)</option>
            </select>
          </div>

          {node.support === 'inclinedRoller' ? (
            <div className="flex items-center justify-between bg-teal-950/40 border border-teal-500/40 rounded px-2.5 py-1.5">
              <label className="text-xs text-teal-200">Incline Angle α (deg):</label>
              <input
                type="number"
                step="5"
                min="-180"
                max="180"
                value={node.inclinedAngleDeg ?? 30}
                onChange={(e: any) =>
                  updateNode({ inclinedAngleDeg: parseFloat(e.target.value) || 0 })
                }
                className="w-24 bg-slate-900 border border-teal-500/50 rounded px-2 py-0.5 font-mono text-xs text-teal-200"
              />
            </div>
          ) : null}
        </div>

        {/* Elastic Springs (kx, ky in kN/m, krz in kNm/rad) */}
        <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 mb-3">
          <span className="text-[10px] font-mono uppercase tracking-wider text-purple-300 block mb-1.5">
            Elastic Nodal Springs (Added to Global [K] Diagonal)
          </span>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">kx (kN/m)</label>
              <input
                type="number"
                step="1000"
                min="0"
                value={node.springs.kx}
                onChange={(e: any) =>
                  updateNode({
                    springs: { ...node.springs, kx: Math.max(0, parseFloat(e.target.value) || 0) },
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">ky (kN/m)</label>
              <input
                type="number"
                step="1000"
                min="0"
                value={node.springs.ky}
                onChange={(e: any) =>
                  updateNode({
                    springs: { ...node.springs, ky: Math.max(0, parseFloat(e.target.value) || 0) },
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">kθ (kNm/rad)</label>
              <input
                type="number"
                step="1000"
                min="0"
                value={node.springs.krz}
                onChange={(e: any) =>
                  updateNode({
                    springs: {
                      ...node.springs,
                      krz: Math.max(0, parseFloat(e.target.value) || 0),
                    },
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs"
              />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPinParameter('node_spring_ky', node.id)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-400/40 cursor-pointer"
            >
              <Pin size={11} />
              <span>Pin ky</span>
            </button>
            <button
              type="button"
              onClick={() => onPinParameter('node_spring_krz', node.id)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-400/40 cursor-pointer"
            >
              <Pin size={11} />
              <span>Pin kθ</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => onQuickAddNodalLoad(node.id)}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-400/40 cursor-pointer"
          >
            <Plus size={11} />
            <span>Add Nodal Force</span>
          </button>
        </div>
      </div>
    );
  }

  if (selectedLoadId) {
    const load = model.loads.find((l) => l.id === selectedLoadId);
    if (!load) return null;

    const updateLoad = (patch: Partial<StructuralLoad>) => {
      onUpdateModel((prev) => ({
        ...prev,
        loads: prev.loads.map((l) => (l.id === load.id ? ({ ...l, ...patch } as StructuralLoad) : l)),
      }));
    };

    const convertMemberLoadKind = (targetKind: 'member_distributed' | 'member_point') => {
      if (load.kind === targetKind) return;
      if (load.kind === 'member_distributed' && targetKind === 'member_point') {
        const el = model.elements.find(
          (e): e is Frame2DElement => e.kind === 'frame2d' && e.id === load.elementId
        );
        const ni = el ? model.nodes.find((n) => n.id === el.nodeI) : undefined;
        const nj = el ? model.nodes.find((n) => n.id === el.nodeJ) : undefined;
        const L = ni && nj ? Math.hypot(nj.x - ni.x, nj.y - ni.y) : 4.0;
        const nextLoad: StructuralLoad = {
          id: load.id,
          kind: 'member_point',
          elementId: load.elementId,
          p: load.w1 * 2,
          a: Number((L * 0.5).toFixed(2)),
          direction: load.direction,
          label: 'Member Point Load',
        };
        onUpdateModel((prev) => ({
          ...prev,
          loads: prev.loads.map((l) => (l.id === load.id ? nextLoad : l)),
        }));
      } else if (load.kind === 'member_point' && targetKind === 'member_distributed') {
        const nextLoad: StructuralLoad = {
          id: load.id,
          kind: 'member_distributed',
          elementId: load.elementId,
          w1: Number((load.p / 2).toFixed(1)),
          w2: Number((load.p / 2).toFixed(1)),
          direction: load.direction,
          label: 'Distributed Load',
        };
        onUpdateModel((prev) => ({
          ...prev,
          loads: prev.loads.map((l) => (l.id === load.id ? nextLoad : l)),
        }));
      }
    };

    return (
      <div
        id="contextual-load-popup"
        className="absolute bottom-4 left-4 z-20 w-[370px] max-w-[calc(100vw-32px)] bg-slate-900/95 backdrop-blur-md border border-amber-500/50 rounded-xl shadow-2xl text-slate-100 p-3.5 select-none"
      >
        <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block">
              Load Parameter Editor
            </span>
            <h3 className="text-sm font-bold text-slate-100">
              {load.id} · {load.label || load.kind}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDeleteEntity}
              title="Delete Load"
              className="p-1.5 rounded-md text-rose-400 hover:bg-rose-500/20 cursor-pointer"
            >
              <Trash2 size={14} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Switch between Distributed (UDL/Trapezoidal) and Point Load for Member Loads */}
        {load.kind === 'member_distributed' || load.kind === 'member_point' ? (
          <div className="flex items-center gap-1.5 mb-2.5 bg-slate-950/70 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => convertMemberLoadKind('member_distributed')}
              className={`flex-1 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                load.kind === 'member_distributed'
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-400/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Distributed (w1, w2)
            </button>
            <button
              type="button"
              onClick={() => convertMemberLoadKind('member_point')}
              className={`flex-1 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                load.kind === 'member_point'
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-400/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Point Load (P @ a)
            </button>
          </div>
        ) : null}

        {load.kind === 'member_distributed' ? (
          <div className="space-y-2.5 mb-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">
                  Start w1 @ x=0 (kN/m)
                </label>
                <input
                  type="number"
                  step="2"
                  value={load.w1}
                  onChange={(e: any) => updateLoad({ w1: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-amber-200"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">
                  End w2 @ x=L (kN/m)
                </label>
                <input
                  type="number"
                  step="2"
                  value={load.w2}
                  onChange={(e: any) => updateLoad({ w2: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-amber-200"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <label className="text-xs text-slate-300">Coordinate Direction:</label>
              <select
                value={load.direction}
                onChange={(e: any) =>
                  updateLoad({ direction: e.target.value as LoadCoordinateDirection })
                }
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
              >
                <option value="local_perp">Local Perpendicular (+y)</option>
                <option value="global_x">Global X (Lateral)</option>
                <option value="global_y">Global Y (Vertical)</option>
              </select>
            </div>
          </div>
        ) : null}

        {load.kind === 'member_point' ? (
          <div className="space-y-2.5 mb-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">
                  Magnitude P (kN)
                </label>
                <input
                  type="number"
                  step="5"
                  value={load.p}
                  onChange={(e: any) => updateLoad({ p: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-amber-200"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">
                  Position a from Start (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={load.a}
                  onChange={(e: any) =>
                    updateLoad({ a: Math.max(0, parseFloat(e.target.value) || 0) })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-amber-200"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <label className="text-xs text-slate-300">Coordinate Direction:</label>
              <select
                value={load.direction}
                onChange={(e: any) =>
                  updateLoad({ direction: e.target.value as LoadCoordinateDirection })
                }
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
              >
                <option value="local_perp">Local Perpendicular (+y)</option>
                <option value="global_x">Global X (Horizontal)</option>
                <option value="global_y">Global Y (Vertical)</option>
              </select>
            </div>
          </div>
        ) : null}

        {load.kind === 'nodal' ? (
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">Fx (kN)</label>
              <input
                type="number"
                step="5"
                value={load.fx}
                onChange={(e: any) => updateLoad({ fx: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-amber-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">Fy (kN)</label>
              <input
                type="number"
                step="5"
                value={load.fy}
                onChange={(e: any) => updateLoad({ fy: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-amber-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">Moment Mz (kNm)</label>
              <input
                type="number"
                step="5"
                value={load.mz}
                onChange={(e: any) => updateLoad({ mz: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-amber-200"
              />
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onPinParameter('load_magnitude', load.id)}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-400/40 cursor-pointer"
          >
            <Pin size={12} />
            <span>Pin Load Magnitude to Live Sensitivity Slider</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
}
