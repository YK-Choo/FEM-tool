import React from '../vendor/react-runtime.ts';
import type { RenderLayerOptions } from '../renderer/CanvasRenderer.ts';
import type { HoverProbeData } from '../utils/geometry.ts';
import { Layers, Crosshair } from '../vendor/lucide-react.tsx';

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
    badgeActiveClass: string;
  }> = [
    {
      key: 'showDeformed',
      label: 'Deformed Shape',
      badge: 'u,v',
      activeClass: 'bg-blue-50 text-blue-700 border-blue-300 shadow-2xs',
      badgeActiveClass: 'bg-blue-600 text-white',
    },
    {
      key: 'showAxial',
      label: 'Axial Force',
      badge: 'N',
      activeClass: 'bg-purple-50 text-purple-700 border-purple-300 shadow-2xs',
      badgeActiveClass: 'bg-purple-600 text-white',
    },
    {
      key: 'showShear',
      label: 'Shear Force',
      badge: 'V',
      activeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs',
      badgeActiveClass: 'bg-emerald-600 text-white',
    },
    {
      key: 'showMoment',
      label: 'Bending Moment',
      badge: 'M',
      activeClass: 'bg-red-50 text-red-700 border-red-300 shadow-2xs',
      badgeActiveClass: 'bg-red-600 text-white',
    },
    {
      key: 'showReactions',
      label: 'Reactions',
      badge: 'R',
      activeClass: 'bg-teal-50 text-teal-700 border-teal-300 shadow-2xs',
      badgeActiveClass: 'bg-teal-600 text-white',
    },
    {
      key: 'showHeatmap',
      label: 'Stress Heatmap',
      badge: 'σ/fy',
      activeClass: 'bg-amber-50 text-amber-800 border-amber-300 shadow-2xs',
      badgeActiveClass: 'bg-amber-600 text-white',
    },
  ];

  return (
    <div id="layer-toggles-wrapper">
      {/* Top-Left Floating Result Overlay Toggles Bar */}
      <div
        id="result-overlay-toggles"
        className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5 bg-white/95 backdrop-blur-md border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-md select-none max-w-[calc(100%-24px)]"
      >
        <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 pr-1.5 border-r border-slate-200">
          <Layers size={13} className="text-blue-600" />
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
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span
                className={`font-mono text-[10px] font-bold px-1 py-0.2 rounded ${
                  isOn ? btn.badgeActiveClass : 'bg-slate-200 text-slate-700'
                }`}
              >
                {btn.badge}
              </span>
              <span>{btn.label}</span>
            </button>
          );
        })}

        {/* Moment Convention Toggle: Tension Face (default) vs Compression Face */}
        <div className="flex items-center gap-1 pl-1.5 border-l border-slate-200">
          <span className="text-[10px] text-slate-500 font-medium hidden md:inline">
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
            className="px-2 py-1 rounded text-[11px] font-mono font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 cursor-pointer transition-colors"
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
          className="fixed z-30 pointer-events-none bg-white/95 backdrop-blur-md border border-blue-300 rounded-lg px-3 py-2.5 shadow-xl text-xs font-mono text-slate-800 w-64"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-1.5">
            <span className="flex items-center gap-1.5 font-sans font-bold text-blue-700 text-xs">
              <Crosshair size={13} />
              {hoverProbe.element.id} · {hoverProbe.element.label || 'Member'}
            </span>
            <span className="text-[11px] text-slate-500">
              x = {hoverProbe.station.x.toFixed(2)} m
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-purple-700 font-semibold">N(x):</span>
              <span>{hoverProbe.station.N.toFixed(2)} kN</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-700 font-semibold">V(x):</span>
              <span>{hoverProbe.station.V.toFixed(2)} kN</span>
            </div>
            <div className="flex justify-between">
              <span className="text-red-600 font-semibold">M(x):</span>
              <span>{hoverProbe.station.M.toFixed(2)} kNm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-700 font-semibold">|δ(x)|:</span>
              <span>{hoverProbe.station.deflectionMm.toFixed(2)} mm</span>
            </div>
            <div className="flex justify-between col-span-2 pt-1 border-t border-slate-200">
              <span className="text-amber-700 font-semibold">σ_max(x):</span>
              <span>
                {hoverProbe.station.sigmaMaxMpa.toFixed(2)} MPa (
                {(hoverProbe.station.utilization * 100).toFixed(1)}% fy)
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

