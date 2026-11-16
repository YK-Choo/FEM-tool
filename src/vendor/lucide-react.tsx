import React from './react-runtime.ts';

export interface LucideIconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function createLucideIcon(paths: Array<{ tag: string; attrs: Record<string, any> }>) {
  return function IconComponent({
    size = 16,
    className = '',
    strokeWidth = 2,
  }: LucideIconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        {paths.map((p, idx) => React.createElement(p.tag, { key: idx, ...p.attrs }))}
      </svg>
    );
  };
}

export const MousePointer = createLucideIcon([
  { tag: 'path', attrs: { d: 'm3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z' } },
  { tag: 'path', attrs: { d: 'm13 13 6 6' } },
]);

export const PenTool = createLucideIcon([
  { tag: 'path', attrs: { d: 'm12 19 7-7 3 3-7 7-3-3z' } },
  { tag: 'path', attrs: { d: 'm18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z' } },
  { tag: 'path', attrs: { d: 'm2 2 7.586 7.586' } },
  { tag: 'circle', attrs: { cx: '11', cy: '11', r: '2' } },
]);

export const Anchor = createLucideIcon([
  { tag: 'circle', attrs: { cx: '12', cy: '5', r: '3' } },
  { tag: 'line', attrs: { x1: '12', y1: '22', x2: '12', y2: '8' } },
  { tag: 'path', attrs: { d: 'M5 12H2a10 10 0 0 0 20 0h-3' } },
]);

export const ArrowDownToDot = createLucideIcon([
  { tag: 'path', attrs: { d: 'M12 2v14' } },
  { tag: 'path', attrs: { d: 'm19 9-7 7-7-7' } },
  { tag: 'circle', attrs: { cx: '12', cy: '21', r: '1' } },
]);

export const AlignVerticalSpaceAround = createLucideIcon([
  { tag: 'rect', attrs: { width: '10', height: '6', x: '7', y: '9', rx: '2' } },
  { tag: 'path', attrs: { d: 'M22 20H2' } },
  { tag: 'path', attrs: { d: 'M22 4H2' } },
]);

