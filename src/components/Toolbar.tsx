import React from '../vendor/react-runtime.ts';
import type { StructuralModel, SolverOutput } from '../types/model.ts';
import type { CoordinateSystemDisplay } from '../utils/coordinates.ts';
import { BENCHMARK_PRESETS } from '../presets/benchmarks.ts';
import {
  MousePointer,
  PenTool,
  Anchor,
  ArrowDownToDot,
  AlignVerticalSpaceAround,
  Trash2,
  Undo2,
  Redo2,
  Download,
  Upload,
  FilePlus,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Compass,
  AlertTriangle,
  CheckCircle2,
  Boxes,
  PlusCircle,
} from '../vendor/lucide-react.tsx';

export type ActiveToolMode =
  | 'select'
  | 'add_node'
  | 'draw_member'
  | 'assign_support'
  | 'add_nodal_load'
  | 'add_member_load'
  | 'delete';

export interface ToolbarProps {
  activePresetId: string;
  onSelectPreset: (presetId: string) => void;
  onNewProject: () => void;
  activeTool: ActiveToolMode;
  onSelectTool: (tool: ActiveToolMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExportJson: () => void;
  onImportJson: (jsonText: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  coordSystem: CoordinateSystemDisplay;
  onToggleCoordSystem: () => void;
  solverOutput: SolverOutput;
  model: StructuralModel;
}

export function Toolbar({
  activePresetId,
  onSelectPreset,
  onNewProject,
  activeTool,
  onSelectTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExportJson,
  onImportJson,
  onZoomIn,
  onZoomOut,
  onFitView,
  coordSystem,
  onToggleCoordSystem,
  solverOutput,
}: ToolbarProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const tools: Array<{
    id: ActiveToolMode;
    label: string;
    shortcut: string;
    icon: any;
  }> = [
    { id: 'select', label: 'Select / Inspect', shortcut: 'V', icon: MousePointer },
    { id: 'add_node', label: 'Add Node', shortcut: 'A', icon: PlusCircle },
    { id: 'draw_member', label: 'Draw Member', shortcut: 'M', icon: PenTool },
    { id: 'assign_support', label: 'Assign Support', shortcut: 'S', icon: Anchor },
    { id: 'add_nodal_load', label: 'Nodal Load', shortcut: 'N', icon: ArrowDownToDot },
    {
      id: 'add_member_load',
      label: 'Member Load',
      shortcut: 'L',
      icon: AlignVerticalSpaceAround,
    },
    { id: 'delete', label: 'Delete', shortcut: 'Del', icon: Trash2 },
  ];

  const handleFileChange = (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportJson(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <header
      id="app-top-toolbar"
      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-white border-b border-slate-200 text-slate-900 shadow-xs select-none z-20"
    >
      {/* Left: Brand, New Blank Project Button & Benchmark Preset Selector */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2 pr-2.5 border-r border-slate-200">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <Boxes size={18} />
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-wider uppercase text-slate-900 leading-tight">
              FEM Studio 2D
            </h1>
            <p className="text-[10px] font-mono text-slate-500 leading-tight">
              6-DOF Euler-Bernoulli · SI
            </p>
          </div>
        </div>

        {/* New Blank Project Button */}
        <button
          id="btn-new-project"
          type="button"
          onClick={onNewProject}
          title="New Blank Project (Clears workspace to empty 0.1 m grid; Undo with Ctrl+Z)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-300 transition-colors cursor-pointer shadow-2xs"
        >
          <FilePlus size={14} className="text-blue-600" />
          <span>New</span>
        </button>

        {/* Benchmark Presets Dropdown */}
        <div className="flex items-center gap-1.5">
          <label
            htmlFor="preset-benchmark-select"
            className="text-[11px] font-medium text-slate-500 hidden sm:inline"
          >
            Preset:
          </label>
          <select
            id="preset-benchmark-select"
            value={activePresetId}
            onChange={(e: any) => {
              if (e.target.value === 'blank') {
                onNewProject();
              } else {
                onSelectPreset(e.target.value);
              }
            }}
            className="bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-medium rounded-md px-2.5 py-1.5 border border-slate-300 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
          >
            {activePresetId === 'blank' ? (
              <option value="blank">Blank Workspace (0.1 m Grid)</option>
            ) : null}
            {BENCHMARK_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.badge})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Center: Interactive CAD Modeling Tools */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
        {tools.map((t) => {
          const IconComp = t.icon;
          const active = activeTool === t.id;
          const isDelete = t.id === 'delete';
          return (
            <button
              key={t.id}
              id={`tool-btn-${t.id}`}
              type="button"
              onClick={() => onSelectTool(t.id)}
              title={`${t.label} (${t.shortcut})`}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                active
                  ? isDelete
                    ? 'bg-red-600 text-white border border-red-600 shadow-xs'
                    : 'bg-blue-600 text-white border border-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white border border-transparent'
              }`}
            >
              <IconComp size={14} />
              <span className="hidden md:inline">{t.label}</span>
              <span
                className={`text-[10px] font-mono hidden lg:inline ${
                  active ? 'text-blue-100' : 'text-slate-400'
                }`}
              >
                [{t.shortcut}]
              </span>
            </button>
          );
        })}
      </div>

      {/* Right: Stability Status Pill, Undo/Redo, Viewport & JSON I/O */}
      <div className="flex items-center gap-2">
        {/* Prominent Stability Status Indicator */}
        {solverOutput.stable ? (
          <div
            id="solver-status-badge"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-700 text-xs font-mono"
            title={solverOutput.statusMessage}
          >
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span className="font-semibold">Stable</span>
          </div>
        ) : (
          <div
            id="solver-status-badge"
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 border border-red-400 text-red-700 text-xs font-mono"
            title={solverOutput.instabilityReason || 'Mechanism or empty structure'}
          >
            <AlertTriangle size={14} className="text-red-600" />
            <span className="font-bold tracking-wide uppercase">Unstable Structure</span>
          </div>
        )}

        {/* Undo / Redo */}
        <div className="flex items-center bg-slate-100 rounded-md border border-slate-200 p-0.5">
          <button
            id="btn-undo"
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title="Undo (Ctrl+Z)"
            className={`p-1.5 rounded transition-colors ${
              canUndo
                ? 'text-slate-700 hover:bg-white hover:text-slate-900 cursor-pointer'
                : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            <Undo2 size={14} />
          </button>
          <button
            id="btn-redo"
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title="Redo (Ctrl+Y)"
            className={`p-1.5 rounded transition-colors ${
              canRedo
                ? 'text-slate-700 hover:bg-white hover:text-slate-900 cursor-pointer'
                : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            <Redo2 size={14} />
          </button>
        </div>

        {/* Zoom & Polar/Cartesian Overlay Controls */}
        <div className="flex items-center bg-slate-100 rounded-md border border-slate-200 p-0.5">
          <button
            id="btn-zoom-in"
            type="button"
            onClick={onZoomIn}
            title="Zoom In"
            className="p-1.5 rounded text-slate-700 hover:bg-white hover:text-slate-900 cursor-pointer"
          >
            <ZoomIn size={14} />
          </button>
          <button
            id="btn-zoom-out"
            type="button"
            onClick={onZoomOut}
            title="Zoom Out"
            className="p-1.5 rounded text-slate-700 hover:bg-white hover:text-slate-900 cursor-pointer"
          >
            <ZoomOut size={14} />
          </button>
          <button
            id="btn-fit-view"
            type="button"
            onClick={onFitView}
            title="Fit Structure to Viewport"
            className="p-1.5 rounded text-slate-700 hover:bg-white hover:text-slate-900 cursor-pointer"
          >
            <Maximize2 size={14} />
          </button>
          <button
            id="btn-coord-mode"
            type="button"
            onClick={onToggleCoordSystem}
            title="Toggle Cartesian (x,y) vs Polar (r,θ) Coordinate Overlay"
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono cursor-pointer transition-colors ${
              coordSystem === 'polar'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-slate-700 hover:bg-white hover:text-slate-900'
            }`}
          >
            <Compass size={13} />
            <span>{coordSystem === 'polar' ? '(r,θ)' : '(x,y)'}</span>
          </button>
        </div>

        {/* JSON Import (Upload) / Export (Download) */}
        <div className="flex items-center bg-slate-100 rounded-md border border-slate-200 p-0.5">
          <button
            id="btn-import-json"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Import Model from JSON"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-900 cursor-pointer"
          >
            <Upload size={13} className="text-blue-600" />
            <span>Import</span>
          </button>
          <button
            id="btn-export-json"
            type="button"
            onClick={onExportJson}
            title="Export Model as JSON"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-900 cursor-pointer"
          >
            <Download size={13} className="text-emerald-600" />
            <span>Export</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>
    </header>
  );
}

