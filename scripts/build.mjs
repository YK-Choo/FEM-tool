import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { transpileTSX } from './tsx-compiler.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

/**
 * Self-contained compiled Tailwind CSS stylesheet covering all layout, positioning,
 * flexbox, grid, spacing, sizing, color, border, shadow, and interactive utility classes
 * used across FEM Studio 2D so layout and canvas coordinates are 100% deterministic
 * even offline or in sandboxed environments without external CDN access.
 */
export const COMPILED_TAILWIND_CSS = `
*, *::before, *::after { box-sizing: border-box; border-width: 0; border-style: solid; border-color: #e2e8f0; }
html, body, #root {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: #f8fafc;
  color: #0f172a;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
button, input, select, textarea {
  font-family: inherit;
  font-size: 100%;
  line-height: inherit;
  color: inherit;
  margin: 0;
  background-color: transparent;
}
button { cursor: pointer; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #f1f5f9; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button { opacity: 1; }

/* Display & Positioning */
.block { display: block; }
.inline { display: inline; }
.flex { display: flex; }
.grid { display: grid; }
.hidden { display: none; }
.relative { position: relative; }
.absolute { position: absolute; }
.fixed { position: fixed; }
.inset-x-0 { left: 0px; right: 0px; }
.top-3 { top: 0.75rem; }
.top-16 { top: 4rem; }
.bottom-0 { bottom: 0px; }
.bottom-9 { bottom: 2.25rem; }
.left-3 { left: 0.75rem; }
.left-4 { left: 1rem; }
.right-3 { right: 0.75rem; }
.right-4 { right: 1rem; }
.z-10 { z-index: 10; }
.z-20 { z-index: 20; }
.z-30 { z-index: 30; }

/* Flexbox & Grid */
.flex-1 { flex: 1 1 0%; }
.flex-col { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.shrink-0 { flex-shrink: 0; }
.items-center { align-items: center; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.grid-cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.col-span-1 { grid-column: span 1 / span 1; }
.col-span-2 { grid-column: span 2 / span 2; }
.gap-1 { gap: 0.25rem; }
.gap-1\\.5 { gap: 0.375rem; }
.gap-2 { gap: 0.5rem; }
.gap-2\\.5 { gap: 0.625rem; }
.gap-3 { gap: 0.75rem; }
.gap-4 { gap: 1rem; }
.gap-x-3 { column-gap: 0.75rem; }
.gap-y-1 { row-gap: 0.25rem; }

/* Space & Divide */
.space-y-1 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.25rem; }
.space-y-1\\.5 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.375rem; }
.space-y-2 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.5rem; }
.space-y-2\\.5 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.625rem; }
.space-y-3 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.75rem; }
.divide-y > :not([hidden]) ~ :not([hidden]) { border-top-width: 1px; }
.divide-slate-200 > :not([hidden]) ~ :not([hidden]) { border-color: #e2e8f0; }

/* Sizing & Overflow */
.w-8 { width: 2rem; }
.w-24 { width: 6rem; }
.w-64 { width: 16rem; }
.w-80 { width: 20rem; }
.w-full { width: 100%; }
.w-screen { width: 100vw; }
.w-\\[390px\\] { width: 390px; }
.w-\\[420px\\] { width: 420px; }
.max-w-lg { max-width: 32rem; }
.max-w-\\[calc\\(100\\%-24px\\)\\] { max-width: calc(100% - 24px); }
.max-w-\\[calc\\(100vw-32px\\)\\] { max-width: calc(100vw - 32px); }
.h-1\\.5 { height: 0.375rem; }
.h-2 { height: 0.5rem; }
.h-7 { height: 1.75rem; }
.h-8 { height: 2rem; }
.h-24 { height: 6rem; }
.h-full { height: 100%; }
.h-screen { height: 100vh; }
.min-h-0 { min-height: 0px; }
.overflow-hidden { overflow: hidden; }
.overflow-visible { overflow: visible; }
.overflow-y-auto { overflow-y: auto; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Padding & Margin */
.p-0\\.5 { padding: 0.125rem; }
.p-1 { padding: 0.25rem; }
.p-1\\.5 { padding: 0.375rem; }
.p-2 { padding: 0.5rem; }
.p-2\\.5 { padding: 0.625rem; }
.p-3\\.5 { padding: 0.875rem; }
.px-1 { padding-left: 0.25rem; padding-right: 0.25rem; }
.px-1\\.5 { padding-left: 0.375rem; padding-right: 0.375rem; }
.px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
.px-2\\.5 { padding-left: 0.625rem; padding-right: 0.625rem; }
.px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
.px-3\\.5 { padding-left: 0.875rem; padding-right: 0.875rem; }
.py-0\\.2 { padding-top: 0.05rem; padding-bottom: 0.05rem; }
.py-0\\.5 { padding-top: 0.125rem; padding-bottom: 0.125rem; }
.py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
.py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
.py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
.py-2\\.5 { padding-top: 0.625rem; padding-bottom: 0.625rem; }
.pt-0\\.5 { padding-top: 0.125rem; }
.pt-1 { padding-top: 0.25rem; }
.pb-1\\.5 { padding-bottom: 0.375rem; }
.pb-2 { padding-bottom: 0.5rem; }
.pl-1\\.5 { padding-left: 0.375rem; }
.pr-1\\.5 { padding-right: 0.375rem; }
.pr-2\\.5 { padding-right: 0.625rem; }
.mt-0\\.5 { margin-top: 0.125rem; }
.mb-0\\.5 { margin-bottom: 0.125rem; }
.mb-1 { margin-bottom: 0.25rem; }
.mb-1\\.5 { margin-bottom: 0.375rem; }
.mb-2\\.5 { margin-bottom: 0.625rem; }
.mb-3 { margin-bottom: 0.75rem; }

/* Borders & Radius */
.border { border-width: 1px; }
.border-t { border-top-width: 1px; }
.border-b { border-bottom-width: 1px; }
.border-l { border-left-width: 1px; }
.border-r { border-right-width: 1px; }
.border-transparent { border-color: transparent; }
.border-slate-200 { border-color: #e2e8f0; }
.border-slate-300 { border-color: #cbd5e1; }
.border-blue-200 { border-color: #bfdbfe; }
.border-blue-300 { border-color: #93c5fd; }
.border-blue-600 { border-color: #2563eb; }
.border-teal-300 { border-color: #5eead4; }
.border-teal-400 { border-color: #2dd4bf; }
.border-teal-600 { border-color: #0d9488; }
.border-emerald-300 { border-color: #6ee7b7; }
.border-amber-300 { border-color: #fcd34d; }
.border-amber-600 { border-color: #d97706; }
.border-red-200 { border-color: #fecaca; }
.border-red-300 { border-color: #fca5a5; }
.border-red-400 { border-color: #f87171; }
.border-red-600 { border-color: #dc2626; }
.border-purple-300 { border-color: #d8b4fe; }
.rounded { border-radius: 0.25rem; }
.rounded-md { border-radius: 0.375rem; }
.rounded-lg { border-radius: 0.5rem; }
.rounded-xl { border-radius: 0.75rem; }
.rounded-full { border-radius: 9999px; }

/* Backgrounds */
.bg-white { background-color: #ffffff; }
.bg-white\\/95 { background-color: rgba(255, 255, 255, 0.95); }
.bg-slate-50 { background-color: #f8fafc; }
.bg-slate-100 { background-color: #f1f5f9; }
.bg-slate-200 { background-color: #e2e8f0; }
.bg-blue-50 { background-color: #eff6ff; }
.bg-blue-600 { background-color: #2563eb; }
.bg-teal-50 { background-color: #f0fdfa; }
.bg-teal-600 { background-color: #0d9488; }
.bg-emerald-50 { background-color: #ecfdf5; }
.bg-amber-50 { background-color: #fffbeb; }
.bg-amber-600 { background-color: #d97706; }
.bg-red-50 { background-color: #fef2f2; }
.bg-red-50\\/95 { background-color: rgba(254, 242, 242, 0.95); }
.bg-red-600 { background-color: #dc2626; }
.bg-purple-50 { background-color: #faf5ff; }

/* Typography */
.font-sans { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.font-mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.text-\\[10px\\] { font-size: 10px; line-height: 1.35; }
.text-\\[10\\.5px\\] { font-size: 10.5px; line-height: 1.35; }
.text-\\[11px\\] { font-size: 11px; line-height: 1.4; }
.text-xs { font-size: 0.75rem; line-height: 1rem; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.uppercase { text-transform: uppercase; }
.tracking-wide { letter-spacing: 0.025em; }
.tracking-wider { letter-spacing: 0.05em; }
.leading-tight { line-height: 1.25; }
.leading-snug { line-height: 1.375; }
.text-left { text-align: left; }
.text-right { text-align: right; }

/* Text Colors */
.text-white { color: #ffffff; }
.text-slate-300 { color: #cbd5e1; }
.text-slate-400 { color: #94a3b8; }
.text-slate-500 { color: #64748b; }
.text-slate-600 { color: #475569; }
.text-slate-700 { color: #334155; }
.text-slate-800 { color: #1e293b; }
.text-slate-900 { color: #0f172a; }
.text-blue-100 { color: #dbeafe; }
.text-blue-600 { color: #2563eb; }
.text-blue-700 { color: #1d4ed8; }
.text-blue-800 { color: #1e40af; }
.text-teal-600 { color: #0d9488; }
.text-teal-700 { color: #0f766e; }
.text-teal-800 { color: #115e59; }
.text-teal-900 { color: #134e4a; }
.text-emerald-600 { color: #059669; }
.text-emerald-700 { color: #047857; }
.text-amber-600 { color: #d97706; }
.text-amber-700 { color: #b45309; }
.text-amber-800 { color: #92400e; }
.text-red-600 { color: #dc2626; }
.text-red-700 { color: #b91c1c; }
.text-red-900 { color: #7f1d1d; }
.text-purple-700 { color: #6d28d9; }

/* Shadows, Blur, Accents & Cursors */
.shadow-2xs { box-shadow: 0 1px 1px 0 rgba(0, 0, 0, 0.04); }
.shadow-xs { box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
.shadow-md { box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.06); }
.shadow-lg { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05); }
.shadow-xl { box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.10), 0 8px 10px -6px rgba(0, 0, 0, 0.06); }
.backdrop-blur { backdrop-filter: blur(8px); }
.backdrop-blur-md { backdrop-filter: blur(12px); }
.accent-blue-600 { accent-color: #2563eb; }
.accent-amber-600 { accent-color: #d97706; }
.accent-red-600 { accent-color: #dc2626; }
.select-none { user-select: none; }
.pointer-events-none { pointer-events: none; }
.cursor-default { cursor: default; }
.cursor-pointer { cursor: pointer; }
.cursor-crosshair { cursor: crosshair; }
.cursor-not-allowed { cursor: not-allowed; }
.transition-all { transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1); }
.transition-colors { transition: color, background-color, border-color 150ms cubic-bezier(0.4, 0, 0.2, 1); }

/* Hover & Focus States */
.hover\\:bg-white:hover { background-color: #ffffff; }
.hover\\:bg-slate-50:hover { background-color: #f8fafc; }
.hover\\:bg-slate-100:hover { background-color: #f1f5f9; }
.hover\\:bg-slate-200:hover { background-color: #e2e8f0; }
.hover\\:bg-slate-200\\/70:hover { background-color: rgba(226, 232, 240, 0.7); }
.hover\\:bg-blue-50:hover { background-color: #eff6ff; }
.hover\\:bg-blue-50\\/70:hover { background-color: rgba(239, 246, 255, 0.7); }
.hover\\:bg-blue-100:hover { background-color: #dbeafe; }
.hover\\:bg-teal-50:hover { background-color: #f0fdfa; }
.hover\\:bg-teal-50\\/70:hover { background-color: rgba(240, 253, 250, 0.7); }
.hover\\:bg-amber-50:hover { background-color: #fffbeb; }
.hover\\:bg-amber-100:hover { background-color: #fef3c7; }
.hover\\:bg-red-50:hover { background-color: #fef2f2; }
.hover\\:bg-red-100:hover { background-color: #fee2e2; }
.hover\\:bg-purple-100:hover { background-color: #f3e8ff; }
.hover\\:text-slate-900:hover { color: #0f172a; }
.hover\\:text-red-600:hover { color: #dc2626; }
.focus\\:outline-none:focus { outline: 2px solid transparent; outline-offset: 2px; }
.focus\\:border-blue-500:focus { border-color: #3b82f6; }

/* Responsive Breakpoints */
@media (min-width: 640px) {
  .sm\\:inline { display: inline; }
}
@media (min-width: 768px) {
  .md\\:inline { display: inline; }
}
@media (min-width: 1024px) {
  .lg\\:inline { display: inline; }
}
`;