export const Trash2 = createLucideIcon([
  { tag: 'path', attrs: { d: 'M3 6h18' } },
  { tag: 'path', attrs: { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' } },
  { tag: 'path', attrs: { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' } },
  { tag: 'line', attrs: { x1: '10', y1: '11', x2: '10', y2: '17' } },
  { tag: 'line', attrs: { x1: '14', y1: '11', x2: '14', y2: '17' } },
]);

export const Undo2 = createLucideIcon([
  { tag: 'path', attrs: { d: 'M9 14 4 9l5-5' } },
  { tag: 'path', attrs: { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11' } },
]);

export const Redo2 = createLucideIcon([
  { tag: 'path', attrs: { d: 'm15 14 5-5-5-5' } },
  { tag: 'path', attrs: { d: 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13' } },
]);

export const Download = createLucideIcon([
  { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' } },
  { tag: 'polyline', attrs: { points: '7 10 12 15 17 10' } },
  { tag: 'line', attrs: { x1: '12', y1: '15', x2: '12', y2: '3' } },
]);

export const Upload = createLucideIcon([
  { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' } },
  { tag: 'polyline', attrs: { points: '17 8 12 3 7 8' } },
  { tag: 'line', attrs: { x1: '12', y1: '3', x2: '12', y2: '15' } },
]);

export const Sliders = createLucideIcon([
  { tag: 'line', attrs: { x1: '4', y1: '21', x2: '4', y2: '14' } },
  { tag: 'line', attrs: { x1: '4', y1: '10', x2: '4', y2: '3' } },
  { tag: 'line', attrs: { x1: '12', y1: '21', x2: '12', y2: '12' } },
  { tag: 'line', attrs: { x1: '12', y1: '8', x2: '12', y2: '3' } },
  { tag: 'line', attrs: { x1: '20', y1: '21', x2: '20', y2: '16' } },
  { tag: 'line', attrs: { x1: '20', y1: '12', x2: '20', y2: '3' } },
  { tag: 'line', attrs: { x1: '2', y1: '14', x2: '6', y2: '14' } },
  { tag: 'line', attrs: { x1: '10', y1: '8', x2: '14', y2: '8' } },
  { tag: 'line', attrs: { x1: '18', y1: '16', x2: '22', y2: '16' } },
]);

export const Activity = createLucideIcon([
  { tag: 'polyline', attrs: { points: '22 12 18 12 15 21 9 3 6 12 2 12' } },
]);

export const Layers = createLucideIcon([
  { tag: 'polygon', attrs: { points: '12 2 2 7 12 12 22 7 12 2' } },
  { tag: 'polyline', attrs: { points: '2 17 12 22 22 17' } },
  { tag: 'polyline', attrs: { points: '2 12 12 17 22 12' } },
]);

export const Maximize2 = createLucideIcon([
  { tag: 'polyline', attrs: { points: '15 3 21 3 21 9' } },
  { tag: 'polyline', attrs: { points: '9 21 3 21 3 15' } },
  { tag: 'line', attrs: { x1: '21', y1: '3', x2: '14', y2: '10' } },
  { tag: 'line', attrs: { x1: '3', y1: '21', x2: '10', y2: '14' } },
]);

export const ZoomIn = createLucideIcon([
  { tag: 'circle', attrs: { cx: '11', cy: '11', r: '8' } },
  { tag: 'line', attrs: { x1: '21', y1: '21', x2: '16.65', y2: '16.65' } },
  { tag: 'line', attrs: { x1: '11', y1: '8', x2: '11', y2: '14' } },
  { tag: 'line', attrs: { x1: '8', y1: '11', x2: '14', y2: '11' } },
]);

export const ZoomOut = createLucideIcon([
  { tag: 'circle', attrs: { cx: '11', cy: '11', r: '8' } },
  { tag: 'line', attrs: { x1: '21', y1: '21', x2: '16.65', y2: '16.65' } },
  { tag: 'line', attrs: { x1: '8', y1: '11', x2: '14', y2: '11' } },
]);

export const Compass = createLucideIcon([
  { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
  { tag: 'polygon', attrs: { points: '16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76' } },
]);

export const AlertTriangle = createLucideIcon([
  {
    tag: 'path',
    attrs: {
      d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z',
    },
  },
  { tag: 'line', attrs: { x1: '12', y1: '9', x2: '12', y2: '13' } },
  { tag: 'line', attrs: { x1: '12', y1: '17', x2: '12.01', y2: '17' } },
]);

export const CheckCircle2 = createLucideIcon([
  { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
  { tag: 'path', attrs: { d: 'm9 12 2 2 4-4' } },
]);

export const X = createLucideIcon([
  { tag: 'line', attrs: { x1: '18', y1: '6', x2: '6', y2: '18' } },
  { tag: 'line', attrs: { x1: '6', y1: '6', x2: '18', y2: '18' } },
]);

export const Plus = createLucideIcon([
  { tag: 'line', attrs: { x1: '12', y1: '5', x2: '12', y2: '19' } },
  { tag: 'line', attrs: { x1: '5', y1: '12', x2: '19', y2: '12' } },
]);

export const Pin = createLucideIcon([
  { tag: 'line', attrs: { x1: '12', y1: '17', x2: '12', y2: '22' } },
  {
    tag: 'path',
    attrs: {
      d: 'M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z',
    },
  },
]);

export const RotateCcw = createLucideIcon([
  { tag: 'path', attrs: { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' } },
  { tag: 'path', attrs: { d: 'M3 3v5h5' } },
]);

export const Grid = createLucideIcon([
  { tag: 'rect', attrs: { width: '18', height: '18', x: '3', y: '3', rx: '2' } },
  { tag: 'path', attrs: { d: 'M3 9h18' } },
  { tag: 'path', attrs: { d: 'M3 15h18' } },
  { tag: 'path', attrs: { d: 'M9 3v18' } },
  { tag: 'path', attrs: { d: 'M15 3v18' } },
]);

export const Crosshair = createLucideIcon([
  { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
  { tag: 'line', attrs: { x1: '22', y1: '12', x2: '18', y2: '12' } },
  { tag: 'line', attrs: { x1: '6', y1: '12', x2: '2', y2: '12' } },
  { tag: 'line', attrs: { x1: '12', y1: '6', x2: '12', y2: '2' } },
  { tag: 'line', attrs: { x1: '12', y1: '22', x2: '12', y2: '18' } },
]);

export const Boxes = createLucideIcon([
  {
    tag: 'path',
    attrs: {
      d: 'M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z',
    },
  },
  {
    tag: 'path',
    attrs: {
      d: 'm12 13.5 5-3 4.03 2.42a2 2 0 0 1 .97 1.71v3.24a2 2 0 0 1-.97 1.71l-3 1.8a2 2 0 0 1-2.06 0L12 19v-5.5Z',
    },
  },
  {
    tag: 'path',
    attrs: {
      d: 'm7 10.5 5-3 5 3-5 3-5-3Z',
    },
  },
]);

export const Gauge = createLucideIcon([
  { tag: 'path', attrs: { d: 'm12 14 4-4' } },
  { tag: 'path', attrs: { d: 'M3.34 19a10 10 0 1 1 17.32 0' } },
]);

export const FilePlus = createLucideIcon([
  { tag: 'path', attrs: { d: 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z' } },
  { tag: 'polyline', attrs: { points: '14 2 14 8 20 8' } },
  { tag: 'line', attrs: { x1: '12', y1: '18', x2: '12', y2: '12' } },
  { tag: 'line', attrs: { x1: '9', y1: '15', x2: '15', y2: '15' } },
]);

export const PlusSquare = createLucideIcon([
  { tag: 'rect', attrs: { width: '18', height: '18', x: '3', y: '3', rx: '2' } },
  { tag: 'line', attrs: { x1: '12', y1: '8', x2: '12', y2: '16' } },
  { tag: 'line', attrs: { x1: '8', y1: '12', x2: '16', y2: '12' } },
]);

export const FolderOpen = createLucideIcon([
  {
    tag: 'path',
    attrs: {
      d: 'm6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2',
    },
  },
]);

