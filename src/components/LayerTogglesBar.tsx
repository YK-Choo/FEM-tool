import React from '../vendor/react-runtime.ts';
import type { RenderLayerOptions } from '../renderer/CanvasRenderer.ts';
import type { HoverProbeData } from '../utils/geometry.ts';
import { Layers, Activity, Crosshair } from '../vendor/lucide-react.tsx';

export interface LayerTogglesBarProps {
  layers: RenderLayerOptions;
  onUpdateLayers: (patch: Partial<RenderLayerOptions>) => void;
  hoverProbe: HoverProbeData | null;
}

export function LayerTogglesBar({
  layers,
  onUpdateLayers,
  hoverProbe,
}: LayerTogglesBarProps) {
  const toggleButtons: Array<{
    key: keyof RenderLayerOptions;
    label: string;
    badge: string;
    activeClass: string;
  }> = [
    {
      key: 'showDeformed',
      label: 'Deformed Shape',
      badge: 'u,v',
      activeClass: 'bg-sky-500/20 text-sky-300 border-sky-400/60',
    },
    {
      key: 'showAxial',
      label: 'Axial Force',
      badge: 'N',
      activeClass: 'bg-purple-500/20 text-purple-300 border-purple-400/60',
    },
    {
      key: 'showShear',
      label: 'Shear Force',
      badge: 'V',
      activeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/60',
    },
    {
      key: 'showMoment',
      label: 'Bending Moment',
      badge: 'M',
      activeClass: 'bg-rose-500/20 text-rose-300 border-rose-400/60',
    },
    {
      key: 'showReactions',
      label: 'Reactions',
      badge: 'R',
      activeClass: 'bg-teal-500/20 text-teal-300 border-teal-400/60',
    },
    {
      key: 'showHeatmap',
      label: 'Stress Heatmap',
      badge: 'σ/fy',
      activeClass: 'bg-amber-500/20 text-amber-300 border-amber-400/60',
    },
  ];

  return (
    <>
      {/* Top-Left Floating Result Overlay Toggles Bar */}
      <div
        id="result-overlay-toggles"
        className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-xl select-none max-w-[calc(100%-24px)]"
      >
        <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 pr-1.5 border-r border-slate-700/80">
          <Layers size={13} className="text-sky-400" />
          <span className="hidden sm:inline">Overlays</span>
        </div>

        {toggleButtons.map((btn) => {
          const isOn = Boolean(layers[btn.key]);
          return (
            <button
              key={btn.key}
              id={`layer-toggle-${btn.key}`}
              type="button"
              onClick={() => onUpdateLayers({ [btn.key]: !isOn })}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border transition-all cursor-pointer ${
                isOn
                  ? btn.activeClass
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span className="font-mono text-[10px] font-bold px-1 py-0.2 rounded bg-slate-950/60">
                {btn.badge}
              </span>
              <span>{btn.label}</span>
            </button>
          );
        })}

        {/* Moment Convention Toggle: Tension Face (default) vs Compression Face */}
        <div className="flex items-center gap-1 pl-1.5 border-l border-slate-700/80">
          <span className="text-[10px] text-slate-400 font-medium hidden md:inline">
            M Side:
          </span>
          <button
            id="moment-convention-toggle"
            type="button"
            onClick={() =>
              onUpdateLayers({
                momentSide: layers.momentSide === 'tension' ? 'compression' : 'tension',
              })
            }
            title="Toggle Bending Moment Diagram Plotting Side: Tension Face (Default) vs Compression Face"
            className="px-2 py-1 rounded text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/40 cursor-pointer transition-colors"
          >
            {layers.momentSide === 'tension' ? 'Tension Face' : 'Compression Face'}
          </button>
        </div>
      </div>

      {/* Interactive Hover Probe Floating Callout */}
      {hoverProbe ? (
        <div
          id="interactive-hover-probe"
          style={{
            left: `${Math.min(window.innerWidth - 340, Math.max(12, hoverProbe.screenX + 18))}px`,
            top: `${Math.max(64, hoverProbe.screenY - 96)}px`,
          }}
          className="fixed z-30 pointer-events-none bg-slate-950/95 backdrop-blur-md border border-sky-400/60 rounded-lg px-3 py-2.5 shadow-2xl text-xs font-mono text-slate-100 w-64"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5">
            <span className="flex items-center gap-1.5 font-sans font-bold text-sky-300 text-xs">
              <Crosshair size={13} />
              {hoverProbe.element.id} · {hoverProbe.element.label || 'Member'}
            </span>
            <span className="text-[11px] text-slate-400">
              x = {hoverProbe.station.x.toFixed(2)} m
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-purple-300">N(x):</span>
              <span>{hoverProbe.station.N.toFixed(2)} kN</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-300">V(x):</span>
              <span>{hoverProbe.station.V.toFixed(2)} kN</span>
            </div>
            <div className="flex justify-between">
              <span className="text-rose-300">M(x):</span>
              <span>{hoverProbe.station.M.toFixed(2)} kNm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sky-300">|δ(x)|:</span>
              <span>{hoverProbe.station.deflectionMm.toFixed(2)} mm</span>
            </div>
            <div className="flex justify-between col-span-2 pt-1 border-t border-slate-800/90">
              <span className="text-amber-300">σ_max(x):</span>
              <span>
                {hoverProbe.station.sigmaMaxMpa.toFixed(2)} MPa (
                {(hoverProbe.station.utilization * 100).toFixed(1)}% fy)
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
