import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { transpileTSX } from './tsx-compiler.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

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

  return { bundle, html };
}

export function generateStandaloneHtml(bundleCode) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FEM Studio 2D — Interactive Structural Analysis & 1D Finite Element Sandbox</title>
  <meta name="description" content="Client-side interactive 2D Euler-Bernoulli Plane Frame Finite Element Method (FEM) structural analysis sandbox with real-time sensitivity sliders, hinges, springs, and trapezoidal loads." />
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
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
    /* Custom Scrollbar for Dockable Panels */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #f1f5f9; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    input[type="number"]::-webkit-inner-spin-button,
    input[type="number"]::-webkit-outer-spin-button {
      opacity: 1;
    }
  </style>
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
  console.log(`Built dist/bundle.js (${(bundle.length / 1024).toFixed(1)} KB) and dist/index.html successfully.`);
}