/**
 * Resolve relative import paths in `src/`
 */
function resolveModulePath(fromFile, importSpec) {
  const baseDir = path.dirname(fromFile);
  const candidate = path.resolve(baseDir, importSpec);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }
  for (const ext of ['.ts', '.tsx', '.js', '.mjs']) {
    if (fs.existsSync(candidate + ext)) return candidate + ext;
  }
  throw new Error(`Cannot resolve import "${importSpec}" from ${fromFile}`);
}

/**
 * Bundle all TypeScript/TSX modules starting from `src/main.tsx` into a single
 * self-contained browser IIFE bundle using topological module ordering.
 */
export function buildProjectBundle() {
  const entryFile = path.resolve(rootDir, 'src/main.tsx');
  const visited = new Set();
  const orderedModules = [];

  function visit(filePath) {
    if (visited.has(filePath)) return;
    visited.add(filePath);

    const rawSource = fs.readFileSync(filePath, 'utf8');
    // Transpile JSX + strip TypeScript types first so `import type` statements are already stripped!
    const jsCode = transpileTSX(rawSource, path.relative(rootDir, filePath));

    // Find remaining runtime imports
    const importRegex =
      /import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]\s*;?/g;
    const deps = [];
    let match;
    while ((match = importRegex.exec(jsCode)) !== null) {
      const spec = match[2];
      if (spec.startsWith('.')) {
        const depPath = resolveModulePath(filePath, spec);
        deps.push({ fullMatch: match[0], clause: match[1]?.trim() || '', depPath });
        visit(depPath);
      }
    }

    orderedModules.push({ filePath, jsCode, deps });
  }

  visit(entryFile);

  // Assign each module a registry ID
  const moduleIds = new Map();
  orderedModules.forEach((m, idx) => {
    moduleIds.set(m.filePath, `__mod_${idx}`);
  });

  const moduleChunks = orderedModules.map((m) => {
    const modId = moduleIds.get(m.filePath);
    const relName = path.relative(rootDir, m.filePath);
    let code = m.jsCode;

    // Remove sourceURL comment added by stripTypeScriptTypes
    code = code.replace(/\/\/# sourceURL=.*$/gm, '');

    // Rewrite imports to read from `__modules[depId]`
    for (const dep of m.deps) {
      const depId = moduleIds.get(dep.depPath);
      const clause = dep.clause;
      let replacement = '';

      if (!clause) {
        replacement = '';
      } else if (clause.startsWith('* as ')) {
        const ns = clause.slice(5).trim();
        replacement = `const ${ns} = __modules.${depId};`;
      } else if (clause.startsWith('{')) {
        const inner = clause.replace(/\s+as\s+/g, ': ');
        replacement = `const ${inner} = __modules.${depId};`;
      } else if (clause.includes(',')) {
        const braceIdx = clause.indexOf('{');
        const defName = clause.slice(0, clause.indexOf(',')).trim();
        const namedPart = clause.slice(braceIdx).replace(/\s+as\s+/g, ': ');
        replacement = `const ${defName} = __modules.${depId}.default ?? __modules.${depId}; const ${namedPart} = __modules.${depId};`;
      } else {
        const defName = clause.trim();
        replacement = `const ${defName} = __modules.${depId}.default ?? __modules.${depId};`;
      }

      code = code.replace(dep.fullMatch, replacement);
    }

    // Rewrite exports to attach to `__exports`
    const exportedNames = [];

    // `export * from './foo.ts'`
    code = code.replace(/export\s+\*\s+from\s+['"]([^'"]+)['"]\s*;?/g, (_, spec) => {
      const depPath = resolveModulePath(m.filePath, spec);
      const depId = moduleIds.get(depPath);
      return `Object.assign(__exports, __modules.${depId});`;
    });

    // `export default ...`
    code = code.replace(/export\s+default\s+/g, '__exports.default = ');

    // `export const/let/var name = ...`
    code = code.replace(/export\s+(const|let|var)\s+([A-Za-z0-9_$]+)/g, (_, kw, name) => {
      exportedNames.push(name);
      return `${kw} ${name}`;
    });

    // `export function name...` / `export class name...`
    code = code.replace(/export\s+(function|class)\s+([A-Za-z0-9_$]+)/g, (_, kw, name) => {
      exportedNames.push(name);
      return `${kw} ${name}`;
    });

    const footer = exportedNames
      .map((name) => `__exports.${name} = ${name};`)
      .join('\n  ');

    return `// === Module: ${relName} (${modId}) ===
__modules.${modId} = (function() {
  const __exports = {};
  ${code}
  ${footer}
  return __exports;
})();`;
  });

  const bundle = `(function() {
  "use strict";
  const __modules = {};
${moduleChunks.join('\n\n')}
})();\n`;

  // Validate syntax via Node's V8 vm.Script
  new vm.Script(bundle, { filename: 'bundle.js' });

  const distDir = path.resolve(rootDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'bundle.js'), bundle, 'utf8');

  const html = generateStandaloneHtml(bundle);
  fs.writeFileSync(path.join(distDir, 'index.html'), html, 'utf8');

  const rootHtml = generateRootIndexHtml();
  fs.writeFileSync(path.join(rootDir, 'index.html'), rootHtml, 'utf8');

  return { bundle, html };
}

