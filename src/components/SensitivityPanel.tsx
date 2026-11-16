import React from '../vendor/react-runtime.ts';
import type {
  StructuralModel,
  SolverOutput,
  PinnedParameterTarget,
  Frame2DElement,
} from '../types/model.ts';
import type { RenderLayerOptions } from '../renderer/CanvasRenderer.ts';
import { Sliders, Gauge, RotateCcw, X, Plus, Pin, Activity } from '../vendor/lucide-react.tsx';

export interface SensitivityPanelProps {
  model: StructuralModel;
  solverOutput: SolverOutput;
  layers: RenderLayerOptions;
  onUpdateLayers: (patch: Partial<RenderLayerOptions>) => void;
  pinnedParams: PinnedParameterTarget[];
  onSlidePinnedParam: (pinId: string, multiplier: number) => void;
  onUnpinParam: (pinId: string) => void;
  onResetPinnedParams: () => void;
  onAddQuickPin: (
    kind: PinnedParameterTarget['kind'],
    targetId: string
  ) => void;
  onSelectEntity: (kind: 'node' | 'member' | 'load', id: string) => void;
}

export function SensitivityPanel({
  model,
  solverOutput,
  layers,
  onUpdateLayers,
  pinnedParams,
  onSlidePinnedParam,
  onUnpinParam,
  onResetPinnedParams,
  onAddQuickPin,
  onSelectEntity,
}: SensitivityPanelProps) {
  const [Collapsed, setCollapsed] = React.useState<boolean>(false);
  const [quickPinSelect, setQuickPinSelect] = React.useState<string>('');

  if (Collapsed) {
    return (
      <button
        id="btn-expand-sensitivity-panel"
        type="button"
        onClick={() => setCollapsed(false)}
        className="absolute top-3 right-3 z-20 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/95 border border-sky-500/40 text-sky-300 text-xs font-semibold shadow-xl cursor-pointer hover:bg-slate-800"
      >
        <Sliders size={14} />
        <span>Sensitivity & Telemetry</span>
      </button>
    );
  }

  const maxEtaPct = Math.min(999, solverOutput.globalMaxUtilization * 100);
  const etaBarColor =
    solverOutput.globalMaxUtilization > 1.0
      ? 'bg-rose-500'
      : solverOutput.globalMaxUtilization > 0.7
        ? 'bg-amber-400'
        : 'bg-emerald-400';

  // Build available quick-pin options from active model
  const quickPinOptions: Array<{ value: string; label: string }> = [];
  for (const ld of model.loads) {
    quickPinOptions.push({
      value: `load_magnitude:${ld.id}`,
      label: `Load ${ld.id}: ${ld.label || ld.kind}`,
    });
  }
  for (const el of model.elements) {
    if (el.kind === 'frame2d') {
      quickPinOptions.push({
        value: `member_depth:${el.id}`,
        label: `Member ${el.id} Depth h (${el.section.depthMm} mm)`,
      });
      quickPinOptions.push({
        value: `member_E:${el.id}`,
        label: `Member ${el.id} Modulus E (${el.material.E} GPa)`,
      });
    }
  }
  for (const n of model.nodes) {
    if (n.springs.ky > 0) {
      quickPinOptions.push({
        value: `node_spring_ky:${n.id}`,
        label: `Node ${n.id} Spring ky (${n.springs.ky} kN/m)`,
      });
    }
    if (n.springs.krz > 0) {
      quickPinOptions.push({
        value: `node_spring_krz:${n.id}`,
        label: `Node ${n.id} Rotational Spring kθ (${n.springs.krz} kNm/rad)`,
      });
    }
  }

  const handleQuickPinAdd = (val: string) => {
    if (!val) return;
    const [kind, targetId] = val.split(':') as [PinnedParameterTarget['kind'], string];
    if (kind && targetId) {
      onAddQuickPin(kind, targetId);
    }
    setQuickPinSelect('');
  };

  const formatCurrentPinValue = (pin: PinnedParameterTarget): string => {
    if (pin.kind === 'member_depth') {
      return `${Math.round(pin.baseValue * pin.multiplier)} mm`;
    }
    if (pin.kind === 'member_E') {
      return `${(pin.baseValue * pin.multiplier).toFixed(1)} GPa`;
    }
    if (pin.kind === 'node_spring_ky') {
      return `${Math.round(pin.baseValue * pin.multiplier)} kN/m`;
    }
    if (pin.kind === 'node_spring_krz') {
      return `${Math.round(pin.baseValue * pin.multiplier)} kNm/rad`;
    }
    if (pin.kind === 'load_magnitude') {
      const v1 = (pin.basePrimary * pin.multiplier).toFixed(1);
      if (pin.baseSecondary !== undefined && Math.abs(pin.baseSecondary - pin.basePrimary) > 0.05) {
        const v2 = (pin.baseSecondary * pin.multiplier).toFixed(1);
        return `${v1}→${v2} kN/m`;
      }
      return `${v1} kN`;
    }
    return '';
  };

  return (
    <aside
      id="realtime-sensitivity-panel"
      className="w-80 shrink-0 bg-slate-900/95 border-l border-slate-800 flex flex-col h-full overflow-y-auto select-none z-10 text-slate-100"
    >
      {/* Panel Title Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800 bg-slate-950/50">
        <div className="flex items-center gap-2">
          <Sliders size={15} className="text-sky-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Real-Time Sensitivity
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Collapse Panel"
          className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      {/* Section 1: Visual Scale Sliders (Deflection Exaggeration & Diagram Scale) */}
      <div className="p-3.5 border-b border-slate-800 space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium">Deflection Scale</span>
            <span className="font-mono text-sky-300 font-semibold">
              {layers.deflectionScale}×
            </span>
          </div>
          <input
            id="slider-deflection-scale"
            type="range"
            min="1"
            max="500"
            step="1"
            value={layers.deflectionScale}
            onChange={(e: any) =>
              onUpdateLayers({ deflectionScale: Number(e.target.value) })
            }
            className="w-full accent-sky-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-0.5">
            <span>1× (True)</span>
            <span>250×</span>
            <span>500×</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-medium">N / V / M Diagram Scale</span>
            <span className="font-mono text-rose-300 font-semibold">
              {layers.diagramScale.toFixed(1)}×
            </span>
          </div>
          <input
            id="slider-diagram-scale"
            type="range"
            min="0.2"
            max="3.0"
            step="0.1"
            value={layers.diagramScale}
            onChange={(e: any) =>
              onUpdateLayers({ diagramScale: Number(e.target.value) })
            }
            className="w-full accent-rose-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>
      </div>

      {/* Section 2: Live Parametric Sensitivity Sliders */}
      <div className="p-3.5 border-b border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Pin size={13} className="text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Parametric Sliders
            </span>
          </div>
          <button
            id="btn-reset-sensitivity"
            type="button"
            onClick={onResetPinnedParams}
            title="Reset all pinned multipliers to 1.0x"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
          >
            <RotateCcw size={11} />
            <span>1.0× Reset</span>
          </button>
        </div>

        <p className="text-[11px] text-slate-400 leading-snug">
          Drag any slider below to morph section stiffness, soil/joint springs, or loads at 60fps:
        </p>

        {/* Pinned Sliders List */}
        <div className="space-y-2.5 pt-1">
          {pinnedParams.map((pin) => (
            <div
              key={pin.id}
              className="bg-slate-950/80 border border-slate-800/90 rounded-lg p-2.5 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-slate-200 truncate">
                  {pin.label}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                    {pin.multiplier.toFixed(2)}× ({formatCurrentPinValue(pin)})
                  </span>
                  <button
                    type="button"
                    onClick={() => onUnpinParam(pin.id)}
                    title="Unpin parameter"
                    className="text-slate-500 hover:text-rose-400 cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              <input
                type="range"
                min="0.1"
                max="3.0"
                step="0.05"
                value={pin.multiplier}
                onChange={(e: any) =>
                  onSlidePinnedParam(pin.id, parseFloat(e.target.value))
                }
                className="w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />

              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>0.1×</span>
                <span>1.0× Base</span>
                <span>2.0×</span>
                <span>3.0×</span>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Pin Dropdown */}
        <div className="pt-1">
          <select
            id="quick-pin-parameter-select"
            value={quickPinSelect}
            onChange={(e: any) => handleQuickPinAdd(e.target.value)}
            className="w-full bg-slate-800/90 hover:bg-slate-800 text-xs text-slate-300 rounded-md px-2.5 py-1.5 border border-slate-700 cursor-pointer"
          >
            <option value="">+ Pin another member / spring / load parameter...</option>
            {quickPinOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Section 3: Live Peak Structural Response Telemetry */}
      <div className="p-3.5 border-b border-slate-800 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Gauge size={14} className="text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Peak Envelope Telemetry
          </span>
        </div>

        {/* Utilization Progress Bar + Governing Member Location */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Governing Utilization (σ_max / fy)</span>
            <span
              className={`font-mono font-bold ${
                solverOutput.globalMaxUtilization > 1.0
                  ? 'text-rose-400'
                  : solverOutput.globalMaxUtilization > 0.75
                    ? 'text-amber-300'
                    : 'text-emerald-300'
              }`}
            >
              {maxEtaPct.toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              style={{
                width: `${Math.min(100, Math.max(2, maxEtaPct))}%`,
              }}
              className={`h-full transition-all ${etaBarColor}`}
            />
          </div>
          {solverOutput.governingMember.elementId ? (
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-0.5">
              <span>
                Critical: <strong className="text-slate-200">{solverOutput.governingMember.elementId}</strong> @ x/L ={' '}
                {solverOutput.governingMember.xOverL.toFixed(2)}
              </span>
              <span>
                {solverOutput.governingMember.sigmaMaxMpa.toFixed(1)} / {solverOutput.governingMember.fyMpa} MPa
              </span>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 font-mono text-xs">
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2">
            <span className="text-[10px] font-sans text-slate-400 block">
              Max Deflection |δ|
            </span>
            <span className="text-sky-300 font-bold">
              {solverOutput.globalMaxDeflectionMm.toFixed(2)} mm
            </span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2">
            <span className="text-[10px] font-sans text-slate-400 block">
              Max Stress σ_max
            </span>
            <span className="text-amber-300 font-bold">
              {solverOutput.globalMaxSigmaMpa.toFixed(1)} MPa
            </span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2">
            <span className="text-[10px] font-sans text-slate-400 block">
              Max Moment |M|
            </span>
            <span className="text-rose-300 font-bold">
              {solverOutput.globalMaxM.toFixed(2)} kNm
            </span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2">
            <span className="text-[10px] font-sans text-slate-400 block">
              Max Shear |V| / Axial |N|
            </span>
            <span className="text-emerald-300 font-bold">
              {solverOutput.globalMaxV.toFixed(1)} / {solverOutput.globalMaxN.toFixed(1)} kN
            </span>
          </div>
        </div>
      </div>

      {/* Section 4: Per-Member Envelope Extrema & Support Reactions */}
      <div className="p-3.5 space-y-3 flex-1">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Activity size={14} className="text-sky-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Member Envelope Extrema (x/L)
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-[10.5px] font-mono text-left">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-1.5 px-2">ID</th>
                  <th className="py-1.5 px-1.5 text-right">M_ext (x/L)</th>
                  <th className="py-1.5 px-1.5 text-right">V_ext</th>
                  <th className="py-1.5 px-2 text-right">σ/fy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {model.elements
                  .filter((e): e is Frame2DElement => e.kind === 'frame2d')
                  .map((el) => {
                    const er = solverOutput.elementResults[el.id];
                    if (!er) return null;
                    const { extrema } = er;
                    const govM =
                      Math.abs(extrema.MMax.value) >= Math.abs(extrema.MMin.value)
                        ? extrema.MMax
                        : extrema.MMin;
                    const govV =
                      Math.abs(extrema.VMax.value) >= Math.abs(extrema.VMin.value)
                        ? extrema.VMax
                        : extrema.VMin;
                    return (
                      <tr
                        key={el.id}
                        onClick={() => onSelectEntity('member', el.id)}
                        className="hover:bg-slate-800/60 cursor-pointer transition-colors"
                      >
                        <td className="py-1.5 px-2 font-bold text-sky-300">{el.id}</td>
                        <td className="py-1.5 px-1.5 text-right text-rose-300">
                          {govM.value.toFixed(1)}{' '}
                          <span className="text-slate-500">({govM.xOverL.toFixed(2)})</span>
                        </td>
                        <td className="py-1.5 px-1.5 text-right text-emerald-300">
                          {govV.value.toFixed(1)}
                        </td>
                        <td className="py-1.5 px-2 text-right text-amber-300">
                          {(extrema.governingUtilization.value * 100).toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Activity size={14} className="text-teal-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Support & Spring Reactions
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-[11px] font-mono text-left">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-1.5 px-2">Node</th>
                  <th className="py-1.5 px-2 text-right">Rx (kN)</th>
                  <th className="py-1.5 px-2 text-right">Ry (kN)</th>
                  <th className="py-1.5 px-2 text-right">Mz (kNm)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {model.nodes
                  .filter((n) => solverOutput.nodeResults[n.id]?.hasReaction)
                  .map((n) => {
                    const nr = solverOutput.nodeResults[n.id];
                    return (
                      <tr
                        key={n.id}
                        onClick={() => onSelectEntity('node', n.id)}
                        className="hover:bg-slate-800/60 cursor-pointer transition-colors"
                      >
                        <td className="py-1.5 px-2 font-bold text-teal-300">{n.id}</td>
                        <td className="py-1.5 px-2 text-right">{nr.reactionFx.toFixed(1)}</td>
                        <td className="py-1.5 px-2 text-right">{nr.reactionFy.toFixed(1)}</td>
                        <td className="py-1.5 px-2 text-right">{nr.reactionMz.toFixed(1)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </aside>
  );
}