export function generateRootIndexHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FEM Studio 2D — Interactive Structural Analysis & 1D Finite Element Sandbox</title>
  <meta name="description" content="Client-side interactive 2D Euler-Bernoulli Plane Frame Finite Element Method (FEM) structural analysis sandbox with real-time sensitivity sliders, hinges, springs, and trapezoidal loads." />
  <style id="fem-studio-tailwind">${COMPILED_TAILWIND_CSS}</style>
</head>
<body class="bg-slate-50 text-slate-900 antialiased selection:bg-blue-500/20 selection:text-blue-900">
  <div id="root"></div>
  <script src="./dist/bundle.js"></script>
</body>
</html>
`;
}

export function generateStandaloneHtml(bundleCode) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FEM Studio 2D — Interactive Structural Analysis & 1D Finite Element Sandbox</title>
  <meta name="description" content="Client-side interactive 2D Euler-Bernoulli Plane Frame Finite Element Method (FEM) structural analysis sandbox with real-time sensitivity sliders, hinges, springs, and trapezoidal loads." />
  <style id="fem-studio-tailwind">${COMPILED_TAILWIND_CSS}</style>
</head>
<body class="bg-slate-50 text-slate-900 antialiased selection:bg-blue-500/20 selection:text-blue-900">
  <div id="root"></div>
  <script>
${bundleCode}
  </script>
</body>
</html>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { bundle } = buildProjectBundle();
  console.log(`Built dist/bundle.js (${(bundle.length / 1024).toFixed(1)} KB), dist/index.html, and index.html successfully.`);
}
