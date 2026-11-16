(function() {
  "use strict";
  const __modules = {};
// === Module: src/vendor/react-runtime.ts (__mod_0) ===
__modules.__mod_0 = (function() {
  const __exports = {};
  /**
 * Lightweight, Fine-Grained React 18-Compatible VDOM Runtime & Hooks Engine
 *
 * Preserves DOM nodes (<canvas>, focused <input>, active range sliders, SVG icons)
 * across state updates for smooth 60fps CAD interaction and real-time sensitivity sliders.
 */

const Fragment = Symbol.for('react.fragment');

                        
            
                             
                  
                              
 

function createElement(
  type     ,
  props                            ,
  ...rawChildren       
)        {
  const normalizedProps                      = props ? { ...props } : {};
  const key = normalizedProps.key !== undefined ? normalizedProps.key : null;
  delete normalizedProps.key;

  const flatChildren        = [];
  const flatten = (arr       ) => {
    for (const item of arr) {
      if (Array.isArray(item)) {
        flatten(item);
      } else if (item !== null && item !== undefined && item !== false && item !== true) {
        flatChildren.push(item);
      }
    }
  };
  flatten(rawChildren);

  normalizedProps.children = flatChildren;
  return {
    type,
    props: normalizedProps,
    children: flatChildren,
    key,
  };
}

                             
               
                    
                                    
 

let currentInstance                           = null;
let rootRenderScheduled = false;
let activeRootRender                      = null;

function scheduleRender() {
  if (rootRenderScheduled || !activeRootRender) return;
  rootRenderScheduled = true;
  queueMicrotask(() => {
    rootRenderScheduled = false;
    if (activeRootRender) activeRootRender();
  });
}

function flushSyncRender() {
  rootRenderScheduled = false;
  if (activeRootRender) activeRootRender();
}

function useState   (initialValue               )                                            {
  if (!currentInstance) throw new Error('useState called outside component');
  const inst = currentInstance;
  const idx = inst.hookIndex++;

  if (idx >= inst.hooks.length) {
    const init =
      typeof initialValue === 'function' ? (initialValue           )() : initialValue;
    inst.hooks.push(init);
  }

  const setState = (next                      ) => {
    const prev = inst.hooks[idx];
    const resolved = typeof next === 'function' ? (next               )(prev) : next;
    if (!Object.is(prev, resolved)) {
      inst.hooks[idx] = resolved;
      scheduleRender();
    }
  };

  return [inst.hooks[idx], setState];
}

function useRef   (initialValue   )                 {
  if (!currentInstance) throw new Error('useRef called outside component');
  const inst = currentInstance;
  const idx = inst.hookIndex++;
  if (idx >= inst.hooks.length) {
    inst.hooks.push({ current: initialValue });
  }
  return inst.hooks[idx];
}

function useMemo   (factory         , deps        )    {
  if (!currentInstance) throw new Error('useMemo called outside component');
  const inst = currentInstance;
  const idx = inst.hookIndex++;
  const prev = inst.hooks[idx];

  if (!prev || !deps || !areDepsEqual(prev.deps, deps)) {
    const value = factory();
    inst.hooks[idx] = { value, deps };
    return value;
  }
  return prev.value;
}

function useCallback                                   (cb   , deps        )    {
  return useMemo(() => cb, deps);
}

function useEffect(effect                           , deps        )       {
  if (!currentInstance) throw new Error('useEffect called outside component');
  const inst = currentInstance;
  const idx = inst.hookIndex++;
  const prev = inst.hooks[idx];

  if (!prev || !deps || !areDepsEqual(prev.deps, deps)) {
    inst.pendingEffects.push(() => {
      if (prev && typeof prev.cleanup === 'function') {
        prev.cleanup();
      }
      const cleanup = effect();
      inst.hooks[idx] = { deps, cleanup };
    });
  }
}

function areDepsEqual(a                   , b                   )          {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

const SVG_TAGS = new Set([
  'svg',
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'g',
  'defs',
  'linearGradient',
  'stop',
  'text',
  'tspan',
]);

const SVG_ATTR_MAP                         = {
  className: 'class',
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset',
  fillOpacity: 'fill-opacity',
  strokeOpacity: 'stroke-opacity',
  textAnchor: 'text-anchor',
  dominantBaseline: 'dominant-baseline',
};

// Expand functional components and fragments into concrete DOM-ready VNodes
const componentInstances = new Map                           ();
let usedPathsInPass = new Set        ();
let pendingEffectsQueue                    = [];

function expandVNode(node     , path        )        {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return [];
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return [{ type: '#text', text: String(node), key: null, path }];
  }
  if (Array.isArray(node)) {
    const res        = [];
    node.forEach((child, i) => {
      const k = child && typeof child === 'object' && child.key != null ? `k:${child.key}` : `i:${i}`;
      res.push(...expandVNode(child, `${path}/${k}`));
    });
    return res;
  }
  if (node.type === Fragment) {
    return expandVNode(node.children, `${path}/F`);
  }
  if (typeof node.type === 'function') {
    const compName = node.type.name || 'Anon';
    const instKey = `${path}/${compName}${node.key != null ? `:${node.key}` : ''}`;
    usedPathsInPass.add(instKey);

    let inst = componentInstances.get(instKey);
    if (!inst) {
      inst = { hooks: [], hookIndex: 0, pendingEffects: [] };
      componentInstances.set(instKey, inst);
    }
    inst.hookIndex = 0;
    inst.pendingEffects = [];

    const prevInst = currentInstance;
    currentInstance = inst;
    let rendered     ;
    try {
      rendered = node.type(node.props);
    } finally {
      currentInstance = prevInst;
    }

    if (inst.pendingEffects.length > 0) {
      pendingEffectsQueue.push(...inst.pendingEffects);
    }

    return expandVNode(rendered, instKey);
  }

  // Native DOM element
  const expandedChildren        = [];
  node.children.forEach((child     , i        ) => {
    const k = child && typeof child === 'object' && child.key != null ? `k:${child.key}` : `i:${i}`;
    expandedChildren.push(...expandVNode(child, `${path}/${node.type}/${k}`));
  });

  return [
    {
      type: node.type,
      props: node.props,
      children: expandedChildren,
      key: node.key,
      path,
    },
  ];
}

function applyProps(
  dom                          ,
  nextProps                     ,
  prevProps                     ,
  isSvg         
) {
  const prevListeners                      = (dom       ).__listeners || {};
  (dom       ).__listeners = prevListeners;

  // Remove old props
  for (const k of Object.keys(prevProps)) {
    if (k === 'children' || k === 'ref') continue;
    if (!(k in nextProps)) {
      if (k.startsWith('on') && k.length > 2) {
        const evt = k.slice(2).toLowerCase();
        if (prevListeners[evt]) {
          dom.removeEventListener(evt, prevListeners[evt]);
          delete prevListeners[evt];
        }
      } else if (k === 'className') {
        dom.removeAttribute('class');
      } else if (k === 'style') {
        dom.removeAttribute('style');
      } else {
        dom.removeAttribute(isSvg ? SVG_ATTR_MAP[k] || k : k);
      }
    }
  }

  // Set new/updated props
  for (const [k, val] of Object.entries(nextProps)) {
    if (k === 'children') continue;
    if (k === 'ref') {
      if (val && typeof val === 'object') {
        val.current = dom;
      } else if (typeof val === 'function') {
        val(dom);
      }
      continue;
    }

    if (k.startsWith('on') && k.length > 2 && typeof val === 'function') {
      // Map React's onChange on <input>/<select>/<textarea> to both 'input' and 'change' for instant live updates
      const rawName = k.slice(2).toLowerCase();
      const evtName =
        rawName === 'change' &&
        (dom.tagName === 'INPUT' || dom.tagName === 'TEXTAREA') &&
        (dom                    ).type !== 'checkbox' &&
        (dom                    ).type !== 'file'
          ? 'input'
          : rawName === 'doubleclick'
            ? 'dblclick'
            : rawName;

      if (prevListeners[evtName] !== val) {
        if (prevListeners[evtName]) {
          dom.removeEventListener(evtName, prevListeners[evtName]);
        }
        prevListeners[evtName] = val;
        dom.addEventListener(evtName, val);
      }
      continue;
    }

    if (k === 'style' && val && typeof val === 'object') {
      const styleObj = (dom               ).style;
      const prevStyle = prevProps.style || {};
      for (const sk of Object.keys(prevStyle)) {
        if (!(sk in val)) (styleObj       )[sk] = '';
      }
      for (const [sk, sv] of Object.entries(val)) {
        (styleObj       )[sk] = sv ?? '';
      }
      continue;
    }

    if (k === 'className') {
      const cls = val || '';
      if (dom.getAttribute('class') !== cls) {
        dom.setAttribute('class', cls);
      }
      continue;
    }

    if (!isSvg && (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected')) {
      if (k === 'value') {
        const strVal = val == null ? '' : String(val);
        if ((dom                    ).value !== strVal) {
          (dom                    ).value = strVal;
        }
      } else if (k === 'checked') {
        (dom                    ).checked = Boolean(val);
      } else if (k === 'disabled') {
        (dom                    ).disabled = Boolean(val);
      } else if (k === 'selected') {
        (dom                     ).selected = Boolean(val);
      }
      continue;
    }

    if (val === false || val === null || val === undefined) {
      dom.removeAttribute(isSvg ? SVG_ATTR_MAP[k] || k : k);
    } else {
      const attrName = isSvg ? SVG_ATTR_MAP[k] || k : k;
      const strVal = val === true ? '' : String(val);
      if (dom.getAttribute(attrName) !== strVal) {
        dom.setAttribute(attrName, strVal);
      }
    }
  }
}

function reconcileChildren(
  parentDom      ,
  nextVNodes       ,
  isSvgContext         
) {
  const existingNodes = Array.from(parentDom.childNodes);

  for (let i = 0; i < nextVNodes.length; i++) {
    const vnode = nextVNodes[i];
    const existing = existingNodes[i];

    if (vnode.type === '#text') {
      if (existing && existing.nodeType === Node.TEXT_NODE) {
        if (existing.nodeValue !== vnode.text) {
          existing.nodeValue = vnode.text;
        }
      } else {
        const textNode = document.createTextNode(vnode.text);
        if (existing) {
          parentDom.replaceChild(textNode, existing);
        } else {
          parentDom.appendChild(textNode);
        }
      }
      continue;
    }

    const isSvg = isSvgContext || SVG_TAGS.has(vnode.type);
    const tagMatch =
      existing &&
      existing.nodeType === Node.ELEMENT_NODE &&
      (existing           ).tagName.toLowerCase() === vnode.type.toLowerCase();

    let domEl                          ;
    if (tagMatch) {
      domEl = existing                            ;
      const prevProps = (domEl       ).__vprops || {};
      applyProps(domEl, vnode.props, prevProps, isSvg);
      (domEl       ).__vprops = vnode.props;
    } else {
      domEl = isSvg
        ? document.createElementNS('http://www.w3.org/2000/svg', vnode.type)
        : document.createElement(vnode.type);
      applyProps(domEl, vnode.props, {}, isSvg);
      (domEl       ).__vprops = vnode.props;
      if (existing) {
        parentDom.replaceChild(domEl, existing);
      } else {
        parentDom.appendChild(domEl);
      }
    }

    reconcileChildren(domEl, vnode.children, isSvg);

    // Ensure <select> reflects its controlled value after <option> children are reconciled
    if (!isSvg && vnode.type === 'select' && vnode.props.value !== undefined) {
      const selStr = String(vnode.props.value);
      if ((domEl                     ).value !== selStr) {
        (domEl                     ).value = selStr;
      }
    }
  }

  // Remove any extra trailing DOM nodes
  while (parentDom.childNodes.length > nextVNodes.length) {
    const last = parentDom.lastChild;
    if (last) parentDom.removeChild(last);
  }
}

function createRoot(container             ) {
  let rootVNode      = null;

  const performRender = () => {
    if (!rootVNode) return;
    usedPathsInPass = new Set        ();
    pendingEffectsQueue = [];

    const expanded = expandVNode(rootVNode, 'root');
    reconcileChildren(container, expanded, false);

    // Cleanup unmounted component instances
    for (const [k, inst] of componentInstances.entries()) {
      if (!usedPathsInPass.has(k)) {
        for (const h of inst.hooks) {
          if (h && typeof h.cleanup === 'function') {
            try {
              h.cleanup();
            } catch {}
          }
        }
        componentInstances.delete(k);
      }
    }

    // Run queued useEffects
    const effects = [...pendingEffectsQueue];
    pendingEffectsQueue = [];
    for (const eff of effects) {
      eff();
    }
  };

  activeRootRender = performRender;

  return {
    render(vnode     ) {
      rootVNode = vnode;
      performRender();
    },
  };
}

const React = {
  createElement,
  Fragment,
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
};

__exports.default = React;



  __exports.Fragment = Fragment;
  __exports.React = React;
  __exports.createElement = createElement;
  __exports.flushSyncRender = flushSyncRender;
  __exports.useState = useState;
  __exports.useRef = useRef;
  __exports.useMemo = useMemo;
  __exports.useCallback = useCallback;
  __exports.useEffect = useEffect;
  __exports.createRoot = createRoot;
  return __exports;
})();

// === Module: src/solver/assemble.ts (__mod_1) ===
__modules.__mod_1 = (function() {
  const __exports = {};
               
                  
                 
                  
                        
                           

                                         
             
                  
                                   
                                        
 

                                        
             
                                         
                                         
                                         
                                         
 

                                       
                          
                     
                     
            
              
              
                  
                      
                                                                    
                                
                                                                                                   
                                                                        
                                                                                     
                              
                                                                                   
                                                                      
                                                             
                
                                                
                                       
                                                  
                                     
 

                                  
                   
                  
                                     
                                                                                       
                
                                                                                               
                      
                                                                                        
              
                                                                                            
                       
                                                          
                            
                                                       
                                       
 

/**
 * Convert a force/intensity value from its specified coordinate direction into local (axial +x, transverse +y).
 * Given element direction cosines (c = cos(phi), s = sin(phi)):
 * - Global +X projects to: local_x = +c, local_y = -s
 * - Global +Y projects to: local_x = +s, local_y = +c
 * - Local perpendicular projects to: local_x = 0, local_y = +1
 */
function projectLoadToLocal(
  val        ,
  direction                                        ,
  cos        ,
  sin        
)                                        {
  if (direction === 'global_x') {
    return {
      axial: val * cos,
      transverse: -val * sin,
    };
  }
  if (direction === 'global_y') {
    return {
      axial: val * sin,
      transverse: val * cos,
    };
  }
  // 'local_perp'
  return {
    axial: 0,
    transverse: val,
  };
}

/**
 * Build the uncondensed 6x6 2D Euler-Bernoulli frame local stiffness matrix in base SI.
 * Local DOFs: [ux1, uy1, rz1, ux2, uy2, rz2]
 */
function buildUncondensedLocalStiffness(EA        , EI        , L        )             {
  const kA = EA / L;
  const L2 = L * L;
  const L3 = L2 * L;
  const k12 = (12 * EI) / L3;
  const k6 = (6 * EI) / L2;
  const k4 = (4 * EI) / L;
  const k2 = (2 * EI) / L;

  return [
    [kA, 0, 0, -kA, 0, 0],
    [0, k12, k6, 0, -k12, k6],
    [0, k6, k4, 0, -k6, k2],
    [-kA, 0, 0, kA, 0, 0],
    [0, -k12, -k6, 0, k12, -k6],
    [0, k6, k2, 0, -k6, k4],
  ];
}

/**
 * Perform static condensation of the 6x6 local stiffness matrix and 6x1 equivalent nodal load vector
 * for start hinge (DOF 2: rz1), end hinge (DOF 5: rz2), or both hinges (truss / pin-ended beam).
 */
function condenseElementReleases(
  kUncond            ,
  fEqUncond                                                  ,
  releaseStart         ,
  releaseEnd         
)   
                    
                                                            
  {
  // Deep copy
  const k = kUncond.map((row) => [...row]);
  const f = [...fEqUncond]                                                    ;

  if (!releaseStart && !releaseEnd) {
    return { kCond: k, fEqCond: f };
  }

  // Condense single DOF helper: k_ij' = k_ij - (k_ic * k_cj) / k_cc, f_i' = f_i - (k_ic / k_cc) * f_c
  const condenseSingleDof = (dofC        ) => {
    const kcc = k[dofC][dofC];
    if (Math.abs(kcc) < 1e-14) return;
    const fc = f[dofC];

    const kNext = k.map((r) => [...r]);
    const fNext = [...f]                                                    ;

    for (let i = 0; i < 6; i++) {
      if (i === dofC) {
        fNext[i] = 0;
        for (let j = 0; j < 6; j++) kNext[i][j] = 0;
        continue;
      }
      const factor = k[i][dofC] / kcc;
      fNext[i] = f[i] - factor * fc;
      for (let j = 0; j < 6; j++) {
        if (j === dofC) {
          kNext[i][j] = 0;
        } else {
          kNext[i][j] = k[i][j] - factor * k[dofC][j];
        }
      }
    }

    for (let i = 0; i < 6; i++) {
      f[i] = fNext[i];
      for (let j = 0; j < 6; j++) {
        k[i][j] = kNext[i][j];
      }
    }
  };

  if (releaseStart && !releaseEnd) {
    condenseSingleDof(2);
  } else if (!releaseStart && releaseEnd) {
    condenseSingleDof(5);
  } else {
    // Both start (2) and end (5) released sequentially (Gaussian elimination on DOFs 2 and 5 is exact)
    condenseSingleDof(2);
    condenseSingleDof(5);
  }

  return { kCond: k, fEqCond: f };
}

/**
 * Recover internal member end rotations (rz1, rz2) after solving global nodal displacements,
 * accounting for start/end moment releases and fixed-end moments.
 */
function recoverMemberLocalDisplacements(
  uNodeLocal                                                  ,
  elData                      
)                                                   {
  const { element, kLocalUncondensed: k, fEqLocalUncondensed: f } = elData;
  const u = [...uNodeLocal]                                                    ;

  const rStart = element.releaseStart;
  const rEnd = element.releaseEnd;

  if (!rStart && !rEnd) {
    return u;
  }

  if (rStart && !rEnd) {
    // k[2][0]*u0 + k[2][1]*u1 + k[2][2]*rz1 + k[2][3]*u3 + k[2][4]*u4 + k[2][5]*u5 - f[2] = 0
    const k22 = k[2][2];
    if (Math.abs(k22) > 1e-14) {
      let rhs = f[2];
      for (const j of [0, 1, 3, 4, 5]) {
        rhs -= k[2][j] * u[j];
      }
      u[2] = rhs / k22;
    }
    return u;
  }

  if (!rStart && rEnd) {
    const k55 = k[5][5];
    if (Math.abs(k55) > 1e-14) {
      let rhs = f[5];
      for (const j of [0, 1, 2, 3, 4]) {
        rhs -= k[5][j] * u[j];
      }
      u[5] = rhs / k55;
    }
    return u;
  }

  // Both ends released: solve 2x2 system for [rz1, rz2]
  // [k22 k25] [rz1] = [f2 - sum_{j in 0,1,3,4} k_{2j} u_j]
  // [k52 k55] [rz2]   [f5 - sum_{j in 0,1,3,4} k_{5j} u_j]
  let rhs2 = f[2];
  let rhs5 = f[5];
  for (const j of [0, 1, 3, 4]) {
    rhs2 -= k[2][j] * u[j];
    rhs5 -= k[5][j] * u[j];
  }
  const det = k[2][2] * k[5][5] - k[2][5] * k[5][2];
  if (Math.abs(det) > 1e-18) {
    u[2] = (rhs2 * k[5][5] - rhs5 * k[2][5]) / det;
    u[5] = (k[2][2] * rhs5 - k[5][2] * rhs2) / det;
  }
  return u;
}

/**
 * Build 6x6 coordinate transformation matrix T (u_local = T * u_global)
 */
function buildTransformationMatrix(c        , s        )             {
  return [
    [c, s, 0, 0, 0, 0],
    [-s, c, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0],
    [0, 0, 0, c, s, 0],
    [0, 0, 0, -s, c, 0],
    [0, 0, 0, 0, 0, 1],
  ];
}

/**
 * Multiply T^T * kLocal * T (6x6)
 */
function transformStiffnessToGlobal(kLocal            , T            )             {
  const temp             = Array.from({ length: 6 }, () => Array(6).fill(0));
  const kGlobal             = Array.from({ length: 6 }, () => Array(6).fill(0));

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let sum = 0;
      for (let m = 0; m < 6; m++) {
        sum += kLocal[i][m] * T[m][j];
      }
      temp[i][j] = sum;
    }
  }

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let sum = 0;
      for (let m = 0; m < 6; m++) {
        sum += T[m][i] * temp[m][j];
      }
      kGlobal[i][j] = sum;
    }
  }

  return kGlobal;
}

/**
 * Multiply T^T * fLocal (6x1)
 */
function transformForcesToGlobal(
  fLocal                                                  ,
  T            
)                                                   {
  const out                                                   = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 6; i++) {
    let sum = 0;
    for (let m = 0; m < 6; m++) {
      sum += T[m][i] * fLocal[m];
    }
    out[i] = sum;
  }
  return out;
}

/**
 * Assemble the complete global 2D Plane Frame system in base SI units (m, N, Pa).
 */
function assembleSystem(model                 )                  {
  const numNodes = model.nodes.length;
  const numDofs = numNodes * 3;
  const nodeIdToIndex = new Map                ();

  model.nodes.forEach((node, idx) => {
    nodeIdToIndex.set(node.id, idx);
  });

  const K             = Array.from({ length: numDofs }, () => Array(numDofs).fill(0));
  const KStruct             = Array.from({ length: numDofs }, () => Array(numDofs).fill(0));
  const F           = Array(numDofs).fill(0);
  const FNodalOnly           = Array(numDofs).fill(0);
  const FMemberEqGlobal           = Array(numDofs).fill(0);

  // Group member loads by elementId
  const pointLoadsByEl = new Map                           ();
  const distLoadsByEl = new Map                                 ();

  for (const load of model.loads) {
    if (load.kind === 'nodal') {
      const nIdx = nodeIdToIndex.get(load.nodeId);
      if (nIdx !== undefined) {
        // Convert kN -> N, kNm -> N*m
        const fxN = load.fx * 1e3;
        const fyN = load.fy * 1e3;
        const mzNm = load.mz * 1e3;
        F[nIdx * 3 + 0] += fxN;
        F[nIdx * 3 + 1] += fyN;
        F[nIdx * 3 + 2] += mzNm;
        FNodalOnly[nIdx * 3 + 0] += fxN;
        FNodalOnly[nIdx * 3 + 1] += fyN;
        FNodalOnly[nIdx * 3 + 2] += mzNm;
      }
    } else if (load.kind === 'member_point') {
      const list = pointLoadsByEl.get(load.elementId) ?? [];
      list.push(load);
      pointLoadsByEl.set(load.elementId, list);
    } else if (load.kind === 'member_distributed') {
      const list = distLoadsByEl.get(load.elementId) ?? [];
      list.push(load);
      distLoadsByEl.set(load.elementId, list);
    }
  }

  const elementsData                         = [];

  for (const el of model.elements) {
    if (el.kind !== 'frame2d') continue;
    const idxI = nodeIdToIndex.get(el.nodeI);
    const idxJ = nodeIdToIndex.get(el.nodeJ);
    if (idxI === undefined || idxJ === undefined) continue;

    const nodeI = model.nodes[idxI];
    const nodeJ = model.nodes[idxJ];
    const dx = nodeJ.x - nodeI.x;
    const dy = nodeJ.y - nodeI.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;

    const cos = dx / L;
    const sin = dy / L;

    // Base SI conversions:
    // E: GPa -> Pa (* 1e9)
    // A: mm^2 -> m^2 (* 1e-6) => E * A in N = E_GPa * A_mm2 * 1e3
    // I: mm^4 -> m^4 (* 1e-12) => E * I in N*m^2 = E_GPa * I_mm4 * 1e-3
    const E_Pa = el.material.E * 1e9;
    const A_m2 = el.section.A * 1e-6;
    const I_m4 = el.section.I * 1e-12;
    const EA = E_Pa * A_m2;
    const EI = E_Pa * I_m4;

    const kLocalUncondensed = buildUncondensedLocalStiffness(EA, EI, L);
    const fEqLocalUncondensed                                                   = [0, 0, 0, 0, 0, 0];

    const resolvedPointLoads                           = [];
    const resolvedDistLoads                          = [];

    // 1. Member Distributed Loads (Uniform & Trapezoidal)
    const elDistLoads = distLoadsByEl.get(el.id) ?? [];
    for (const dl of elDistLoads) {
      // Convert kN/m -> N/m (* 1e3)
      const w1_Nm = dl.w1 * 1e3;
      const w2_Nm = dl.w2 * 1e3;
      const p1 = projectLoadToLocal(w1_Nm, dl.direction, cos, sin);
      const p2 = projectLoadToLocal(w2_Nm, dl.direction, cos, sin);

      const qx1 = p1.axial;
      const qx2 = p2.axial;
      const wy1 = p1.transverse;
      const wy2 = p2.transverse;

      resolvedDistLoads.push({
        id: dl.id,
        qx1,
        qx2,
        wy1,
        wy2,
      });

      // Exact Fixed-End Forces for trapezoidal axial & transverse load:
      const NF1 = (L / 6) * (2 * qx1 + qx2);
      const NF2 = (L / 6) * (qx1 + 2 * qx2);
      const VF1 = (L / 20) * (7 * wy1 + 3 * wy2);
      const VF2 = (L / 20) * (3 * wy1 + 7 * wy2);
      const MF1 = ((L * L) / 60) * (3 * wy1 + 2 * wy2);
      const MF2 = -((L * L) / 60) * (2 * wy1 + 3 * wy2);

      fEqLocalUncondensed[0] += NF1;
      fEqLocalUncondensed[1] += VF1;
      fEqLocalUncondensed[2] += MF1;
      fEqLocalUncondensed[3] += NF2;
      fEqLocalUncondensed[4] += VF2;
      fEqLocalUncondensed[5] += MF2;
    }

    // 2. Member Point Loads
    const elPointLoads = pointLoadsByEl.get(el.id) ?? [];
    for (const pl of elPointLoads) {
      const a = Math.min(L, Math.max(0, pl.a));
      const b = L - a;
      // Convert kN -> N (* 1e3)
      const P_N = pl.p * 1e3;
      const proj = projectLoadToLocal(P_N, pl.direction, cos, sin);
      const px = proj.axial;
      const py = proj.transverse;

      resolvedPointLoads.push({
        id: pl.id,
        a,
        px,
        py,
      });

      const L2 = L * L;
      const L3 = L2 * L;
      const NF1 = (px * b) / L;
      const NF2 = (px * a) / L;
      const VF1 = (py * b * b * (3 * a + b)) / L3;
      const VF2 = (py * a * a * (a + 3 * b)) / L3;
      const MF1 = (py * a * b * b) / L2;
      const MF2 = -(py * a * a * b) / L2;

      fEqLocalUncondensed[0] += NF1;
      fEqLocalUncondensed[1] += VF1;
      fEqLocalUncondensed[2] += MF1;
      fEqLocalUncondensed[3] += NF2;
      fEqLocalUncondensed[4] += VF2;
      fEqLocalUncondensed[5] += MF2;
    }

    // 3. Static condensation for member end moment releases (hinges)
    const { kCond: kLocalCondensed, fEqCond: fEqLocalCondensed } = condenseElementReleases(
      kLocalUncondensed,
      fEqLocalUncondensed,
      el.releaseStart,
      el.releaseEnd
    );

    // 4. Transform to Global Coordinates
    const T = buildTransformationMatrix(cos, sin);
    const kGlobal = transformStiffnessToGlobal(kLocalCondensed, T);
    const fEqGlobal = transformForcesToGlobal(fEqLocalCondensed, T);

    const dofMap = [
      idxI * 3 + 0,
      idxI * 3 + 1,
      idxI * 3 + 2,
      idxJ * 3 + 0,
      idxJ * 3 + 1,
      idxJ * 3 + 2,
    ];

    for (let r = 0; r < 6; r++) {
      const gr = dofMap[r];
      F[gr] += fEqGlobal[r];
      FMemberEqGlobal[gr] += fEqGlobal[r];
      for (let c = 0; c < 6; c++) {
        const gc = dofMap[c];
        K[gr][gc] += kGlobal[r][c];
        KStruct[gr][gc] += kGlobal[r][c];
      }
    }

    elementsData.push({
      element: el,
      nodeIndexI: idxI,
      nodeIndexJ: idxJ,
      L,
      cos,
      sin,
      EA,
      EI,
      kLocalUncondensed,
      fEqLocalUncondensed,
      kLocalCondensed,
      fEqLocalCondensed,
      T,
      pointLoads: resolvedPointLoads,
      distLoads: resolvedDistLoads,
    });
  }

  // 5. Add Nodal Elastic Springs directly to the global stiffness matrix diagonal
  // kx, ky: kN/m -> N/m (* 1e3); krz: kNm/rad -> N*m/rad (* 1e3)
  model.nodes.forEach((node, idx) => {
    const kx_SI = Math.max(0, node.springs.kx) * 1e3;
    const ky_SI = Math.max(0, node.springs.ky) * 1e3;
    const krz_SI = Math.max(0, node.springs.krz) * 1e3;

    K[idx * 3 + 0][idx * 3 + 0] += kx_SI;
    K[idx * 3 + 1][idx * 3 + 1] += ky_SI;
    K[idx * 3 + 2][idx * 3 + 2] += krz_SI;
  });

  return {
    numNodes,
    numDofs,
    nodeIdToIndex,
    K,
    KStruct,
    F,
    FNodalOnly,
    FMemberEqGlobal,
    elementsData,
  };
}



  __exports.projectLoadToLocal = projectLoadToLocal;
  __exports.buildUncondensedLocalStiffness = buildUncondensedLocalStiffness;
  __exports.condenseElementReleases = condenseElementReleases;
  __exports.recoverMemberLocalDisplacements = recoverMemberLocalDisplacements;
  __exports.buildTransformationMatrix = buildTransformationMatrix;
  __exports.assembleSystem = assembleSystem;
  return __exports;
})();

// === Module: src/solver/solve.ts (__mod_2) ===
__modules.__mod_2 = (function() {
  const __exports = {};
                                                           
                                                     

                                 
                  
                        
                             
                                                                                             
              
                                                                                                    
              
 

/**
 * Solve [K]{U} = {F} using Gaussian elimination with partial pivoting and pivot-tolerance checking.
 * Handles:
 * - Standard presets (Fixed, Pinned, RollerX, RollerY)
 * - Custom Inclined Roller at angle alphaDeg via local orthogonal transformation
 * - Elastic translational & rotational springs (kx, ky, krz)
 * - Pin-connected truss nodes where all incident members have moment hinges
 * - Graceful detection of mechanisms and singular stiffness matrices without NaN crashes
 */
function solveAssembledSystem(
  model                 ,
  sys                 
)                 {
  const { numNodes, numDofs, K, KStruct, F, FNodalOnly, FMemberEqGlobal, elementsData } = sys;
  const zeroU = Array(numDofs).fill(0);
  const zeroR = Array(numDofs).fill(0);

  if (numNodes === 0 || elementsData.length === 0) {
    return {
      stable: false,
      statusMessage: 'Unstable Structure',
      instabilityReason: 'Model contains no active structural frame elements.',
      U: zeroU,
      R: zeroR,
    };
  }

  // Deep copy K and F so we can apply inclined roller nodal basis rotations cleanly
  const KWork             = K.map((row) => [...row]);
  const FWork           = [...F];

  // Track which nodes are connected to at least one element
  const connectedNodes = new Set        ();
  for (const ed of elementsData) {
    connectedNodes.add(ed.nodeIndexI);
    connectedNodes.add(ed.nodeIndexJ);
  }

  // 1. Apply local boundary transformation for 'inclinedRoller' supports
  // For an inclined roller at angle alpha (deg):
  // Tangent unit vector (free): t = (cos a, sin a)
  // Normal unit vector (restrained): n = (-sin a, cos a)
  // [Ux] = [cos a  -sin a] [ut]
  // [Uy]   [sin a   cos a] [un]
  const nodeBasisCos = Array(numNodes).fill(1);
  const nodeBasisSin = Array(numNodes).fill(0);

  for (let i = 0; i < numNodes; i++) {
    const node = model.nodes[i];
    if (node.support === 'inclinedRoller') {
      const alphaRad = ((node.inclinedAngleDeg ?? 0) * Math.PI) / 180;
      const c = Math.cos(alphaRad);
      const s = Math.sin(alphaRad);
      nodeBasisCos[i] = c;
      nodeBasisSin[i] = s;

      const ix = i * 3 + 0;
      const iy = i * 3 + 1;

      // Rotate rows ix, iy: K_rot = R^T * K
      for (let col = 0; col < numDofs; col++) {
        const kxj = KWork[ix][col];
        const kyj = KWork[iy][col];
        KWork[ix][col] = c * kxj + s * kyj;
        KWork[iy][col] = -s * kxj + c * kyj;
      }

      // Rotate columns ix, iy: K_rot = K_rot * R
      for (let row = 0; row < numDofs; row++) {
        const kix = KWork[row][ix];
        const kiy = KWork[row][iy];
        KWork[row][ix] = c * kix + s * kiy;
        KWork[row][iy] = -s * kix + c * kiy;
      }

      // Rotate force vector F_rot = R^T * F
      const fx = FWork[ix];
      const fy = FWork[iy];
      FWork[ix] = c * fx + s * fy;
      FWork[iy] = -s * fx + c * fy;
    }
  }

  // 2. Determine restrained DOFs and free DOFs
  const isRestrained = Array         (numDofs).fill(false);

  for (let i = 0; i < numNodes; i++) {
    const node = model.nodes[i];
    if (!connectedNodes.has(i)) {
      // Disconnected orphan node: restrain to avoid trivial singularity
      isRestrained[i * 3 + 0] = true;
      isRestrained[i * 3 + 1] = true;
      isRestrained[i * 3 + 2] = true;
      continue;
    }

    if (node.support === 'fixed') {
      isRestrained[i * 3 + 0] = true;
      isRestrained[i * 3 + 1] = true;
      isRestrained[i * 3 + 2] = true;
    } else if (node.support === 'pinned') {
      isRestrained[i * 3 + 0] = true;
      isRestrained[i * 3 + 1] = true;
    } else if (node.support === 'rollerX') {
      isRestrained[i * 3 + 1] = true; // uy fixed
    } else if (node.support === 'rollerY') {
      isRestrained[i * 3 + 0] = true; // ux fixed
    } else if (node.support === 'inclinedRoller') {
      // In rotated basis [ut, un], index (i*3 + 1) is normal displacement un, which is fixed!
      isRestrained[i * 3 + 1] = true;
    } else {
      // Custom manual restraints if set
      if (node.restraints.ux) isRestrained[i * 3 + 0] = true;
      if (node.restraints.uy) isRestrained[i * 3 + 1] = true;
      if (node.restraints.rz) isRestrained[i * 3 + 2] = true;
    }

    // Check if rotational DOF (i*3 + 2) is a pure truss pin joint (zero rotational stiffness from all members & springs)
    const rzDof = i * 3 + 2;
    if (!isRestrained[rzDof]) {
      let rowNorm = 0;
      for (let j = 0; j < numDofs; j++) {
        rowNorm += Math.abs(KWork[rzDof][j]);
      }
      if (rowNorm < 1e-10) {
        // Pure pin joint with no rotational stiffness:
        // If a concentrated nodal moment is applied here, the joint spins freely (unstable).
        if (Math.abs(FWork[rzDof]) > 1e-6) {
          return {
            stable: false,
            statusMessage: 'Unstable Structure',
            instabilityReason: `Node ${node.label ?? node.id} is a frictionless pin joint and cannot resist an applied concentrated moment.`,
            U: zeroU,
            R: zeroR,
          };
        }
        // Otherwise lock dummy truss joint rotation to 0 (member end rotations are recovered locally)
        isRestrained[rzDof] = true;
      }
    }
  }

  const freeDofs           = [];
  for (let d = 0; d < numDofs; d++) {
    if (!isRestrained[d]) {
      freeDofs.push(d);
    }
  }

  // Extract reduced system [K_ff]{U_f} = {F_f}
  const nFree = freeDofs.length;
  const UWork = Array        (numDofs).fill(0);

  if (nFree > 0) {
    const A             = Array.from({ length: nFree }, (_, r) => {
      const gr = freeDofs[r];
      return freeDofs.map((gc) => KWork[gr][gc]);
    });
    const b           = freeDofs.map((gr) => FWork[gr]);

    // Compute scale norm of diagonal entries for relative pivot tolerance checking
    let maxDiag = 0;
    for (let i = 0; i < nFree; i++) {
      const d = Math.abs(A[i][i]);
      if (d > maxDiag) maxDiag = d;
    }

    if (maxDiag < 1e-12) {
      return {
        stable: false,
        statusMessage: 'Unstable Structure',
        instabilityReason: 'Global stiffness matrix has zero stiffness on active DOFs.',
        U: zeroU,
        R: zeroR,
      };
    }

    // Track initial diagonal scale per row for dimensionless conditioning check
    const rowScale = A.map((row, i) => {
      let m = Math.abs(row[i]);
      for (let j = 0; j < nFree; j++) {
        if (Math.abs(row[j]) > m) m = Math.abs(row[j]);
      }
      return m;
    });

    const relTol = 1e-10;

    // Gaussian elimination with scaled partial pivoting
    for (let k = 0; k < nFree; k++) {
      let pivotRow = k;
      let bestScaledPivot = 0;

      for (let i = k; i < nFree; i++) {
        const scale = rowScale[i] > 1e-16 ? rowScale[i] : 1;
        const scaled = Math.abs(A[i][k]) / scale;
        if (scaled > bestScaledPivot) {
          bestScaledPivot = scaled;
          pivotRow = i;
        }
      }

      const absPivot = Math.abs(A[pivotRow][k]);
      if (absPivot < 1e-9 || bestScaledPivot < relTol) {
        return {
          stable: false,
          statusMessage: 'Unstable Structure',
          instabilityReason:
            'Singular stiffness matrix (mechanism or insufficient boundary restraints detected).',
          U: zeroU,
          R: zeroR,
        };
      }

      if (pivotRow !== k) {
        const tmpRow = A[k];
        A[k] = A[pivotRow];
        A[pivotRow] = tmpRow;

        const tmpB = b[k];
        b[k] = b[pivotRow];
        b[pivotRow] = tmpB;

        const tmpS = rowScale[k];
        rowScale[k] = rowScale[pivotRow];
        rowScale[pivotRow] = tmpS;
      }

      const pivotVal = A[k][k];
      for (let i = k + 1; i < nFree; i++) {
        const factor = A[i][k] / pivotVal;
        if (Math.abs(factor) < 1e-18) continue;
        b[i] -= factor * b[k];
        for (let j = k + 1; j < nFree; j++) {
          A[i][j] -= factor * A[k][j];
        }
        A[i][k] = 0;
      }
    }

    // Back-substitution
    const xFree = Array        (nFree).fill(0);
    for (let i = nFree - 1; i >= 0; i--) {
      let sum = b[i];
      for (let j = i + 1; j < nFree; j++) {
        sum -= A[i][j] * xFree[j];
      }
      const val = sum / A[i][i];
      if (!Number.isFinite(val) || Math.abs(val) > 1e4) {
        return {
          stable: false,
          statusMessage: 'Unstable Structure',
          instabilityReason:
            'Excessive rigid-body mechanism displacement detected due to insufficient restraints.',
          U: zeroU,
          R: zeroR,
        };
      }
      xFree[i] = val;
    }

    for (let i = 0; i < nFree; i++) {
      UWork[freeDofs[i]] = xFree[i];
    }
  }

  // 3. Transform nodal displacements back from inclined roller basis to global Cartesian (X, Y)
  const UGlobal = [...UWork];
  for (let i = 0; i < numNodes; i++) {
    const node = model.nodes[i];
    if (node.support === 'inclinedRoller') {
      const c = nodeBasisCos[i];
      const s = nodeBasisSin[i];
      const ut = UWork[i * 3 + 0];
      const un = UWork[i * 3 + 1]; // 0
      UGlobal[i * 3 + 0] = c * ut - s * un;
      UGlobal[i * 3 + 1] = s * ut + c * un;
    }
  }

  // 4. Compute total global support & spring reactions:
  // Equilibrium of the structure at every node requires:
  // [KStruct]{UGlobal} = {FNodalOnly} + {FMemberEqGlobal} + {R_support_and_springs}
  // Therefore, the total external reaction force (from rigid supports + elastic springs) is:
  // {R} = [KStruct]{UGlobal} - {FNodalOnly} - {FMemberEqGlobal}
  const RGlobal = Array        (numDofs).fill(0);
  for (let i = 0; i < numDofs; i++) {
    let kDotU = 0;
    for (let j = 0; j < numDofs; j++) {
      kDotU += KStruct[i][j] * UGlobal[j];
    }
    RGlobal[i] = kDotU - FNodalOnly[i] - FMemberEqGlobal[i];
  }

  return {
    stable: true,
    statusMessage: 'Structure Stable — Converged',
    U: UGlobal,
    R: RGlobal,
  };
}



  __exports.solveAssembledSystem = solveAssembledSystem;
  return __exports;
})();

// === Module: src/solver/postprocess.ts (__mod_3) ===
__modules.__mod_3 = (function() {
  const __exports = {};
               
                  
                
               
                      
                        
                     
                         
                         
                           
const {
                       
                            
  recoverMemberLocalDisplacements,
} = __modules.__mod_1;
                                                 

/**
 * Evaluate exact internal forces N(x), V(x), M(x), local/global deflections u(x), v(x),
 * and combined stress sigma_max(x) at any position x in [0, L] along an assembled element.
 */
function evaluateElementAtX(
  xRaw        ,
  elData                      ,
  nodeI                          ,
  uMemberLocal                                                  ,
  fEndLocalSI                                                  ,
  includePointLoadRightLimit          = true
)                     {
  const { element, L, cos, sin, EA, EI, pointLoads, distLoads } = elData;
  const x = Math.min(L, Math.max(0, xRaw));
  const xi = L > 1e-9 ? x / L : 0;

  const ux1 = uMemberLocal[0];
  const uy1 = uMemberLocal[1];
  const rz1 = uMemberLocal[2];

  const fx1 = fEndLocalSI[0];
  const fy1 = fEndLocalSI[1];
  const fm1 = fEndLocalSI[2];

  // 1. Exact internal forces in base SI (N, N*m)
  // Axial force N(x) (Tension positive):
  let N_SI = -fx1;
  // Shear force V(x):
  let V_SI = fy1;
  // Bending moment M(x) (Sagging / bottom-fiber tension positive):
  let M_SI = -fm1 + fy1 * x;

  // Axial displacement integral and transverse deflection integral
  let uIntegral = -fx1 * x;
  let vIntegral = -0.5 * fm1 * x * x + (1 / 6) * fy1 * x * x * x;

  const x2 = x * x;
  const x3 = x2 * x;
  const x4 = x3 * x;
  const x5 = x4 * x;

  for (const dl of distLoads) {
    const dqx = dl.qx2 - dl.qx1;
    const dwy = dl.wy2 - dl.wy1;

    // Axial distributed load contribution
    N_SI -= dl.qx1 * x + (dqx / (2 * L)) * x2;
    uIntegral -= 0.5 * dl.qx1 * x2 + (dqx / (6 * L)) * x3;

    // Transverse trapezoidal load contribution:
    // V(x) is quadratic, M(x) is cubic, v(x) is quintic (5th degree)
    V_SI += dl.wy1 * x + (dwy / (2 * L)) * x2;
    M_SI += 0.5 * dl.wy1 * x2 + (dwy / (6 * L)) * x3;
    vIntegral += (1 / 24) * dl.wy1 * x4 + (dwy / (120 * L)) * x5;
  }

  for (const pl of pointLoads) {
    const active = includePointLoadRightLimit ? x >= pl.a - 1e-9 : x > pl.a + 1e-9;
    if (active) {
      const dx = Math.max(0, x - pl.a);
      N_SI -= pl.px;
      uIntegral -= pl.px * dx;

      V_SI += pl.py;
      M_SI += pl.py * dx;
      vIntegral += (1 / 6) * pl.py * dx * dx * dx;
    }
  }

  // Local displacements in meters
  const uLocalM = ux1 + (EA > 1e-12 ? uIntegral / EA : 0);
  const vLocalM = uy1 + rz1 * x + (EI > 1e-12 ? vIntegral / EI : 0);

  // Convert local displacements to mm
  const uLocalMm = uLocalM * 1e3;
  const vLocalMm = vLocalM * 1e3;

  // Transform local displacement (u, v) to global (dx, dy) in mm:
  // dx = u * cos - v * sin
  // dy = u * sin + v * cos
  const dxGlobalMm = uLocalMm * cos - vLocalMm * sin;
  const dyGlobalMm = uLocalMm * sin + vLocalMm * cos;
  const deflectionMm = Math.hypot(uLocalMm, vLocalMm);

  // Convert internal forces to kN and kNm
  const N_kN = N_SI * 1e-3;
  const V_kN = V_SI * 1e-3;
  const M_kNm = M_SI * 1e-3;

  // Stress calculation in MPa:
  // sigma_max(x) = |N(kN)|*1e3 / A(mm^2) + |M(kNm)|*1e6 / S(mm^3)
  const A_mm2 = Math.max(1e-3, element.section.A);
  const S_mm3 = Math.max(1e-3, element.section.S);
  const fy_MPa = Math.max(1e-3, element.material.fy);

  const sigmaAxialMpa = (Math.abs(N_kN) * 1e3) / A_mm2;
  const sigmaBendingMpa = (Math.abs(M_kNm) * 1e6) / S_mm3;
  const sigmaMaxMpa = sigmaAxialMpa + sigmaBendingMpa;
  const utilization = sigmaMaxMpa / fy_MPa;

  return {
    x,
    xi,
    worldX: nodeI.x + x * cos,
    worldY: nodeI.y + x * sin,
    uLocalMm,
    vLocalMm,
    dxGlobalMm,
    dyGlobalMm,
    deflectionMm,
    N: N_kN,
    V: V_kN,
    M: M_kNm,
    sigmaMaxMpa,
    utilization,
  };
}

/**
 * Post-process global nodal displacements & reactions into rich, JSON-serializable
 * SolverResults with per-member envelope extrema (N_max/min, V_max/min, M_max/min with x/L)
 * and governing utilization ratios (sigma_max / fy) for calculation report exports.
 */
function postProcessSolution(
  model                 ,
  sys                 ,
  sol                ,
  numSubdivisions         = 48
)                {
  const nodeResults                                      = {};
  const elementResults                                        = {};

  if (!sol.stable) {
    for (const node of model.nodes) {
      nodeResults[node.id] = {
        nodeId: node.id,
        dxMm: 0,
        dyMm: 0,
        rzMrad: 0,
        reactionFx: 0,
        reactionFy: 0,
        reactionMz: 0,
        hasReaction: node.support !== 'none',
      };
    }
    return {
      stable: false,
      statusMessage: sol.statusMessage,
      instabilityReason: sol.instabilityReason,
      nodeResults,
      elementResults,
      governingMember: {
        elementId: null,
        utilization: 0,
        sigmaMaxMpa: 0,
        fyMpa: 0,
        x: 0,
        xOverL: 0,
      },
      reactionSum: {
        sumRx: 0,
        sumRy: 0,
        sumMzAboutOrigin: 0,
      },
      globalMaxDeflectionMm: 0,
      globalMaxN: 0,
      globalMaxV: 0,
      globalMaxM: 0,
      globalMaxSigmaMpa: 0,
      globalMaxUtilization: 0,
    };
  }

  let globalMaxDeflectionMm = 0;
  let globalMaxN = 0;
  let globalMaxV = 0;
  let globalMaxM = 0;
  let globalMaxSigmaMpa = 0;
  let globalMaxUtilization = 0;

  let sumRx = 0;
  let sumRy = 0;
  let sumMzAboutOrigin = 0;

  const governingMember                         = {
    elementId: null,
    utilization: 0,
    sigmaMaxMpa: 0,
    fyMpa: 0,
    x: 0,
    xOverL: 0,
  };

  // 1. Nodal results & global reaction sums
  model.nodes.forEach((node, idx) => {
    const dxMm = sol.U[idx * 3 + 0] * 1e3;
    const dyMm = sol.U[idx * 3 + 1] * 1e3;
    const rzMrad = sol.U[idx * 3 + 2] * 1e3;

    const reactionFx = sol.R[idx * 3 + 0] * 1e-3;
    const reactionFy = sol.R[idx * 3 + 1] * 1e-3;
    const reactionMz = sol.R[idx * 3 + 2] * 1e-3;

    const hasSupport =
      node.support !== 'none' ||
      node.restraints.ux ||
      node.restraints.uy ||
      node.restraints.rz ||
      node.springs.kx > 0 ||
      node.springs.ky > 0 ||
      node.springs.krz > 0;

    const rx = hasSupport ? reactionFx : 0;
    const ry = hasSupport ? reactionFy : 0;
    const rmz = hasSupport ? reactionMz : 0;

    sumRx += rx;
    sumRy += ry;
    sumMzAboutOrigin += rmz + node.x * ry - node.y * rx;

    nodeResults[node.id] = {
      nodeId: node.id,
      dxMm,
      dyMm,
      rzMrad,
      reactionFx: rx,
      reactionFy: ry,
      reactionMz: rmz,
      hasReaction: hasSupport,
    };

    const nodalDefl = Math.hypot(dxMm, dyMm);
    if (nodalDefl > globalMaxDeflectionMm) {
      globalMaxDeflectionMm = nodalDefl;
    }
  });

  // 2. Element results & envelope extrema
  for (const elData of sys.elementsData) {
    const {
      element,
      nodeIndexI,
      nodeIndexJ,
      L,
      cos,
      sin,
      T,
      kLocalUncondensed,
      fEqLocalUncondensed,
    } = elData;
    const nodeI = model.nodes[nodeIndexI];

    const uGlobal6                                                   = [
      sol.U[nodeIndexI * 3 + 0],
      sol.U[nodeIndexI * 3 + 1],
      sol.U[nodeIndexI * 3 + 2],
      sol.U[nodeIndexJ * 3 + 0],
      sol.U[nodeIndexJ * 3 + 1],
      sol.U[nodeIndexJ * 3 + 2],
    ];

    // uNodeLocal = T * uGlobal6
    const uNodeLocal                                                   = [0, 0, 0, 0, 0, 0];
    for (let r = 0; r < 6; r++) {
      let s = 0;
      for (let c = 0; c < 6; c++) {
        s += T[r][c] * uGlobal6[c];
      }
      uNodeLocal[r] = s;
    }

    // Recover internal member end rotations accounting for moment hinges
    const uMemberLocal = recoverMemberLocalDisplacements(uNodeLocal, elData);

    // Compute local member end forces in base SI: fEndLocalSI = kUncond * uMemberLocal - fEqUncond
    const fEndLocalSI                                                   = [0, 0, 0, 0, 0, 0];
    for (let r = 0; r < 6; r++) {
      let s = -fEqLocalUncondensed[r];
      for (let c = 0; c < 6; c++) {
        s += kLocalUncondensed[r][c] * uMemberLocal[c];
      }
      fEndLocalSI[r] = s;
    }

    if (element.releaseStart) fEndLocalSI[2] = 0;
    if (element.releaseEnd) fEndLocalSI[5] = 0;

    // Build sorted sample positions along [0, L], including left/right limits at point loads
    const samplePositions                                            = [];
    for (let k = 0; k <= numSubdivisions; k++) {
      const xk = (k / numSubdivisions) * L;
      samplePositions.push({ x: xk, rightLimit: k < numSubdivisions });
    }
    for (const pl of elData.pointLoads) {
      if (pl.a > 1e-5 && pl.a < L - 1e-5) {
        samplePositions.push({ x: pl.a, rightLimit: false });
        samplePositions.push({ x: pl.a, rightLimit: true });
      }
    }

    // Also include analytical zero-shear points (M extrema) & zero-load points (V extrema)
    let totalWy1 = 0;
    let totalWy2 = 0;
    for (const dl of elData.distLoads) {
      totalWy1 += dl.wy1;
      totalWy2 += dl.wy2;
    }
    const dWy = totalWy2 - totalWy1;
    // Zero-load point where dV/dx = wy(x) = 0 -> x = -wy1 * L / dWy
    if (Math.abs(dWy) > 1e-9) {
      const xZeroW = (-totalWy1 * L) / dWy;
      if (xZeroW > 1e-5 && xZeroW < L - 1e-5) {
        samplePositions.push({ x: xZeroW, rightLimit: true });
      }
    }
    // Zero-shear points where dM/dx = V(x) = 0 (quadratic root or linear root)
    if (elData.pointLoads.length === 0) {
      const aQuad = dWy / (2 * L);
      const bQuad = totalWy1;
      const cQuad = fEndLocalSI[1];
      if (Math.abs(aQuad) > 1e-9) {
        const disc = bQuad * bQuad - 4 * aQuad * cQuad;
        if (disc >= 0) {
          const sqrtD = Math.sqrt(disc);
          for (const r of [(-bQuad + sqrtD) / (2 * aQuad), (-bQuad - sqrtD) / (2 * aQuad)]) {
            if (r > 1e-5 && r < L - 1e-5) {
              samplePositions.push({ x: r, rightLimit: true });
            }
          }
        }
      } else if (Math.abs(bQuad) > 1e-9) {
        const r = -cQuad / bQuad;
        if (r > 1e-5 && r < L - 1e-5) {
          samplePositions.push({ x: r, rightLimit: true });
        }
      }
    }

    samplePositions.sort((a, b) => {
      if (Math.abs(a.x - b.x) > 1e-7) return a.x - b.x;
      return (a.rightLimit ? 1 : 0) - (b.rightLimit ? 1 : 0);
    });

    const stations                       = [];
    let maxAbsN = 0;
    let maxAbsV = 0;
    let maxAbsM = 0;
    let maxDeflectionMm = 0;
    let maxSigmaMpa = 0;
    let maxUtilization = 0;

    // Initialize envelope extrema trackers
    let NMax = { value: -Infinity, x: 0, xOverL: 0 };
    let NMin = { value: Infinity, x: 0, xOverL: 0 };
    let VMax = { value: -Infinity, x: 0, xOverL: 0 };
    let VMin = { value: Infinity, x: 0, xOverL: 0 };
    let MMax = { value: -Infinity, x: 0, xOverL: 0 };
    let MMin = { value: Infinity, x: 0, xOverL: 0 };
    let deflectionMax = { value: -Infinity, x: 0, xOverL: 0 };
    let sigmaMax = { value: -Infinity, x: 0, xOverL: 0 };
    let governingUtilization = { value: -Infinity, x: 0, xOverL: 0 };

    for (const sp of samplePositions) {
      const pt = evaluateElementAtX(
        sp.x,
        elData,
        nodeI,
        uMemberLocal,
        fEndLocalSI,
        sp.rightLimit
      );
      stations.push(pt);

      const xLoc = Number(pt.x.toFixed(4));
      const xiLoc = Number(pt.xi.toFixed(4));

      if (pt.N > NMax.value) NMax = { value: pt.N, x: xLoc, xOverL: xiLoc };
      if (pt.N < NMin.value) NMin = { value: pt.N, x: xLoc, xOverL: xiLoc };

      if (pt.V > VMax.value) VMax = { value: pt.V, x: xLoc, xOverL: xiLoc };
      if (pt.V < VMin.value) VMin = { value: pt.V, x: xLoc, xOverL: xiLoc };

      if (pt.M > MMax.value) MMax = { value: pt.M, x: xLoc, xOverL: xiLoc };
      if (pt.M < MMin.value) MMin = { value: pt.M, x: xLoc, xOverL: xiLoc };

      if (pt.deflectionMm > deflectionMax.value) {
        deflectionMax = { value: pt.deflectionMm, x: xLoc, xOverL: xiLoc };
      }
      if (pt.sigmaMaxMpa > sigmaMax.value) {
        sigmaMax = { value: pt.sigmaMaxMpa, x: xLoc, xOverL: xiLoc };
      }
      if (pt.utilization > governingUtilization.value) {
        governingUtilization = { value: pt.utilization, x: xLoc, xOverL: xiLoc };
      }

      if (Math.abs(pt.N) > maxAbsN) maxAbsN = Math.abs(pt.N);
      if (Math.abs(pt.V) > maxAbsV) maxAbsV = Math.abs(pt.V);
      if (Math.abs(pt.M) > maxAbsM) maxAbsM = Math.abs(pt.M);
      if (pt.deflectionMm > maxDeflectionMm) maxDeflectionMm = pt.deflectionMm;
      if (pt.sigmaMaxMpa > maxSigmaMpa) maxSigmaMpa = pt.sigmaMaxMpa;
      if (pt.utilization > maxUtilization) maxUtilization = pt.utilization;
    }

    if (maxAbsN > globalMaxN) globalMaxN = maxAbsN;
    if (maxAbsV > globalMaxV) globalMaxV = maxAbsV;
    if (maxAbsM > globalMaxM) globalMaxM = maxAbsM;
    if (maxDeflectionMm > globalMaxDeflectionMm) globalMaxDeflectionMm = maxDeflectionMm;
    if (maxSigmaMpa > globalMaxSigmaMpa) globalMaxSigmaMpa = maxSigmaMpa;
    if (maxUtilization > globalMaxUtilization) {
      globalMaxUtilization = maxUtilization;
    }

    if (governingUtilization.value >= governingMember.utilization) {
      governingMember.elementId = element.id;
      governingMember.utilization = governingUtilization.value;
      governingMember.sigmaMaxMpa = sigmaMax.value;
      governingMember.fyMpa = element.material.fy;
      governingMember.x = governingUtilization.x;
      governingMember.xOverL = governingUtilization.xOverL;
    }

    const extrema                         = {
      NMax,
      NMin,
      VMax,
      VMin,
      MMax,
      MMin,
      deflectionMax,
      sigmaMax,
      governingUtilization,
    };

    elementResults[element.id] = {
      elementId: element.id,
      lengthM: L,
      cos,
      sin,
      localEndDisplacements: uMemberLocal,
      localEndForces: [
        fEndLocalSI[0] * 1e-3,
        fEndLocalSI[1] * 1e-3,
        fEndLocalSI[2] * 1e-3,
        fEndLocalSI[3] * 1e-3,
        fEndLocalSI[4] * 1e-3,
        fEndLocalSI[5] * 1e-3,
      ],
      stations,
      extrema,
      maxAbsN,
      maxAbsV,
      maxAbsM,
      maxDeflectionMm,
      maxSigmaMpa,
      maxUtilization,
    };
  }

  return {
    stable: true,
    statusMessage: sol.statusMessage,
    nodeResults,
    elementResults,
    governingMember,
    reactionSum: {
      sumRx: Number(sumRx.toFixed(4)),
      sumRy: Number(sumRy.toFixed(4)),
      sumMzAboutOrigin: Number(sumMzAboutOrigin.toFixed(4)),
    },
    globalMaxDeflectionMm,
    globalMaxN,
    globalMaxV,
    globalMaxM,
    globalMaxSigmaMpa,
    globalMaxUtilization,
  };
}



  __exports.evaluateElementAtX = evaluateElementAtX;
  __exports.postProcessSolution = postProcessSolution;
  return __exports;
})();

// === Module: src/solver/index.ts (__mod_4) ===
__modules.__mod_4 = (function() {
  const __exports = {};
                                                                                        
const { assembleSystem } = __modules.__mod_1;
const { solveAssembledSystem } = __modules.__mod_2;
const { postProcessSolution } = __modules.__mod_3;

Object.assign(__exports, __modules.__mod_6);
Object.assign(__exports, __modules.__mod_1);
Object.assign(__exports, __modules.__mod_2);
Object.assign(__exports, __modules.__mod_3);

/**
 * Full 2D Plane Frame FEM Analysis pipeline:
 * 1. Assemble global stiffness matrix [K] and load vector {F} in base SI (m, N, Pa)
 *    with static condensation for member end hinges and exact trapezoidal/point FEFs.
 * 2. Solve [K]{U} = {F} via Gaussian elimination with scaled partial pivoting,
 *    inclined roller transformations, and mechanism stability checks.
 * 3. Post-process exact quadratic shear V(x), cubic moment M(x), Hermite+local deflection v(x),
 *    per-member envelope extrema (N_max/min, V_max/min, M_max/min with x/L locations),
 *    and combined normal stress utilization eta(x) = sigma_max(x) / fy.
 */
function analyzeStructure(
  model                 ,
  subdivisions         = 48
)                {
  try {
    const sys = assembleSystem(model);
    const sol = solveAssembledSystem(model, sys);
    return postProcessSolution(model, sys, sol, subdivisions);
  } catch (err) {
    return {
      stable: false,
      statusMessage: 'Unstable Structure',
      instabilityReason: err instanceof Error ? err.message : 'Numerical solver error',
      nodeResults: {},
      elementResults: {},
      governingMember: {
        elementId: null,
        utilization: 0,
        sigmaMaxMpa: 0,
        fyMpa: 0,
        x: 0,
        xOverL: 0,
      },
      reactionSum: {
        sumRx: 0,
        sumRy: 0,
        sumMzAboutOrigin: 0,
      },
      globalMaxDeflectionMm: 0,
      globalMaxN: 0,
      globalMaxV: 0,
      globalMaxM: 0,
      globalMaxSigmaMpa: 0,
      globalMaxUtilization: 0,
    };
  }
}

                                            



  __exports.analyzeStructure = analyzeStructure;
  return __exports;
})();

// === Module: src/utils/coordinates.ts (__mod_5) ===
__modules.__mod_5 = (function() {
  const __exports = {};
                                                                                             

                                                            

                                    
                                                            
               
                                                            
               
                                  
               
                                     
                
                                      
                 
                                                                     
                                       
                                                            
                                        
 

const GRID_MINOR_STEP_M = 0.1;
const GRID_MAJOR_STEP_M = 1.0;

/**
 * Round a floating-point world value to the fixed 0.1 m snapping increment
 * (cleaning up IEEE-754 floating point drift).
 */
function snapScalarToGrid(val        , step         = GRID_MINOR_STEP_M)         {
  const snapped = Math.round(val / step) * step;
  return Number(snapped.toFixed(4));
}

function snapPointToGrid(
  pt                          ,
  step         = GRID_MINOR_STEP_M
)                           {
  return {
    x: snapScalarToGrid(pt.x, step),
    y: snapScalarToGrid(pt.y, step),
  };
}

/**
 * Convert world Cartesian coordinates (x, y in meters, +Y up) to screen CSS pixels (+Y down).
 */
function worldToScreen(
  worldPt                          ,
  vp                   
)                             {
  return {
    sx: vp.panX + worldPt.x * vp.zoom,
    sy: vp.panY - worldPt.y * vp.zoom,
  };
}

/**
 * Convert screen CSS pixels (sx, sy) to world Cartesian coordinates (x, y in meters, +Y up).
 */
function screenToWorld(
  sx        ,
  sy        ,
  vp                   
)                           {
  return {
    x: (sx - vp.panX) / vp.zoom,
    y: (vp.panY - sy) / vp.zoom,
  };
}

/**
 * Polar -> Cartesian converter (x = x0 + r*cos(theta), y = y0 + r*sin(theta))
 * Isolates polar UI input and overlays from the Cartesian FEM solver.
 */
function polarToCartesian(
  r        ,
  thetaDeg        ,
  origin                           = { x: 0, y: 0 }
)                           {
  const rad = (thetaDeg * Math.PI) / 180;
  return {
    x: Number((origin.x + r * Math.cos(rad)).toFixed(4)),
    y: Number((origin.y + r * Math.sin(rad)).toFixed(4)),
  };
}

/**
 * Cartesian -> Polar converter (r in meters, thetaDeg in [-180, 180] degrees)
 */
function cartesianToPolar(
  x        ,
  y        ,
  origin                           = { x: 0, y: 0 }
)                                  {
  const dx = x - origin.x;
  const dy = y - origin.y;
  const r = Math.hypot(dx, dy);
  let thetaDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (thetaDeg < 0) thetaDeg += 360;
  return {
    r: Number(r.toFixed(4)),
    thetaDeg: Number(thetaDeg.toFixed(2)),
  };
}

                             
                               
            
                               
            
                      
             
                      
             
                         
                                           
                                                    
                  
                                                                                                
                          
                                                             
                       
 

/**
 * Smart CAD cursor snapping:
 * 1. Snaps to existing nodes within nodeSnapPx (default 15px).
 * 2. Snaps along existing 1D member segments within segmentSnapPx (default 11px),
 *    enabling automatic T-junction member splitting at mid-span connections.
 * 3. Snaps to the 0.1 m Cartesian grid.
 */
function computeSmartSnap(
  sx        ,
  sy        ,
  vp                   ,
  nodes                  ,
  elements                     ,
  nodeSnapPx         = 15,
  segmentSnapPx         = 11
)             {
  const nodeMap = new Map                        ();
  for (const n of nodes) nodeMap.set(n.id, n);

  // 1. Check existing nodes first
  let bestNode                        = null;
  let bestNodeDist = nodeSnapPx;
  for (const n of nodes) {
    const sc = worldToScreen(n, vp);
    const dist = Math.hypot(sx - sc.sx, sy - sc.sy);
    if (dist <= bestNodeDist) {
      bestNodeDist = dist;
      bestNode = n;
    }
  }

  if (bestNode) {
    const sc = worldToScreen(bestNode, vp);
    return {
      x: bestNode.x,
      y: bestNode.y,
      sx: sc.sx,
      sy: sc.sy,
      kind: 'node',
      nodeId: bestNode.id,
    };
  }

  // 2. Check existing member segments for T-junction mid-span snap
  let bestElem                        = null;
  let bestSegDist = segmentSnapPx;
  let bestWorldPt = { x: 0, y: 0 };
  let bestT = 0.5;

  for (const el of elements) {
    if (el.kind !== 'frame2d') continue;
    const ni = nodeMap.get(el.nodeI);
    const nj = nodeMap.get(el.nodeJ);
    if (!ni || !nj) continue;

    const si = worldToScreen(ni, vp);
    const sj = worldToScreen(nj, vp);
    const dx = sj.sx - si.sx;
    const dy = sj.sy - si.sy;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) continue;

    let t = ((sx - si.sx) * dx + (sy - si.sy) * dy) / lenSq;
    // Keep strictly interior to segment (endpoints are handled by node snap)
    if (t <= 0.03 || t >= 0.97) continue;

    const projSx = si.sx + t * dx;
    const projSy = si.sy + t * dy;
    const dist = Math.hypot(sx - projSx, sy - projSy);
    if (dist <= bestSegDist) {
      // Snap t so that distance along member or grid aligns cleanly to 0.1m increments
      const worldLen = Math.hypot(nj.x - ni.x, nj.y - ni.y);
      const rawDistAlong = t * worldLen;
      const snappedDistAlong = Math.min(
        worldLen - GRID_MINOR_STEP_M * 0.5,
        Math.max(GRID_MINOR_STEP_M * 0.5, snapScalarToGrid(rawDistAlong, GRID_MINOR_STEP_M))
      );
      const snappedT = worldLen > 1e-6 ? snappedDistAlong / worldLen : t;
      const wx = Number((ni.x + snappedT * (nj.x - ni.x)).toFixed(4));
      const wy = Number((ni.y + snappedT * (nj.y - ni.y)).toFixed(4));

      // Ensure snapped point isn't identical to start or end node
      if (
        Math.hypot(wx - ni.x, wy - ni.y) > 0.04 &&
        Math.hypot(wx - nj.x, wy - nj.y) > 0.04
      ) {
        bestSegDist = dist;
        bestElem = el;
        bestWorldPt = { x: wx, y: wy };
        bestT = snappedT;
      }
    }
  }

  if (bestElem) {
    const sc = worldToScreen(bestWorldPt, vp);
    return {
      x: bestWorldPt.x,
      y: bestWorldPt.y,
      sx: sc.sx,
      sy: sc.sy,
      kind: 'member_segment',
      splitElementId: bestElem.id,
      splitParamT: bestT,
    };
  }

  // 3. Default: snap to 0.1 m Cartesian grid
  const rawWorld = screenToWorld(sx, sy, vp);
  const gridPt = snapPointToGrid(rawWorld, GRID_MINOR_STEP_M);
  const sc = worldToScreen(gridPt, vp);
  return {
    x: gridPt.x,
    y: gridPt.y,
    sx: sc.sx,
    sy: sc.sy,
    kind: 'grid',
  };
}

/**
 * Compute a balanced ViewportTransform that centers and fits the structural model.
 */
function fitModelToViewport(
  nodes                  ,
  width        ,
  height        ,
  current                             
)                    {
  const base                    = {
    panX: width * 0.25,
    panY: height * 0.65,
    zoom: 70,
    width,
    height,
    coordSystem: current?.coordSystem ?? 'cartesian',
    polarOrigin: current?.polarOrigin ?? { x: 0, y: 0 },
  };

  if (nodes.length === 0 || width <= 0 || height <= 0) {
    return base;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }

  const spanX = Math.max(maxX - minX, 3.0);
  const spanY = Math.max(maxY - minY, 2.5);

  const usableW = Math.max(width - 240, width * 0.62);
  const usableH = Math.max(height - 220, height * 0.58);

  const zoom = Math.min(
    180,
    Math.max(24, Math.min(usableW / spanX, usableH / spanY))
  );

  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;

  return {
    ...base,
    zoom,
    panX: width * 0.5 - centerX * zoom,
    panY: height * 0.54 + centerY * zoom,
  };
}



  __exports.GRID_MINOR_STEP_M = GRID_MINOR_STEP_M;
  __exports.GRID_MAJOR_STEP_M = GRID_MAJOR_STEP_M;
  __exports.snapScalarToGrid = snapScalarToGrid;
  __exports.snapPointToGrid = snapPointToGrid;
  __exports.worldToScreen = worldToScreen;
  __exports.screenToWorld = screenToWorld;
  __exports.polarToCartesian = polarToCartesian;
  __exports.cartesianToPolar = cartesianToPolar;
  __exports.computeSmartSnap = computeSmartSnap;
  __exports.fitModelToViewport = fitModelToViewport;
  return __exports;
})();

// === Module: src/solver/sections.ts (__mod_6) ===
__modules.__mod_6 = (function() {
  const __exports = {};
               
               
                         
                    
           
                     
                
                  
                           

const MATERIAL_PRESETS                                                          = {
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

function createMaterialFromPreset(preset                    , customE = 200, customFy = 355)           {
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
function computeCrossSection(
  shape                   ,
  dims                        ,
  customProps                                                        
)               {
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
function restraintsFromSupportPreset(support               )                  {
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



  __exports.MATERIAL_PRESETS = MATERIAL_PRESETS;
  __exports.createMaterialFromPreset = createMaterialFromPreset;
  __exports.computeCrossSection = computeCrossSection;
  __exports.restraintsFromSupportPreset = restraintsFromSupportPreset;
  return __exports;
})();

// === Module: src/utils/geometry.ts (__mod_7) ===
__modules.__mod_7 = (function() {
  const __exports = {};
               
                  
                 
                 
                 
               
                     
                           
const { worldToScreen,                        } = __modules.__mod_5;
const { restraintsFromSupportPreset } = __modules.__mod_6;

                                 
                          
                              
                  
                  
 

                             
                                                                      
                                                                      
                                                                            

/**
 * Generate a clean sequential ID (e.g. N8, M14, L5) not currently in use.
 */
function nextEntityId(prefix                 , existingIds          )         {
  const used = new Set(existingIds);
  let idx = 1;
  while (used.has(`${prefix}${idx}`)) {
    idx++;
  }
  return `${prefix}${idx}`;
}

/**
 * Split an existing Frame2DElement at parametric coordinate t in (0, 1) (world point (wx, wy)),
 * creating a new intermediate node and two child elements while preserving section, material,
 * outer end hinges, and splitting any member loads accurately across the two segments.
 */
function splitMemberAtPoint(
  model                 ,
  elementId        ,
  wx        ,
  wy        
)                                                {
  const targetEl = model.elements.find(
    (e)                      => e.kind === 'frame2d' && e.id === elementId
  );
  if (!targetEl) {
    throw new Error(`Element ${elementId} not found for T-junction split.`);
  }

  const nodeI = model.nodes.find((n) => n.id === targetEl.nodeI);
  const nodeJ = model.nodes.find((n) => n.id === targetEl.nodeJ);
  if (!nodeI || !nodeJ) {
    throw new Error(`Endpoints of ${elementId} not found.`);
  }

  // If point is already very close to nodeI or nodeJ, reuse existing endpoint node
  if (Math.hypot(wx - nodeI.x, wy - nodeI.y) < 0.04) {
    return { model, newNodeId: nodeI.id };
  }
  if (Math.hypot(wx - nodeJ.x, wy - nodeJ.y) < 0.04) {
    return { model, newNodeId: nodeJ.id };
  }

  const totalL = Math.hypot(nodeJ.x - nodeI.x, nodeJ.y - nodeI.y);
  const L1 = Math.hypot(wx - nodeI.x, wy - nodeI.y);
  const t = totalL > 1e-6 ? Math.min(0.98, Math.max(0.02, L1 / totalL)) : 0.5;

  const newNodeId = nextEntityId(
    'N',
    model.nodes.map((n) => n.id)
  );
  const newNode                 = {
    id: newNodeId,
    label: newNodeId,
    x: wx,
    y: wy,
    z: 0,
    support: 'none',
    restraints: restraintsFromSupportPreset('none'),
    springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
  };

  const existingElIds = model.elements.map((e) => e.id);
  const idA = nextEntityId('M', existingElIds);
  const idB = nextEntityId('M', [...existingElIds, idA]);

  const elA                 = {
    id: idA,
    kind: 'frame2d',
    label: targetEl.label ? `${targetEl.label} (A)` : idA,
    nodeI: targetEl.nodeI,
    nodeJ: newNodeId,
    section: { ...targetEl.section, dimensions: { ...targetEl.section.dimensions } },
    material: { ...targetEl.material },
    releaseStart: targetEl.releaseStart,
    releaseEnd: false, // Continuous across T-junction split unless edited
  };

  const elB                 = {
    id: idB,
    kind: 'frame2d',
    label: targetEl.label ? `${targetEl.label} (B)` : idB,
    nodeI: newNodeId,
    nodeJ: targetEl.nodeJ,
    section: { ...targetEl.section, dimensions: { ...targetEl.section.dimensions } },
    material: { ...targetEl.material },
    releaseStart: false,
    releaseEnd: targetEl.releaseEnd,
  };

  // Remap loads on targetEl to elA and elB
  const updatedLoads                   = [];
  const usedLoadIds = model.loads.map((l) => l.id);

  for (const ld of model.loads) {
    if (ld.kind === 'member_distributed' && ld.elementId === elementId) {
      // Interpolate intensity at split point: wMid = w1 + t*(w2 - w1)
      const wMid = Number((ld.w1 + t * (ld.w2 - ld.w1)).toFixed(3));
      const newLoadIdA = nextEntityId('L', usedLoadIds);
      usedLoadIds.push(newLoadIdA);
      const newLoadIdB = nextEntityId('L', usedLoadIds);
      usedLoadIds.push(newLoadIdB);

      updatedLoads.push({
        ...ld,
        id: newLoadIdA,
        elementId: idA,
        w1: ld.w1,
        w2: wMid,
      });
      updatedLoads.push({
        ...ld,
        id: newLoadIdB,
        elementId: idB,
        w1: wMid,
        w2: ld.w2,
      });
    } else if (ld.kind === 'member_point' && ld.elementId === elementId) {
      if (ld.a <= L1) {
        updatedLoads.push({
          ...ld,
          elementId: idA,
          a: Number(Math.min(L1, ld.a).toFixed(3)),
        });
      } else {
        updatedLoads.push({
          ...ld,
          elementId: idB,
          a: Number(Math.max(0, ld.a - L1).toFixed(3)),
        });
      }
    } else {
      updatedLoads.push(ld);
    }
  }

  const nextElements = model.elements.flatMap((e) => (e.id === elementId ? [elA, elB] : [e]));

  return {
    model: {
      ...model,
      nodes: [...model.nodes, newNode],
      elements: nextElements,
      loads: updatedLoads,
    },
    newNodeId,
  };
}

/**
 * Check if a candidate member between nodeI and nodeJ is zero-length or duplicates an existing member.
 */
function canAddMember(
  model                 ,
  nodeIId        ,
  nodeJId        
)                                      {
  if (nodeIId === nodeJId) {
    return { valid: false, reason: 'Cannot create a zero-length member on the same node.' };
  }
  const nI = model.nodes.find((n) => n.id === nodeIId);
  const nJ = model.nodes.find((n) => n.id === nodeJId);
  if (!nI || !nJ) {
    return { valid: false, reason: 'Start or end node does not exist.' };
  }
  if (Math.hypot(nJ.x - nI.x, nJ.y - nI.y) < 0.04) {
    return { valid: false, reason: 'Member length must be at least 0.05 m.' };
  }
  for (const el of model.elements) {
    if (el.kind !== 'frame2d') continue;
    if (
      (el.nodeI === nodeIId && el.nodeJ === nodeJId) ||
      (el.nodeI === nodeJId && el.nodeJ === nodeIId)
    ) {
      return { valid: false, reason: 'Duplicate overlapping member between these nodes.' };
    }
  }
  return { valid: true };
}

/**
 * Hit-test the canvas in priority order:
 * 1. Load handles / arrows / labels (so clicking any Load opens the Load editor pop-up)
 * 2. Nodes (so clicking any Node opens the Node editor pop-up)
 * 3. Members (so clicking any Member opens the Member editor pop-up)
 */
function hitTestCanvas(
  sx        ,
  sy        ,
  vp                   ,
  model                 ,
  loadHandles                                                   
)                         {
  const nodeMap = new Map                        ();
  for (const n of model.nodes) nodeMap.set(n.id, n);

  // 1. Check Load interactive handles first (within 15px)
  let bestLoad                                                    = null;
  let bestLoadDist = 15;
  for (const lh of loadHandles) {
    const d = Math.hypot(sx - lh.sx, sy - lh.sy);
    if (d <= bestLoadDist) {
      bestLoadDist = d;
      bestLoad = lh;
    }
  }
  if (bestLoad) {
    return {
      kind: 'load',
      loadId: bestLoad.loadId,
      screenX: bestLoad.sx,
      screenY: bestLoad.sy,
    };
  }

  // 2. Check Nodes (within 14px)
  let bestNode                        = null;
  let bestNodeDist = 14;
  let bestNodeScreen = { sx: 0, sy: 0 };
  for (const n of model.nodes) {
    const sc = worldToScreen(n, vp);
    const d = Math.hypot(sx - sc.sx, sy - sc.sy);
    if (d <= bestNodeDist) {
      bestNodeDist = d;
      bestNode = n;
      bestNodeScreen = sc;
    }
  }
  if (bestNode) {
    return {
      kind: 'node',
      nodeId: bestNode.id,
      screenX: bestNodeScreen.sx,
      screenY: bestNodeScreen.sy,
    };
  }

  // 3. Check Members (within 10px of segment)
  let bestEl                        = null;
  let bestElDist = 10;
  let bestElProj = { sx: 0, sy: 0 };
  for (const el of model.elements) {
    if (el.kind !== 'frame2d') continue;
    const ni = nodeMap.get(el.nodeI);
    const nj = nodeMap.get(el.nodeJ);
    if (!ni || !nj) continue;
    const si = worldToScreen(ni, vp);
    const sj = worldToScreen(nj, vp);
    const dx = sj.sx - si.sx;
    const dy = sj.sy - si.sy;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) continue;
    const t = Math.min(1, Math.max(0, ((sx - si.sx) * dx + (sy - si.sy) * dy) / lenSq));
    const px = si.sx + t * dx;
    const py = si.sy + t * dy;
    const d = Math.hypot(sx - px, sy - py);
    if (d <= bestElDist) {
      bestElDist = d;
      bestEl = el;
      bestElProj = { sx: px, sy: py };
    }
  }

  if (bestEl) {
    return {
      kind: 'member',
      elementId: bestEl.id,
      screenX: bestElProj.sx,
      screenY: bestElProj.sy,
    };
  }

  return null;
}

/**
 * Interactive Hover Probe:
 * Find the closest point along any member within hoverRadiusPx and interpolate/lookup
 * the exact station result (x, N(x), V(x), M(x), sigma(x), deflectionMm).
 */
function probeMemberAtCursor(
  sx        ,
  sy        ,
  vp                   ,
  model                 ,
  solverOutput              ,
  hoverRadiusPx         = 18
)                        {
  if (!solverOutput.stable) return null;

  const nodeMap = new Map                        ();
  for (const n of model.nodes) nodeMap.set(n.id, n);

  let bestEl                        = null;
  let bestDist = hoverRadiusPx;
  let bestT = 0;

  for (const el of model.elements) {
    if (el.kind !== 'frame2d') continue;
    const ni = nodeMap.get(el.nodeI);
    const nj = nodeMap.get(el.nodeJ);
    if (!ni || !nj) continue;

    const si = worldToScreen(ni, vp);
    const sj = worldToScreen(nj, vp);
    const dx = sj.sx - si.sx;
    const dy = sj.sy - si.sy;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) continue;

    const t = Math.min(1, Math.max(0, ((sx - si.sx) * dx + (sy - si.sy) * dy) / lenSq));
    const px = si.sx + t * dx;
    const py = si.sy + t * dy;
    const dist = Math.hypot(sx - px, sy - py);
    if (dist <= bestDist) {
      bestDist = dist;
      bestEl = el;
      bestT = t;
    }
  }

  if (!bestEl) return null;
  const elRes = solverOutput.elementResults[bestEl.id];
  if (!elRes || elRes.stations.length === 0) return null;

  const targetX = bestT * elRes.lengthM;
  let closestStation = elRes.stations[0];
  let minDx = Math.abs(closestStation.x - targetX);

  for (const st of elRes.stations) {
    const dx = Math.abs(st.x - targetX);
    if (dx < minDx) {
      minDx = dx;
      closestStation = st;
    }
  }

  const sc = worldToScreen({ x: closestStation.worldX, y: closestStation.worldY }, vp);
  return {
    element: bestEl,
    station: closestStation,
    screenX: sc.sx,
    screenY: sc.sy,
  };
}



  __exports.nextEntityId = nextEntityId;
  __exports.splitMemberAtPoint = splitMemberAtPoint;
  __exports.canAddMember = canAddMember;
  __exports.hitTestCanvas = hitTestCanvas;
  __exports.probeMemberAtCursor = probeMemberAtCursor;
  return __exports;
})();

// === Module: src/renderer/CanvasRenderer.ts (__mod_8) ===
__modules.__mod_8 = (function() {
  const __exports = {};
               
                  
                 
                 
                
               
                           
const {
  worldToScreen,
  screenToWorld,
  cartesianToPolar,
  fitModelToViewport,
  GRID_MINOR_STEP_M,
  GRID_MAJOR_STEP_M,
                         
                  
} = __modules.__mod_5;
                                                           

                                                          

                                 
              
              
           
           
            
               
             
              

                                        
                          
                                
                 
                  
               
                                 
                           
                        
                             
                                                                                
                                                                                 
 

                                     
                    
                     
                        
                        
                     
                     
                      
                         
                       
                                
                                             
                                               
 

                                         
                                                                                                            
                                
                                   
                                
                                  
                                
                                                                                            
                                    
 

                                   
                 
             
             
 

/**
 * Interpolate green -> yellow -> amber -> crimson utilization color for eta = sigma_max / fy
 */
function utilizationToColor(eta        , alpha = 1)         {
  const t = Math.max(0, Math.min(1.25, eta));
  let r = 16;
  let g = 185;
  let b = 129;

  if (t <= 0.5) {
    // Emerald (#10b981) -> Amber/Yellow (#eab308)
    const u = t / 0.5;
    r = Math.round(16 + u * (234 - 16));
    g = Math.round(185 + u * (179 - 185));
    b = Math.round(129 + u * (8 - 129));
  } else if (t <= 1.0) {
    // Yellow (#eab308) -> Orange-Red (#f97316 -> #ef4444)
    const u = (t - 0.5) / 0.5;
    r = Math.round(234 + u * (239 - 234));
    g = Math.round(179 + u * (68 - 179));
    b = Math.round(8 + u * (68 - 8));
  } else {
    // Overstressed (> 1.0): bright crimson (#dc2626)
    r = 220;
    g = 38;
    b = 38;
  }

  return alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgb(${r}, ${g}, ${b})`;
}

function drawArrowhead(
  ctx                          ,
  tipX        ,
  tipY        ,
  dirX        ,
  dirY        ,
  size         = 8
)       {
  const len = Math.hypot(dirX, dirY);
  if (len < 1e-6) return;
  const ux = dirX / len;
  const uy = dirY / len;
  const px = -uy;
  const py = ux;

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - ux * size + px * (size * 0.52), tipY - uy * size + py * (size * 0.52));
  ctx.lineTo(tipX - ux * size - px * (size * 0.52), tipY - uy * size - py * (size * 0.52));
  ctx.closePath();
  ctx.fill();
}

function drawRoundedBadge(
  ctx                          ,
  text        ,
  cx        ,
  cy        ,
  bgColor        ,
  borderColor        ,
  textColor        ,
  font = '600 11px "JetBrains Mono", ui-monospace, monospace'
)       {
  ctx.save();
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const padX = 6;
  const w = metrics.width + padX * 2;
  const h = 19;
  const x = cx - w * 0.5;
  const y = cy - h * 0.5;
  const r = 4;

  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 0.5);
  ctx.restore();
}

/**
 * Build a clean RenderLayerOptions configuration for a given report snapshot overlay mode.
 */
function buildSnapshotLayers(
  overlayMode                     ,
  baseLayers                              
)                     {
  const defScale = baseLayers?.deflectionScale ?? 120;
  const diagScale = baseLayers?.diagramScale ?? 1.0;
  const mSide = baseLayers?.momentSide ?? 'tension';

  if (overlayMode === 'current' && baseLayers) {
    return {
      showGrid: baseLayers.showGrid ?? true,
      showLoads: baseLayers.showLoads ?? true,
      showSupports: baseLayers.showSupports ?? true,
      showDeformed: baseLayers.showDeformed ?? true,
      showAxial: baseLayers.showAxial ?? false,
      showShear: baseLayers.showShear ?? false,
      showMoment: baseLayers.showMoment ?? true,
      showReactions: baseLayers.showReactions ?? true,
      showHeatmap: baseLayers.showHeatmap ?? false,
      momentSide: mSide,
      deflectionScale: defScale,
      diagramScale: diagScale,
    };
  }

  return {
    showGrid: true,
    showLoads: overlayMode === 'geometry' || overlayMode === 'reactions',
    showSupports: true,
    showDeformed: overlayMode === 'deformed' || overlayMode === 'heatmap',
    showAxial: overlayMode === 'axial',
    showShear: overlayMode === 'shear',
    showMoment: overlayMode === 'moment',
    showReactions: overlayMode === 'reactions' || overlayMode === 'deformed',
    showHeatmap: overlayMode === 'heatmap',
    momentSide: mSide,
    deflectionScale: defScale,
    diagramScale: diagScale,
  };
}

/**
 * Dedicated HTML5 Canvas Renderer for 2D Structural FEM Analysis.
 * Returns interactive load screen handles for canvas hit-testing and exposes
 * `exportViewSnapshot(overlayMode)` for programmatic high-DPI report image generation.
 */
class CanvasRenderer {
          lastViewport                           = null;
          lastModel                         = null;
          lastSolverOutput                       = null;
          lastLayers                            = null;

  /**
   * Programmatically render an offscreen high-DPI PNG data URL of the structure for
   * HTML/PDF calculation reports (`overlayMode`: 'geometry' | 'deformed' | 'axial' | 'shear' | 'moment' | 'reactions' | 'heatmap' | 'current').
   */
         exportViewSnapshot(
    overlayMode                      = 'current',
    options                        
  )         {
    const model = options?.model ?? this.lastModel;
    const solverResults = options?.solverResults ?? this.lastSolverOutput;
    if (!model || !solverResults) {
      throw new Error(
        'CanvasRenderer.exportViewSnapshot requires an active model and solverResults (either rendered previously or passed in options).'
      );
    }

    const cssWidth = options?.width ?? this.lastViewport?.width ?? 1280;
    const cssHeight = options?.height ?? this.lastViewport?.height ?? 800;
    const dpr = options?.dpr ?? 2;
    const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr));

    const offscreenCanvas                    = options?.canvasFactory
      ? options.canvasFactory(pixelWidth, pixelHeight)
      : document.createElement('canvas');
    offscreenCanvas.width = pixelWidth;
    offscreenCanvas.height = pixelHeight;

    const ctx = offscreenCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to acquire 2D rendering context for snapshot export.');
    }

    const vp                    =
      options?.preserveViewport && this.lastViewport
        ? { ...this.lastViewport, width: cssWidth, height: cssHeight }
        : fitModelToViewport(model.nodes, cssWidth, cssHeight, this.lastViewport ?? undefined);

    const snapshotLayers = buildSnapshotLayers(overlayMode, {
      ...this.lastLayers,
      momentSide: options?.momentSide ?? this.lastLayers?.momentSide ?? 'tension',
      deflectionScale: options?.deflectionScale ?? this.lastLayers?.deflectionScale ?? 120,
      diagramScale: options?.diagramScale ?? this.lastLayers?.diagramScale ?? 1.0,
    });

    const neutralInteraction                         = {
      activeTool: 'select',
      selectedNodeId: null,
      selectedElementId: null,
      selectedLoadId: null,
      hoveredElementId: null,
      snapTarget: null,
      drawStartPoint: null,
      hoverProbe: null,
    };

    ctx.save();
    ctx.scale(dpr, dpr);
    this.render(ctx, vp, model, solverResults, snapshotLayers, neutralInteraction);

    // Draw clean report caption stamp in top-left corner
    const modeLabelMap                                      = {
      geometry: 'Structural Geometry & Applied Loading',
      deformed: `Deformed Shape (${snapshotLayers.deflectionScale}× Exaggeration) · Max |δ| = ${solverResults.globalMaxDeflectionMm.toFixed(2)} mm`,
      axial: `Axial Force Diagram N(x) · Max |N| = ${solverResults.globalMaxN.toFixed(2)} kN`,
      shear: `Shear Force Diagram V(x) · Max |V| = ${solverResults.globalMaxV.toFixed(2)} kN`,
      moment: `Bending Moment Diagram M(x) (${snapshotLayers.momentSide === 'tension' ? 'Tension Face' : 'Compression Face'}) · Max |M| = ${solverResults.globalMaxM.toFixed(2)} kNm`,
      reactions: `Support & Spring Reactions · ΣRx = ${solverResults.reactionSum.sumRx.toFixed(1)} kN, ΣRy = ${solverResults.reactionSum.sumRy.toFixed(1)} kN`,
      heatmap: `Stress Utilization Heatmap (σ_max / fy) · Max η = ${(solverResults.globalMaxUtilization * 100).toFixed(1)}%`,
      current: `${model.name} — Analysis View`,
    };

    drawRoundedBadge(
      ctx,
      `${model.name} · ${modeLabelMap[overlayMode]}`,
      Math.min(cssWidth * 0.5, 290),
      24,
      'rgba(15, 23, 42, 0.92)',
      '#38bdf8',
      '#f8fafc',
      '600 11px "JetBrains Mono", ui-monospace, monospace'
    );
    ctx.restore();

    return typeof offscreenCanvas.toDataURL === 'function'
      ? offscreenCanvas.toDataURL('image/png')
      : '';
  }

         render(
    ctx                          ,
    vp                   ,
    model                 ,
    solverOutput              ,
    layers                    ,
    interaction                        
  )                     {
    this.lastViewport = vp;
    this.lastModel = model;
    this.lastSolverOutput = solverOutput;
    this.lastLayers = layers;
    const { width, height } = vp;
    const loadHandles                     = [];

    ctx.save();
    // Clear canvas with deep engineering slate background
    ctx.fillStyle = '#0b101b';
    ctx.fillRect(0, 0, width, height);

    const nodeMap = new Map                        ();
    for (const n of model.nodes) nodeMap.set(n.id, n);

    // 1. Render Cartesian Grid (+ Polar Overlay if enabled)
    if (layers.showGrid) {
      this.renderGrid(ctx, vp);
    }

    // 2. Render Internal Force Diagrams (N, V, M) underneath/around members
    if (solverOutput.stable) {
      if (layers.showAxial) {
        this.renderForceDiagram(ctx, vp, model, solverOutput, 'N', layers);
      }
      if (layers.showShear) {
        this.renderForceDiagram(ctx, vp, model, solverOutput, 'V', layers);
      }
      if (layers.showMoment) {
        this.renderForceDiagram(ctx, vp, model, solverOutput, 'M', layers);
      }
    }

    // 3. Render Undeformed Structural Members (with proportional depth & heatmap if active)
    this.renderMembers(ctx, vp, model, solverOutput, layers, interaction, nodeMap);

    // 4. Render Supports & Elastic Springs (Fixed, Pinned, Rollers, Inclined Roller, kx, ky, krz)
    if (layers.showSupports) {
      this.renderSupportsAndSprings(ctx, vp, model);
    }

    // 5. Render Applied Loads (Distributed Trapezoidal/UDL, Member Point, Nodal Loads)
    if (layers.showLoads) {
      this.renderLoads(ctx, vp, model, interaction, nodeMap, loadHandles);
    }

    // 6. Render Deformed Shape (Hermite cubic + 5th-order local deflection)
    if (solverOutput.stable && layers.showDeformed) {
      this.renderDeformedShape(ctx, vp, model, solverOutput, layers);
    }

    // 7. Render Support & Spring Reaction Vectors
    if (solverOutput.stable && layers.showReactions) {
      this.renderSupportReactions(ctx, vp, model, solverOutput);
    }

    // 8. Render Structural Nodes & Selection Halos
    this.renderNodes(ctx, vp, model, interaction);

    // 9. Render Interactive CAD Drawing Preview, Smart Snap Indicator & Hover Probe Marker
    this.renderInteractiveOverlays(ctx, vp, interaction);

    ctx.restore();
    return loadHandles;
  }

          renderGrid(ctx                          , vp                   )       {
    const topLeft = screenToWorld(0, 0, vp);
    const botRight = screenToWorld(vp.width, vp.height, vp);

    const minX = Math.floor(Math.min(topLeft.x, botRight.x) - 1);
    const maxX = Math.ceil(Math.max(topLeft.x, botRight.x) + 1);
    const minY = Math.floor(Math.min(topLeft.y, botRight.y) - 1);
    const maxY = Math.ceil(Math.max(topLeft.y, botRight.y) + 1);

    // Minor 0.1 m grid lines (visible when zoom >= 42 px/m so spacing >= 4.2px)
    if (vp.zoom >= 42) {
      ctx.strokeStyle = vp.zoom >= 80 ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.045)';
      ctx.lineWidth = 1;
      ctx.beginPath();

      const startMinorX = Math.floor(minX / GRID_MINOR_STEP_M) * GRID_MINOR_STEP_M;
      for (let x = startMinorX; x <= maxX; x += GRID_MINOR_STEP_M) {
        if (Math.abs(Math.round(x) - x) < 1e-4) continue;
        const sx = Math.round(vp.panX + x * vp.zoom) + 0.5;
        if (sx >= 0 && sx <= vp.width) {
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, vp.height);
        }
      }

      const startMinorY = Math.floor(minY / GRID_MINOR_STEP_M) * GRID_MINOR_STEP_M;
      for (let y = startMinorY; y <= maxY; y += GRID_MINOR_STEP_M) {
        if (Math.abs(Math.round(y) - y) < 1e-4) continue;
        const sy = Math.round(vp.panY - y * vp.zoom) + 0.5;
        if (sy >= 0 && sy <= vp.height) {
          ctx.moveTo(0, sy);
          ctx.lineTo(vp.width, sy);
        }
      }
      ctx.stroke();
    }

    // Major 1.0 m grid lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = minX; x <= maxX; x += GRID_MAJOR_STEP_M) {
      const sx = Math.round(vp.panX + x * vp.zoom) + 0.5;
      if (sx >= 0 && sx <= vp.width) {
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, vp.height);
      }
    }
    for (let y = minY; y <= maxY; y += GRID_MAJOR_STEP_M) {
      const sy = Math.round(vp.panY - y * vp.zoom) + 0.5;
      if (sy >= 0 && sy <= vp.height) {
        ctx.moveTo(0, sy);
        ctx.lineTo(vp.width, sy);
      }
    }
    ctx.stroke();

    // Optional Polar (r, theta) Coordinate Overlay (future-proofed coordinate layer)
    if (vp.coordSystem === 'polar') {
      const origScreen = worldToScreen(vp.polarOrigin, vp);
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      const maxR = Math.ceil(Math.hypot(maxX - minX, maxY - minY));
      for (let r = 1; r <= maxR; r += 1) {
        ctx.beginPath();
        ctx.arc(origScreen.sx, origScreen.sy, r * vp.zoom, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let deg = 0; deg < 360; deg += 30) {
        const rad = (deg * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(origScreen.sx, origScreen.sy);
        ctx.lineTo(
          origScreen.sx + Math.cos(rad) * maxR * vp.zoom,
          origScreen.sy - Math.sin(rad) * maxR * vp.zoom
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    // World Coordinate Axes X = 0 and Y = 0
    const origin = worldToScreen({ x: 0, y: 0 }, vp);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (origin.sx >= 0 && origin.sx <= vp.width) {
      ctx.moveTo(origin.sx, 0);
      ctx.lineTo(origin.sx, vp.height);
    }
    if (origin.sy >= 0 && origin.sy <= vp.height) {
      ctx.moveTo(0, origin.sy);
      ctx.lineTo(vp.width, origin.sy);
    }
    ctx.stroke();

    // Meter coordinate tick labels along major grid lines
    ctx.fillStyle = 'rgba(148, 163, 184, 0.48)';
    ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
    const labelStep = vp.zoom < 38 ? 2 : 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const axisY = Math.min(vp.height - 18, Math.max(8, origin.sy + 5));
    for (let x = minX; x <= maxX; x += labelStep) {
      const sx = vp.panX + x * vp.zoom;
      if (sx > 30 && sx < vp.width - 30) {
        ctx.fillText(`${x}m`, sx, axisY);
      }
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const axisX = Math.min(vp.width - 38, Math.max(8, origin.sx + 6));
    for (let y = minY; y <= maxY; y += labelStep) {
      if (y === 0) continue;
      const sy = vp.panY - y * vp.zoom;
      if (sy > 24 && sy < vp.height - 24) {
        ctx.fillText(`${y}m`, axisX, sy);
      }
    }
  }

          renderMembers(
    ctx                          ,
    vp                   ,
    model                 ,
    solverOutput              ,
    layers                    ,
    interaction                        ,
    nodeMap                             
  )       {
    for (const el of model.elements) {
      if (el.kind !== 'frame2d') continue;
      const ni = nodeMap.get(el.nodeI);
      const nj = nodeMap.get(el.nodeJ);
      if (!ni || !nj) continue;

      const si = worldToScreen(ni, vp);
      const sj = worldToScreen(nj, vp);

      // Proportional stroke width based on cross-section depth (depthMm in mm)
      // e.g. 120mm -> ~3.5px, 350mm -> ~6.5px, 500mm -> ~8.5px
      const depthMm = el.section.depthMm ?? 300;
      const baseThickness = Math.min(12, Math.max(3, 2.2 + (depthMm / 1000) * 12));

      const isSelected = interaction.selectedElementId === el.id;
      const isHovered = interaction.hoveredElementId === el.id;

      // Selection / hover outer glow
      if (isSelected || isHovered) {
        ctx.save();
        ctx.strokeStyle = isSelected ? 'rgba(56, 189, 248, 0.45)' : 'rgba(148, 163, 184, 0.28)';
        ctx.lineWidth = baseThickness + 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(si.sx, si.sy);
        ctx.lineTo(sj.sx, sj.sy);
        ctx.stroke();
        ctx.restore();
      }

      const elRes = solverOutput.elementResults[el.id];

      if (layers.showHeatmap && solverOutput.stable && elRes && elRes.stations.length > 1) {
        // Render smooth Stress Utilization Heatmap segments along the member
        ctx.save();
        ctx.lineWidth = baseThickness + 1.5;
        ctx.lineCap = 'butt';
        for (let k = 0; k < elRes.stations.length - 1; k++) {
          const stA = elRes.stations[k];
          const stB = elRes.stations[k + 1];
          const pA = worldToScreen({ x: stA.worldX, y: stA.worldY }, vp);
          const pB = worldToScreen({ x: stB.worldX, y: stB.worldY }, vp);
          if (Math.hypot(pB.sx - pA.sx, pB.sy - pA.sy) < 0.2) continue;

          const avgEta = 0.5 * (stA.utilization + stB.utilization);
          ctx.strokeStyle = utilizationToColor(avgEta);
          ctx.beginPath();
          ctx.moveTo(pA.sx, pA.sy);
          ctx.lineTo(pB.sx, pB.sy);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        // Render material-tinted structural member with architectural depth
        let strokeColor = '#60a5fa'; // Steel blue
        if (el.material.preset === 'concrete') strokeColor = '#94a3b8'; // Concrete slate
        if (el.material.preset === 'timber') strokeColor = '#f59e0b'; // Timber amber
        if (el.material.preset === 'custom') strokeColor = '#38bdf8';
        if (isSelected) strokeColor = '#38bdf8';

        // Outer flange edge
        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = baseThickness;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(si.sx, si.sy);
        ctx.lineTo(sj.sx, sj.sy);
        ctx.stroke();

        // Subtle inner web highlight for depth
        if (baseThickness >= 5) {
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
          ctx.lineWidth = Math.max(1.5, baseThickness - 3.2);
          ctx.beginPath();
          ctx.moveTo(si.sx, si.sy);
          ctx.lineTo(sj.sx, sj.sy);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Render member end hinges (open circles offset 12px inward from member start/end)
      const dx = sj.sx - si.sx;
      const dy = sj.sy - si.sy;
      const screenLen = Math.hypot(dx, dy);
      if (screenLen > 28) {
        const ux = dx / screenLen;
        const uy = dy / screenLen;
        const hingeOffset = 12;
        const hingeRadius = 4.6;

        if (el.releaseStart) {
          const hx = si.sx + ux * hingeOffset;
          const hy = si.sy + uy * hingeOffset;
          ctx.save();
          ctx.fillStyle = '#0b101b';
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(hx, hy, hingeRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }

        if (el.releaseEnd) {
          const hx = sj.sx - ux * hingeOffset;
          const hy = sj.sy - uy * hingeOffset;
          ctx.save();
          ctx.fillStyle = '#0b101b';
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(hx, hy, hingeRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      // Render member ID / utilization badge at midpoint if heatmap is active or member is selected
      if (screenLen > 55) {
        const midX = (si.sx + sj.sx) * 0.5;
        const midY = (si.sy + sj.sy) * 0.5;
        const nx = -dy / screenLen;
        const ny = dx / screenLen;

        if (layers.showHeatmap && solverOutput.stable && elRes) {
          const pct = (elRes.maxUtilization * 100).toFixed(0);
          drawRoundedBadge(
            ctx,
            `${el.id}: ${pct}% (${elRes.maxSigmaMpa.toFixed(1)} MPa)`,
            midX + nx * 16,
            midY + ny * 16,
            'rgba(15, 23, 42, 0.88)',
            utilizationToColor(elRes.maxUtilization),
            '#f8fafc',
            '600 10px "JetBrains Mono", ui-monospace, monospace'
          );
        } else if (isSelected) {
          drawRoundedBadge(
            ctx,
            `${el.id} · ${el.section.name}`,
            midX + nx * 16,
            midY + ny * 16,
            'rgba(15, 23, 42, 0.9)',
            '#38bdf8',
            '#e0f2fe',
            '600 10px "JetBrains Mono", ui-monospace, monospace'
          );
        }
      }
    }
  }

          renderSupportsAndSprings(
    ctx                          ,
    vp                   ,
    model                 
  )       {
    for (const node of model.nodes) {
      const sc = worldToScreen(node, vp);

      // 1. Render Nodal Restraint Support Symbols
      if (node.support !== 'none') {
        ctx.save();
        ctx.translate(sc.sx, sc.sy);

        // Determine rotation angle of support base:
        // rollerX / pinned / fixed: horizontal ground below node (0 rad)
        // rollerY: vertical wall to the left of node (-90 deg in screen)
        // inclinedRoller: rotated by -inclinedAngleDeg (since screen +Y is down and world +Y is up)
        let rotRad = 0;
        if (node.support === 'rollerY') {
          rotRad = -Math.PI / 2;
        } else if (node.support === 'inclinedRoller') {
          rotRad = -((node.inclinedAngleDeg ?? 0) * Math.PI) / 180;
        }
        ctx.rotate(rotRad);

        ctx.strokeStyle = '#2dd4bf'; // Teal engineering support symbol
        ctx.fillStyle = 'rgba(45, 212, 191, 0.16)';
        ctx.lineWidth = 1.8;

        if (node.support === 'fixed') {
          // Fixed support block & hatches
          ctx.beginPath();
          ctx.moveTo(-14, 4);
          ctx.lineTo(14, 4);
          ctx.stroke();

          ctx.fillStyle = 'rgba(45, 212, 191, 0.22)';
          ctx.fillRect(-10, -4, 20, 8);
          ctx.strokeRect(-10, -4, 20, 8);

          // Ground hatches
          ctx.lineWidth = 1.3;
          for (let hx = -12; hx <= 12; hx += 6) {
            ctx.beginPath();
            ctx.moveTo(hx, 4);
            ctx.lineTo(hx - 4, 11);
            ctx.stroke();
          }
        } else if (node.support === 'pinned') {
          // Pinned triangle
          ctx.beginPath();
          ctx.moveTo(0, 2);
          ctx.lineTo(-11, 17);
          ctx.lineTo(11, 17);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Ground line & hatches
          ctx.beginPath();
          ctx.moveTo(-15, 17);
          ctx.lineTo(15, 17);
          ctx.stroke();
          ctx.lineWidth = 1.2;
          for (let hx = -12; hx <= 12; hx += 6) {
            ctx.beginPath();
            ctx.moveTo(hx, 17);
            ctx.lineTo(hx - 4, 23);
            ctx.stroke();
          }
        } else if (
          node.support === 'rollerX' ||
          node.support === 'rollerY' ||
          node.support === 'inclinedRoller'
        ) {
          // Triangle + rollers + ground line
          ctx.beginPath();
          ctx.moveTo(0, 2);
          ctx.lineTo(-10, 14);
          ctx.lineTo(10, 14);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Two roller wheels
          ctx.beginPath();
          ctx.arc(-5, 17.5, 2.8, 0, Math.PI * 2);
          ctx.arc(5, 17.5, 2.8, 0, Math.PI * 2);
          ctx.stroke();

          // Ground line
          ctx.beginPath();
          ctx.moveTo(-14, 21);
          ctx.lineTo(14, 21);
          ctx.stroke();

          if (node.support === 'inclinedRoller') {
            ctx.fillStyle = '#5eead4';
            ctx.font = '600 9px "JetBrains Mono", ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`α=${node.inclinedAngleDeg ?? 0}°`, 0, 31);
          }
        }

        ctx.restore();
      }

      // 2. Render Elastic Springs (kx, ky, krz)
      const { kx, ky, krz } = node.springs;

      if (ky > 0) {
        // Vertical spring coil below node
        ctx.save();
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 1.7;
        const startY = sc.sy + (node.support !== 'none' ? 22 : 4);
        ctx.beginPath();
        ctx.moveTo(sc.sx, startY);
        ctx.lineTo(sc.sx, startY + 4);
        const coils = 4;
        const coilH = 3.5;
        for (let c = 0; c < coils; c++) {
          const y0 = startY + 4 + c * coilH * 2;
          ctx.lineTo(sc.sx - 6, y0 + coilH * 0.5);
          ctx.lineTo(sc.sx + 6, y0 + coilH * 1.5);
          ctx.lineTo(sc.sx, y0 + coilH * 2);
        }
        const baseY = startY + 4 + coils * coilH * 2 + 3;
        ctx.lineTo(sc.sx, baseY);
        ctx.moveTo(sc.sx - 9, baseY);
        ctx.lineTo(sc.sx + 9, baseY);
        ctx.stroke();
        ctx.restore();
      }

      if (kx > 0) {
        // Horizontal spring coil to the left of node
        ctx.save();
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 1.7;
        const startX = sc.sx - 4;
        ctx.beginPath();
        ctx.moveTo(startX, sc.sy);
        ctx.lineTo(startX - 4, sc.sy);
        const coils = 3;
        const coilW = 3.5;
        for (let c = 0; c < coils; c++) {
          const x0 = startX - 4 - c * coilW * 2;
          ctx.lineTo(x0 - coilW * 0.5, sc.sy - 5);
          ctx.lineTo(x0 - coilW * 1.5, sc.sy + 5);
          ctx.lineTo(x0 - coilW * 2, sc.sy);
        }
        const baseX = startX - 4 - coils * coilW * 2 - 3;
        ctx.lineTo(baseX, sc.sy);
        ctx.moveTo(baseX, sc.sy - 7);
        ctx.lineTo(baseX, sc.sy + 7);
        ctx.stroke();
        ctx.restore();
      }

      if (krz > 0) {
        // Rotational spiral spring symbol around node
        ctx.save();
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        const turns = 1.65;
        const steps = 28;
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const ang = u * turns * Math.PI * 2;
          const r = 4 + u * 9;
          const px = sc.sx + r * Math.cos(ang);
          const py = sc.sy + r * Math.sin(ang);
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.fillStyle = '#d8b4fe';
        ctx.font = '600 9.5px "JetBrains Mono", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`kθ=${(krz / 1000).toFixed(1)}k`, sc.sx, sc.sy - 17);
        ctx.restore();
      }
    }
  }

          renderLoads(
    ctx                          ,
    vp                   ,
    model                 ,
    interaction                        ,
    nodeMap                             ,
    loadHandles                    
  )       {
    // Compute max distributed load and max point load for visual scaling
    let maxDist = 10;
    let maxPoint = 10;

    for (const ld of model.loads) {
      if (ld.kind === 'member_distributed') {
        maxDist = Math.max(maxDist, Math.abs(ld.w1), Math.abs(ld.w2));
      } else if (ld.kind === 'member_point') {
        maxPoint = Math.max(maxPoint, Math.abs(ld.p));
      } else if (ld.kind === 'nodal') {
        maxPoint = Math.max(maxPoint, Math.hypot(ld.fx, ld.fy));
      }
    }

    for (const ld of model.loads) {
      const isSelected = interaction.selectedLoadId === ld.id;
      const strokeCol = isSelected ? '#fde047' : '#fb923c';
      const fillCol = isSelected ? 'rgba(253, 224, 71, 0.22)' : 'rgba(251, 146, 60, 0.16)';

      if (ld.kind === 'member_distributed') {
        const el = model.elements.find(
          (e)                      => e.kind === 'frame2d' && e.id === ld.elementId
        );
        if (!el) continue;
        const ni = nodeMap.get(el.nodeI);
        const nj = nodeMap.get(el.nodeJ);
        if (!ni || !nj) continue;

        const si = worldToScreen(ni, vp);
        const sj = worldToScreen(nj, vp);

        // Determine unit screen vector in the direction the load pushes
        const L = Math.hypot(nj.x - ni.x, nj.y - ni.y);
        if (L < 1e-6) continue;
        const cos = (nj.x - ni.x) / L;
        const sin = (nj.y - ni.y) / L;

        // World force unit direction for a +1 load value:
        let fDirWorldX = 0;
        let fDirWorldY = 0;
        if (ld.direction === 'global_x') {
          fDirWorldX = 1;
          fDirWorldY = 0;
        } else if (ld.direction === 'global_y') {
          fDirWorldX = 0;
          fDirWorldY = 1;
        } else {
          // local_perp (+y local = (-sin, cos))
          fDirWorldX = -sin;
          fDirWorldY = cos;
        }

        // Screen force direction (note screen Y is inverted from world Y)
        const fDirScreenX = fDirWorldX;
        const fDirScreenY = -fDirWorldY;

        const maxEnvPx = 46;
        // Offset tail away from member in opposite direction of force so arrows point ONTO the member
        const h1 = (ld.w1 / maxDist) * maxEnvPx;
        const h2 = (ld.w2 / maxDist) * maxEnvPx;

        const tail1X = si.sx - fDirScreenX * h1;
        const tail1Y = si.sy - fDirScreenY * h1;
        const tail2X = sj.sx - fDirScreenX * h2;
        const tail2Y = sj.sy - fDirScreenY * h2;

        ctx.save();
        ctx.fillStyle = fillCol;
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = isSelected ? 2.2 : 1.5;

        // Shaded trapezoidal load envelope polygon
        ctx.beginPath();
        ctx.moveTo(si.sx, si.sy);
        ctx.lineTo(tail1X, tail1Y);
        ctx.lineTo(tail2X, tail2Y);
        ctx.lineTo(sj.sx, sj.sy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw comb arrows along the member
        const screenSpan = Math.hypot(sj.sx - si.sx, sj.sy - si.sy);
        const numArrows = Math.max(3, Math.min(12, Math.floor(screenSpan / 28)));
        ctx.fillStyle = strokeCol;

        for (let k = 0; k <= numArrows; k++) {
          const u = k / numArrows;
          const bx = si.sx + u * (sj.sx - si.sx);
          const by = si.sy + u * (sj.sy - si.sy);
          const tx = tail1X + u * (tail2X - tail1X);
          const ty = tail1Y + u * (tail2Y - tail1Y);
          const arrowLen = Math.hypot(bx - tx, by - ty);
          if (arrowLen < 4) continue;

          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(bx, by);
          ctx.stroke();

          drawArrowhead(ctx, bx, by, bx - tx, by - ty, Math.min(7, arrowLen * 0.6));
        }

        // Interactive click handle & label at midpoint of envelope top edge
        const handleX = 0.5 * (tail1X + tail2X);
        const handleY = 0.5 * (tail1Y + tail2Y);
        loadHandles.push({ loadId: ld.id, sx: handleX, sy: handleY });

        const labelText =
          Math.abs(ld.w1 - ld.w2) < 0.05
            ? `${Math.abs(ld.w1).toFixed(1)} kN/m`
            : `${Math.abs(ld.w1).toFixed(0)}→${Math.abs(ld.w2).toFixed(0)} kN/m`;

        drawRoundedBadge(
          ctx,
          labelText,
          handleX,
          handleY,
          isSelected ? 'rgba(15, 23, 42, 0.96)' : 'rgba(15, 23, 42, 0.85)',
          strokeCol,
          isSelected ? '#fde047' : '#fdba74',
          '600 10px "JetBrains Mono", ui-monospace, monospace'
        );

        ctx.restore();
      } else if (ld.kind === 'member_point') {
        const el = model.elements.find(
          (e)                      => e.kind === 'frame2d' && e.id === ld.elementId
        );
        if (!el) continue;
        const ni = nodeMap.get(el.nodeI);
        const nj = nodeMap.get(el.nodeJ);
        if (!ni || !nj) continue;

        const L = Math.hypot(nj.x - ni.x, nj.y - ni.y);
        if (L < 1e-6) continue;
        const t = Math.min(1, Math.max(0, ld.a / L));
        const wx = ni.x + t * (nj.x - ni.x);
        const wy = ni.y + t * (nj.y - ni.y);
        const tip = worldToScreen({ x: wx, y: wy }, vp);

        const cos = (nj.x - ni.x) / L;
        const sin = (nj.y - ni.y) / L;

        let fDirWorldX = 0;
        let fDirWorldY = 0;
        if (ld.direction === 'global_x') {
          fDirWorldX = Math.sign(ld.p) || 1;
        } else if (ld.direction === 'global_y') {
          fDirWorldY = Math.sign(ld.p) || -1;
        } else {
          const sgn = Math.sign(ld.p) || -1;
          fDirWorldX = -sin * sgn;
          fDirWorldY = cos * sgn;
        }

        const dirSx = fDirWorldX;
        const dirSy = -fDirWorldY;
        const arrowLen = Math.max(30, Math.min(58, 26 + (Math.abs(ld.p) / maxPoint) * 28));

        const tailX = tip.sx - dirSx * arrowLen;
        const tailY = tip.sy - dirSy * arrowLen;

        ctx.save();
        ctx.strokeStyle = strokeCol;
        ctx.fillStyle = strokeCol;
        ctx.lineWidth = isSelected ? 3 : 2.4;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(tip.sx, tip.sy);
        ctx.stroke();
        drawArrowhead(ctx, tip.sx, tip.sy, dirSx, dirSy, 9);

        loadHandles.push({ loadId: ld.id, sx: tailX, sy: tailY });
        drawRoundedBadge(
          ctx,
          `${Math.abs(ld.p).toFixed(1)} kN`,
          tailX - dirSx * 10,
          tailY - dirSy * 10,
          'rgba(15, 23, 42, 0.9)',
          strokeCol,
          isSelected ? '#fde047' : '#fdba74',
          '600 10.5px "JetBrains Mono", ui-monospace, monospace'
        );
        ctx.restore();
      } else if (ld.kind === 'nodal') {
        const node = nodeMap.get(ld.nodeId);
        if (!node) continue;
        const tip = worldToScreen(node, vp);
        const fMag = Math.hypot(ld.fx, ld.fy);

        if (fMag > 1e-4) {
          const dirSx = ld.fx / fMag;
          const dirSy = -ld.fy / fMag;
          const arrowLen = Math.max(32, Math.min(58, 28 + (fMag / maxPoint) * 28));
          const tailX = tip.sx - dirSx * arrowLen;
          const tailY = tip.sy - dirSy * arrowLen;

          ctx.save();
          ctx.strokeStyle = strokeCol;
          ctx.fillStyle = strokeCol;
          ctx.lineWidth = isSelected ? 3 : 2.4;
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(tip.sx, tip.sy);
          ctx.stroke();
          drawArrowhead(ctx, tip.sx, tip.sy, dirSx, dirSy, 9);

          loadHandles.push({ loadId: ld.id, sx: tailX, sy: tailY });
          drawRoundedBadge(
            ctx,
            `${fMag.toFixed(1)} kN`,
            tailX - dirSx * 11,
            tailY - dirSy * 11,
            'rgba(15, 23, 42, 0.9)',
            strokeCol,
            isSelected ? '#fde047' : '#fdba74',
            '600 10.5px "JetBrains Mono", ui-monospace, monospace'
          );
          ctx.restore();
        }

        if (Math.abs(ld.mz) > 1e-4) {
          ctx.save();
          ctx.strokeStyle = strokeCol;
          ctx.fillStyle = strokeCol;
          ctx.lineWidth = 2.2;
          const r = 18;
          ctx.beginPath();
          ctx.arc(tip.sx, tip.sy, r, -Math.PI * 0.75, Math.PI * 0.45);
          ctx.stroke();
          loadHandles.push({ loadId: ld.id, sx: tip.sx, sy: tip.sy - r - 8 });
          drawRoundedBadge(
            ctx,
            `${ld.mz.toFixed(1)} kNm`,
            tip.sx,
            tip.sy - r - 10,
            'rgba(15, 23, 42, 0.9)',
            strokeCol,
            isSelected ? '#fde047' : '#fdba74'
          );
          ctx.restore();
        }
      }
    }
  }

          renderDeformedShape(
    ctx                          ,
    vp                   ,
    model                 ,
    solverOutput              ,
    layers                    
  )       {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.4;

    // Convert mm deflection * exaggeration scale to world meters (* 1e-3)
    const scaleMPerMm = layers.deflectionScale * 1e-3;

    for (const el of model.elements) {
      if (el.kind !== 'frame2d') continue;
      const elRes = solverOutput.elementResults[el.id];
      if (!elRes || elRes.stations.length === 0) continue;

      ctx.beginPath();
      elRes.stations.forEach((st, idx) => {
        const defWorldX = st.worldX + st.dxGlobalMm * scaleMPerMm;
        const defWorldY = st.worldY + st.dyGlobalMm * scaleMPerMm;
        const sc = worldToScreen({ x: defWorldX, y: defWorldY }, vp);
        if (idx === 0) ctx.moveTo(sc.sx, sc.sy);
        else ctx.lineTo(sc.sx, sc.sy);
      });
      ctx.stroke();

      // Draw displaced joint dots at element ends
      const first = elRes.stations[0];
      const last = elRes.stations[elRes.stations.length - 1];
      for (const st of [first, last]) {
        const sc = worldToScreen(
          {
            x: st.worldX + st.dxGlobalMm * scaleMPerMm,
            y: st.worldY + st.dyGlobalMm * scaleMPerMm,
          },
          vp
        );
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(sc.sx, sc.sy, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

          renderForceDiagram(
    ctx                          ,
    vp                   ,
    model                 ,
    solverOutput              ,
    diagramType                 ,
    layers                    
  )       {
    const globalMax =
      diagramType === 'N'
        ? Math.max(1, solverOutput.globalMaxN)
        : diagramType === 'V'
          ? Math.max(1, solverOutput.globalMaxV)
          : Math.max(1, solverOutput.globalMaxM);

    const maxDiagramPx = 56 * layers.diagramScale;

    for (const el of model.elements) {
      if (el.kind !== 'frame2d') continue;
      const elRes = solverOutput.elementResults[el.id];
      if (!elRes || elRes.stations.length < 2) continue;

      // Local +y normal in world is (-sin, cos), so in screen pixels:
      // screenNormalX = -sin, screenNormalY = -cos
      const nSx = -elRes.sin;
      const nSy = -elRes.cos;

      const getVal = (st                                 )         => {
        if (diagramType === 'N') return st.N;
        if (diagramType === 'V') return st.V;
        // For Moment M:
        // Positive M is sagging (bottom fiber -y in tension, top fiber +y in compression).
        // When momentSide === 'tension', plot positive M toward bottom fiber (-y local => -nSx, -nSy).
        return layers.momentSide === 'tension' ? -st.M : st.M;
      };

      const strokeCol =
        diagramType === 'N' ? '#a855f7' : diagramType === 'V' ? '#10b981' : '#f43f5e';
      const fillCol =
        diagramType === 'N'
          ? 'rgba(168, 85, 247, 0.18)'
          : diagramType === 'V'
            ? 'rgba(16, 185, 129, 0.18)'
            : 'rgba(244, 63, 94, 0.20)';

      ctx.save();
      ctx.fillStyle = fillCol;
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 1.8;

      const firstSt = elRes.stations[0];
      const lastSt = elRes.stations[elRes.stations.length - 1];
      const startBase = worldToScreen({ x: firstSt.worldX, y: firstSt.worldY }, vp);
      const endBase = worldToScreen({ x: lastSt.worldX, y: lastSt.worldY }, vp);

      // Filled diagram polygon
      ctx.beginPath();
      ctx.moveTo(startBase.sx, startBase.sy);

      let peakVal = 0;
      let peakPos = { sx: startBase.sx, sy: startBase.sy };

      for (const st of elRes.stations) {
        const base = worldToScreen({ x: st.worldX, y: st.worldY }, vp);
        const v = getVal(st);
        const rawVal = diagramType === 'N' ? st.N : diagramType === 'V' ? st.V : st.M;
        const offsetPx = (v / globalMax) * maxDiagramPx;
        const px = base.sx + nSx * offsetPx;
        const py = base.sy + nSy * offsetPx;
        ctx.lineTo(px, py);

        if (Math.abs(rawVal) >= Math.abs(peakVal)) {
          peakVal = rawVal;
          peakPos = {
            sx: base.sx + nSx * (offsetPx + (offsetPx >= 0 ? 12 : -12)),
            sy: base.sy + nSy * (offsetPx + (offsetPx >= 0 ? 12 : -12)),
          };
        }
      }

      ctx.lineTo(endBase.sx, endBase.sy);
      ctx.closePath();
      ctx.fill();

      // Diagram outer curve stroke
      ctx.beginPath();
      ctx.moveTo(startBase.sx, startBase.sy);
      for (const st of elRes.stations) {
        const base = worldToScreen({ x: st.worldX, y: st.worldY }, vp);
        const offsetPx = (getVal(st) / globalMax) * maxDiagramPx;
        ctx.lineTo(base.sx + nSx * offsetPx, base.sy + nSy * offsetPx);
      }
      ctx.lineTo(endBase.sx, endBase.sy);
      ctx.stroke();

      // Peak value callout on element if significant
      if (Math.abs(peakVal) > 0.05) {
        const unit = diagramType === 'M' ? 'kNm' : 'kN';
        const prefix =
          diagramType === 'N' ? (peakVal > 0 ? 'T ' : 'C ') : `${diagramType}=`;
        drawRoundedBadge(
          ctx,
          `${prefix}${Math.abs(peakVal).toFixed(1)} ${unit}`,
          peakPos.sx,
          peakPos.sy,
          'rgba(15, 23, 42, 0.88)',
          strokeCol,
          '#f8fafc',
          '600 9.5px "JetBrains Mono", ui-monospace, monospace'
        );
      }

      ctx.restore();
    }
  }

          renderSupportReactions(
    ctx                          ,
    vp                   ,
    model                 ,
    solverOutput              
  )       {
    for (const node of model.nodes) {
      const nr = solverOutput.nodeResults[node.id];
      if (!nr || !nr.hasReaction) continue;
      const sc = worldToScreen(node, vp);

      ctx.save();
      ctx.strokeStyle = '#34d399';
      ctx.fillStyle = '#34d399';
      ctx.lineWidth = 2.2;

      if (Math.abs(nr.reactionFy) > 0.05) {
        const signY = Math.sign(nr.reactionFy);
        const dirSy = -signY; // upward world reaction = negative screen Y
        const tipY = sc.sy + (node.support !== 'none' ? 24 : 8);
        const tailY = tipY - dirSy * 32;

        ctx.beginPath();
        ctx.moveTo(sc.sx, tailY);
        ctx.lineTo(sc.sx, tipY);
        ctx.stroke();
        drawArrowhead(ctx, sc.sx, tipY, 0, dirSy, 8);

        drawRoundedBadge(
          ctx,
          `Ry=${nr.reactionFy.toFixed(1)} kN`,
          sc.sx,
          Math.max(tipY, tailY) + 12,
          'rgba(6, 78, 59, 0.92)',
          '#34d399',
          '#ecfdf5',
          '600 9.5px "JetBrains Mono", ui-monospace, monospace'
        );
      }

      if (Math.abs(nr.reactionFx) > 0.05) {
        const dirSx = Math.sign(nr.reactionFx);
        const tipX = sc.sx - dirSx * 10;
        const tailX = tipX - dirSx * 32;

        ctx.beginPath();
        ctx.moveTo(tailX, sc.sy);
        ctx.lineTo(tipX, sc.sy);
        ctx.stroke();
        drawArrowhead(ctx, tipX, sc.sy, dirSx, 0, 8);

        drawRoundedBadge(
          ctx,
          `Rx=${nr.reactionFx.toFixed(1)} kN`,
          tailX - dirSx * 28,
          sc.sy - 12,
          'rgba(6, 78, 59, 0.92)',
          '#34d399',
          '#ecfdf5',
          '600 9.5px "JetBrains Mono", ui-monospace, monospace'
        );
      }

      if (Math.abs(nr.reactionMz) > 0.05) {
        drawRoundedBadge(
          ctx,
          `Mz=${nr.reactionMz.toFixed(1)} kNm`,
          sc.sx + 44,
          sc.sy + 20,
          'rgba(6, 78, 59, 0.92)',
          '#34d399',
          '#ecfdf5',
          '600 9.5px "JetBrains Mono", ui-monospace, monospace'
        );
      }

      ctx.restore();
    }
  }

          renderNodes(
    ctx                          ,
    vp                   ,
    model                 ,
    interaction                        
  )       {
    for (const node of model.nodes) {
      const sc = worldToScreen(node, vp);
      const isSelected = interaction.selectedNodeId === node.id;

      ctx.save();
      if (isSelected) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
        ctx.beginPath();
        ctx.arc(sc.sx, sc.sy, 11, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = isSelected ? '#38bdf8' : '#f8fafc';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sc.sx, sc.sy, isSelected ? 6 : 4.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Node ID tag
      ctx.fillStyle = isSelected ? '#38bdf8' : 'rgba(226, 232, 240, 0.78)';
      ctx.font = '600 10.5px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(node.id, sc.sx + 7, sc.sy - 5);
      ctx.restore();
    }
  }

          renderInteractiveOverlays(
    ctx                          ,
    vp                   ,
    interaction                        
  )       {
    const { snapTarget, drawStartPoint, hoverProbe, activeTool } = interaction;

    // 1. Draw Member preview line with live Length (m) & Angle (deg) HUD
    if (activeTool === 'draw_member' && drawStartPoint && snapTarget) {
      const sStart = worldToScreen(drawStartPoint, vp);
      const dx = snapTarget.x - drawStartPoint.x;
      const dy = snapTarget.y - drawStartPoint.y;
      const lenM = Math.hypot(dx, dy);
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(sStart.sx, sStart.sy);
      ctx.lineTo(snapTarget.sx, snapTarget.sy);
      ctx.stroke();
      ctx.setLineDash([]);

      const midX = (sStart.sx + snapTarget.sx) * 0.5;
      const midY = (sStart.sy + snapTarget.sy) * 0.5 - 18;
      drawRoundedBadge(
        ctx,
        `L = ${lenM.toFixed(2)} m · ∠ ${angleDeg.toFixed(1)}°`,
        midX,
        midY,
        'rgba(2, 132, 199, 0.95)',
        '#7dd3fc',
        '#ffffff',
        '600 11px "JetBrains Mono", ui-monospace, monospace'
      );
      ctx.restore();
    }

    // 2. Smart Snap cursor indicator
    if (snapTarget && activeTool !== 'select') {
      ctx.save();
      if (snapTarget.kind === 'node') {
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(snapTarget.sx, snapTarget.sy, 10, 0, Math.PI * 2);
        ctx.stroke();
      } else if (snapTarget.kind === 'member_segment') {
        // Diamond T-junction split indicator
        ctx.strokeStyle = '#f59e0b';
        ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(snapTarget.sx, snapTarget.sy - 8);
        ctx.lineTo(snapTarget.sx + 8, snapTarget.sy);
        ctx.lineTo(snapTarget.sx, snapTarget.sy + 8);
        ctx.lineTo(snapTarget.sx - 8, snapTarget.sy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        drawRoundedBadge(
          ctx,
          `T-Split ${snapTarget.splitElementId} (${snapTarget.x.toFixed(1)}, ${snapTarget.y.toFixed(1)} m)`,
          snapTarget.sx,
          snapTarget.sy - 20,
          'rgba(120, 53, 15, 0.92)',
          '#f59e0b',
          '#fef3c7',
          '600 10px "JetBrains Mono", ui-monospace, monospace'
        );
      } else {
        // 0.1m Grid snap crosshair
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(snapTarget.sx - 6, snapTarget.sy);
        ctx.lineTo(snapTarget.sx + 6, snapTarget.sy);
        ctx.moveTo(snapTarget.sx, snapTarget.sy - 6);
        ctx.lineTo(snapTarget.sx, snapTarget.sy + 6);
        ctx.stroke();

        if (vp.coordSystem === 'polar') {
          const pol = cartesianToPolar(snapTarget.x, snapTarget.y, vp.polarOrigin);
          drawRoundedBadge(
            ctx,
            `r=${pol.r.toFixed(2)}m, θ=${pol.thetaDeg.toFixed(1)}°`,
            snapTarget.sx + 58,
            snapTarget.sy + 18,
            'rgba(15, 23, 42, 0.85)',
            '#38bdf8',
            '#bae6fd',
            '500 10px "JetBrains Mono", ui-monospace, monospace'
          );
        }
      }
      ctx.restore();
    }

    // 3. Hover Probe glowing marker on member
    if (hoverProbe) {
      ctx.save();
      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hoverProbe.screenX, hoverProbe.screenY, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}



  __exports.utilizationToColor = utilizationToColor;
  __exports.buildSnapshotLayers = buildSnapshotLayers;
  __exports.CanvasRenderer = CanvasRenderer;
  return __exports;
})();

// === Module: src/presets/benchmarks.ts (__mod_9) ===
__modules.__mod_9 = (function() {
  const __exports = {};
                                                                                                           
const {
  computeCrossSection,
  createMaterialFromPreset,
  restraintsFromSupportPreset,
} = __modules.__mod_6;

function makeNode(
  id        ,
  label        ,
  x        ,
  y        ,
  support                            = 'none',
  springs                                     = {},
  inclinedAngleDeg         
)                 {
  return {
    id,
    label,
    x,
    y,
    z: 0,
    support,
    inclinedAngleDeg,
    restraints: restraintsFromSupportPreset(support),
    springs: {
      kx: springs.kx ?? 0,
      ky: springs.ky ?? 0,
      kz: 0,
      krx: 0,
      kry: 0,
      krz: springs.krz ?? 0,
    },
  };
}

                                  
             
                
                   
                
                         
 

/**
 * 1. Underground Box Culvert:
 * Closed rectangular concrete frame (4.0m wide x 3.0m high) with lateral trapezoidal
 * earth/water pressure on both walls (w1 = 10 kN/m at top to w2 = 45 kN/m at base),
 * uniform roof surcharge (-35 kN/m), and elastic vertical soil springs along the base slab.
 */
function createBoxCulvertPreset()                  {
  const concrete = createMaterialFromPreset('concrete'); // E = 30 GPa, fy = 35 MPa
  const wallSec = computeCrossSection('rectangular', { b: 1000, h: 350 }, { name: 'Wall 1000×350 mm' });
  const roofSec = computeCrossSection('rectangular', { b: 1000, h: 400 }, { name: 'Roof Slab 1000×400 mm' });
  const baseSec = computeCrossSection('rectangular', { b: 1000, h: 450 }, { name: 'Base Slab 1000×450 mm' });

  // Base slab subdivided at x = 0, 1.0, 2.0, 3.0, 4.0 m with vertical elastic soil springs (Winkler subgrade)
  // Lateral soil friction springs kx provided at base nodes for horizontal stability
  const nodes                   = [
    makeNode('N1', 'N1 (Top-Left)', 0.0, 3.0, 'none'),
    makeNode('N2', 'N2 (Top-Right)', 4.0, 3.0, 'none'),
    makeNode('N3', 'N3 (Base-0m)', 0.0, 0.0, 'none', { kx: 15000, ky: 25000 }),
    makeNode('N4', 'N4 (Base-1m)', 1.0, 0.0, 'none', { ky: 40000 }),
    makeNode('N5', 'N5 (Base-2m)', 2.0, 0.0, 'none', { kx: 20000, ky: 40000 }),
    makeNode('N6', 'N6 (Base-3m)', 3.0, 0.0, 'none', { ky: 40000 }),
    makeNode('N7', 'N7 (Base-4m)', 4.0, 0.0, 'none', { kx: 15000, ky: 25000 }),
  ];

  // Note: Left wall M1 goes from Top-Left (N1, x=0 along member) to Base-Left (N3, x=L along member)
  // so w1 = 10 kN/m is at top and w2 = 45 kN/m is at base!
  // Right wall M2 goes from Top-Right (N2, x=0 along member) to Base-Right (N7, x=L along member)
  // so w1 = -10 kN/m (leftward) is at top and w2 = -45 kN/m (leftward) is at base!
  const elements                   = [
    {
      id: 'M1',
      kind: 'frame2d',
      label: 'Left Wall',
      nodeI: 'N1',
      nodeJ: 'N3',
      section: wallSec,
      material: concrete,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M2',
      kind: 'frame2d',
      label: 'Right Wall',
      nodeI: 'N2',
      nodeJ: 'N7',
      section: wallSec,
      material: concrete,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M3',
      kind: 'frame2d',
      label: 'Roof Slab',
      nodeI: 'N1',
      nodeJ: 'N2',
      section: roofSec,
      material: concrete,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M4',
      kind: 'frame2d',
      label: 'Base Slab 1',
      nodeI: 'N3',
      nodeJ: 'N4',
      section: baseSec,
      material: concrete,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M5',
      kind: 'frame2d',
      label: 'Base Slab 2',
      nodeI: 'N4',
      nodeJ: 'N5',
      section: baseSec,
      material: concrete,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M6',
      kind: 'frame2d',
      label: 'Base Slab 3',
      nodeI: 'N5',
      nodeJ: 'N6',
      section: baseSec,
      material: concrete,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M7',
      kind: 'frame2d',
      label: 'Base Slab 4',
      nodeI: 'N6',
      nodeJ: 'N7',
      section: baseSec,
      material: concrete,
      releaseStart: false,
      releaseEnd: false,
    },
  ];

  const loads                   = [
    {
      id: 'L1',
      kind: 'member_distributed',
      elementId: 'M1',
      w1: 10,
      w2: 45,
      direction: 'global_x',
      label: 'Left Earth+Water Pressure',
    },
    {
      id: 'L2',
      kind: 'member_distributed',
      elementId: 'M2',
      w1: -10,
      w2: -45,
      direction: 'global_x',
      label: 'Right Earth+Water Pressure',
    },
    {
      id: 'L3',
      kind: 'member_distributed',
      elementId: 'M3',
      w1: -36,
      w2: -36,
      direction: 'global_y',
      label: 'Roof Soil Overburden',
    },
  ];

  return {
    name: 'Underground Box Culvert',
    description:
      'Closed RC culvert with lateral trapezoidal earth/water pressure (10 to 45 kN/m), roof surcharge, and Winkler soil springs.',
    dimension: '2d',
    nodes,
    elements,
    loads,
  };
}

/**
 * 2. 2-Bay Indeterminate Portal Frame:
 * Steel columns and rafters with a horizontal wind point load and roof UDL.
 */
function createTwoBayPortalPreset()                  {
  const steel = createMaterialFromPreset('steel'); // E = 200 GPa, fy = 355 MPa
  const colSec = computeCrossSection(
    'i_section',
    { h: 360, b: 170, tw: 8.0, tf: 12.7 },
    { name: 'IPE 360 Column' }
  );
  const rafterSec = computeCrossSection(
    'i_section',
    { h: 400, b: 180, tw: 8.6, tf: 13.5 },
    { name: 'IPE 400 Rafter' }
  );

  const nodes                   = [
    makeNode('N1', 'Base Left', 0.0, 0.0, 'fixed'),
    makeNode('N2', 'Base Center', 6.0, 0.0, 'fixed'),
    makeNode('N3', 'Base Right', 12.0, 0.0, 'fixed'),
    makeNode('N4', 'Eave Left', 0.0, 4.5, 'none'),
    makeNode('N5', 'Eave Center', 6.0, 4.5, 'none'),
    makeNode('N6', 'Eave Right', 12.0, 4.5, 'none'),
  ];

  const elements                   = [
    {
      id: 'M1',
      kind: 'frame2d',
      label: 'Left Column',
      nodeI: 'N1',
      nodeJ: 'N4',
      section: colSec,
      material: steel,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M2',
      kind: 'frame2d',
      label: 'Center Column',
      nodeI: 'N2',
      nodeJ: 'N5',
      section: colSec,
      material: steel,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M3',
      kind: 'frame2d',
      label: 'Right Column',
      nodeI: 'N3',
      nodeJ: 'N6',
      section: colSec,
      material: steel,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M4',
      kind: 'frame2d',
      label: 'Bay 1 Rafter',
      nodeI: 'N4',
      nodeJ: 'N5',
      section: rafterSec,
      material: steel,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M5',
      kind: 'frame2d',
      label: 'Bay 2 Rafter',
      nodeI: 'N5',
      nodeJ: 'N6',
      section: rafterSec,
      material: steel,
      releaseStart: false,
      releaseEnd: false,
    },
  ];

  const loads                   = [
    {
      id: 'L1',
      kind: 'member_point',
      elementId: 'M1',
      p: 45,
      a: 3.0,
      direction: 'global_x',
      label: 'Lateral Wind Load',
    },
    {
      id: 'L2',
      kind: 'member_distributed',
      elementId: 'M4',
      w1: -22,
      w2: -22,
      direction: 'global_y',
      label: 'Bay 1 Roof UDL',
    },
    {
      id: 'L3',
      kind: 'member_distributed',
      elementId: 'M5',
      w1: -22,
      w2: -22,
      direction: 'global_y',
      label: 'Bay 2 Roof UDL',
    },
  ];

  return {
    name: '2-Bay Indeterminate Portal Frame',
    description:
      'Two-bay fixed-base steel portal frame with lateral wind point load on the windward column and uniform gravity roof load.',
    dimension: '2d',
    nodes,
    elements,
    loads,
  };
}

/**
 * 3. Continuous 2-Span Beam:
 * With UDL on Span 1, point load on Span 2, and a rotational spring at the center support.
 */
function createContinuousBeamPreset()                  {
  const steel = createMaterialFromPreset('steel');
  const beamSec = computeCrossSection(
    'i_section',
    { h: 320, b: 160, tw: 7.5, tf: 11.5 },
    { name: 'IPE 320 Girder' }
  );

  const nodes                   = [
    makeNode('N1', 'Support A (Pin)', 0.0, 0.0, 'pinned'),
    makeNode('N2', 'Support B (Roller + kθ)', 6.0, 0.0, 'rollerX', { krz: 18000 }),
    makeNode('N3', 'Support C (Roller)', 12.0, 0.0, 'rollerX'),
  ];

  const elements                   = [
    {
      id: 'M1',
      kind: 'frame2d',
      label: 'Span 1 (0–6 m)',
      nodeI: 'N1',
      nodeJ: 'N2',
      section: beamSec,
      material: steel,
      releaseStart: false,
      releaseEnd: false,
    },
    {
      id: 'M2',
      kind: 'frame2d',
      label: 'Span 2 (6–12 m)',
      nodeI: 'N2',
      nodeJ: 'N3',
      section: beamSec,
      material: steel,
      releaseStart: false,
      releaseEnd: false,
    },
  ];

  const loads                   = [
    {
      id: 'L1',
      kind: 'member_distributed',
      elementId: 'M1',
      w1: -28,
      w2: -28,
      direction: 'global_y',
      label: 'Span 1 UDL',
    },
    {
      id: 'L2',
      kind: 'member_point',
      elementId: 'M2',
      p: -75,
      a: 3.0,
      direction: 'global_y',
      label: 'Span 2 Midspan Point Load',
    },
  ];

  return {
    name: 'Continuous 2-Span Beam',
    description:
      'Two-span continuous steel girder with UDL on Span 1, midspan point load on Span 2, and rotational spring restraint kθ at the interior pier.',
    dimension: '2d',
    nodes,
    elements,
    loads,
  };
}

/**
 * 4. Pratt Truss:
 * Pin-ended members (releaseStart = true, releaseEnd = true) demonstrating pure axial behavior.
 */
function createPrattTrussPreset()                  {
  const steel = createMaterialFromPreset('steel');
  const chordSec = computeCrossSection(
    'hollow_rect',
    { b: 160, h: 160, t: 10 },
    { name: 'SHS 160×160×10 Chord' }
  );
  const webSec = computeCrossSection(
    'hollow_rect',
    { b: 120, h: 120, t: 8 },
    { name: 'SHS 120×120×8 Web' }
  );

  // 4-panel Pratt truss: span = 12.0 m (panels at 0, 3, 6, 9, 12 m), height = 3.0 m
  const nodes                   = [
    makeNode('N1', 'Bot-0m (Pin)', 0.0, 0.0, 'pinned'),
    makeNode('N2', 'Bot-3m', 3.0, 0.0, 'none'),
    makeNode('N3', 'Bot-6m', 6.0, 0.0, 'none'),
    makeNode('N4', 'Bot-9m', 9.0, 0.0, 'none'),
    makeNode('N5', 'Bot-12m (Roller)', 12.0, 0.0, 'rollerX'),
    makeNode('N6', 'Top-3m', 3.0, 3.0, 'none'),
    makeNode('N7', 'Top-6m', 6.0, 3.0, 'none'),
    makeNode('N8', 'Top-9m', 9.0, 3.0, 'none'),
  ];

  const makeTrussBar = (
    id        ,
    label        ,
    nodeI        ,
    nodeJ        ,
    isChord         
  )                 => ({
    id,
    kind: 'frame2d',
    label,
    nodeI,
    nodeJ,
    section: isChord ? chordSec : webSec,
    material: steel,
    releaseStart: true,
    releaseEnd: true,
  });

  const elements                   = [
    // Bottom chord
    makeTrussBar('M1', 'Bot Chord 1', 'N1', 'N2', true),
    makeTrussBar('M2', 'Bot Chord 2', 'N2', 'N3', true),
    makeTrussBar('M3', 'Bot Chord 3', 'N3', 'N4', true),
    makeTrussBar('M4', 'Bot Chord 4', 'N4', 'N5', true),
    // Top chord & end inclines
    makeTrussBar('M5', 'Left End Post', 'N1', 'N6', true),
    makeTrussBar('M6', 'Top Chord 1', 'N6', 'N7', true),
    makeTrussBar('M7', 'Top Chord 2', 'N7', 'N8', true),
    makeTrussBar('M8', 'Right End Post', 'N8', 'N5', true),
    // Verticals
    makeTrussBar('M9', 'Vertical Left', 'N2', 'N6', false),
    makeTrussBar('M10', 'Vertical Center', 'N3', 'N7', false),
    makeTrussBar('M11', 'Vertical Right', 'N4', 'N8', false),
    // Pratt diagonals (sloping down toward center -> in tension under gravity load)
    makeTrussBar('M12', 'Diagonal Left', 'N6', 'N3', false),
    makeTrussBar('M13', 'Diagonal Right', 'N8', 'N3', false),
  ];

  const loads                   = [
    {
      id: 'L1',
      kind: 'nodal',
      nodeId: 'N2',
      fx: 0,
      fy: -60,
      mz: 0,
      label: 'Panel Point Load 1',
    },
    {
      id: 'L2',
      kind: 'nodal',
      nodeId: 'N3',
      fx: 0,
      fy: -90,
      mz: 0,
      label: 'Center Joint Load',
    },
    {
      id: 'L3',
      kind: 'nodal',
      nodeId: 'N4',
      fx: 0,
      fy: -60,
      mz: 0,
      label: 'Panel Point Load 3',
    },
  ];

  return {
    name: 'Pratt Truss',
    description:
      'Pin-ended 4-panel steel Pratt bridge truss (releaseStart = true, releaseEnd = true) demonstrating pure axial force distribution.',
    dimension: '2d',
    nodes,
    elements,
    loads,
  };
}

const BENCHMARK_PRESETS                    = [
  {
    id: 'culvert',
    title: 'Underground Box Culvert',
    subtitle: 'Trapezoidal earth/water pressure + Winkler soil springs',
    badge: 'Geotech / RC',
    model: createBoxCulvertPreset(),
  },
  {
    id: 'portal',
    title: '2-Bay Indeterminate Portal Frame',
    subtitle: 'Steel columns & rafters with lateral wind + roof UDL',
    badge: 'Steel Frame',
    model: createTwoBayPortalPreset(),
  },
  {
    id: 'continuous_beam',
    title: 'Continuous 2-Span Beam',
    subtitle: 'Span 1 UDL, Span 2 Point Load + Rotational Spring kθ',
    badge: 'Girder / Spring',
    model: createContinuousBeamPreset(),
  },
  {
    id: 'pratt_truss',
    title: 'Pratt Truss',
    subtitle: 'Pin-ended members (releaseStart & releaseEnd) — Pure Axial',
    badge: 'Truss / Axial',
    model: createPrattTrussPreset(),
  },
];



  __exports.BENCHMARK_PRESETS = BENCHMARK_PRESETS;
  __exports.createBoxCulvertPreset = createBoxCulvertPreset;
  __exports.createTwoBayPortalPreset = createTwoBayPortalPreset;
  __exports.createContinuousBeamPreset = createContinuousBeamPreset;
  __exports.createPrattTrussPreset = createPrattTrussPreset;
  return __exports;
})();

// === Module: src/vendor/lucide-react.tsx (__mod_10) ===
__modules.__mod_10 = (function() {
  const __exports = {};
  const React = __modules.__mod_0.default ?? __modules.__mod_0;

                                  
                
                     
                       
 

function createLucideIcon(paths                                                    ) {
  return function IconComponent({
    size = 16,
    className = '',
    strokeWidth = 2,
  }                 ) {
    return (
      React.createElement("svg", { "width": size, "height": size, "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "strokeWidth": strokeWidth, "strokeLinecap": "round", "strokeLinejoin": "round", "className": className }, paths.map((p, idx) => React.createElement(p.tag, { key: idx, ...p.attrs })))
    );
  };
}

const MousePointer = createLucideIcon([
  { tag: 'path', attrs: { d: 'm3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z' } },
  { tag: 'path', attrs: { d: 'm13 13 6 6' } },
]);

const PenTool = createLucideIcon([
  { tag: 'path', attrs: { d: 'm12 19 7-7 3 3-7 7-3-3z' } },
  { tag: 'path', attrs: { d: 'm18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z' } },
  { tag: 'path', attrs: { d: 'm2 2 7.586 7.586' } },
  { tag: 'circle', attrs: { cx: '11', cy: '11', r: '2' } },
]);

const Anchor = createLucideIcon([
  { tag: 'circle', attrs: { cx: '12', cy: '5', r: '3' } },
  { tag: 'line', attrs: { x1: '12', y1: '22', x2: '12', y2: '8' } },
  { tag: 'path', attrs: { d: 'M5 12H2a10 10 0 0 0 20 0h-3' } },
]);

const ArrowDownToDot = createLucideIcon([
  { tag: 'path', attrs: { d: 'M12 2v14' } },
  { tag: 'path', attrs: { d: 'm19 9-7 7-7-7' } },
  { tag: 'circle', attrs: { cx: '12', cy: '21', r: '1' } },
]);

const AlignVerticalSpaceAround = createLucideIcon([
  { tag: 'rect', attrs: { width: '10', height: '6', x: '7', y: '9', rx: '2' } },
  { tag: 'path', attrs: { d: 'M22 20H2' } },
  { tag: 'path', attrs: { d: 'M22 4H2' } },
]);

const Trash2 = createLucideIcon([
  { tag: 'path', attrs: { d: 'M3 6h18' } },
  { tag: 'path', attrs: { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' } },
  { tag: 'path', attrs: { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' } },
  { tag: 'line', attrs: { x1: '10', y1: '11', x2: '10', y2: '17' } },
  { tag: 'line', attrs: { x1: '14', y1: '11', x2: '14', y2: '17' } },
]);

const Undo2 = createLucideIcon([
  { tag: 'path', attrs: { d: 'M9 14 4 9l5-5' } },
  { tag: 'path', attrs: { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11' } },
]);

const Redo2 = createLucideIcon([
  { tag: 'path', attrs: { d: 'm15 14 5-5-5-5' } },
  { tag: 'path', attrs: { d: 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13' } },
]);

const Download = createLucideIcon([
  { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' } },
  { tag: 'polyline', attrs: { points: '7 10 12 15 17 10' } },
  { tag: 'line', attrs: { x1: '12', y1: '15', x2: '12', y2: '3' } },
]);

const Upload = createLucideIcon([
  { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' } },
  { tag: 'polyline', attrs: { points: '17 8 12 3 7 8' } },
  { tag: 'line', attrs: { x1: '12', y1: '3', x2: '12', y2: '15' } },
]);

const Sliders = createLucideIcon([
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

const Activity = createLucideIcon([
  { tag: 'polyline', attrs: { points: '22 12 18 12 15 21 9 3 6 12 2 12' } },
]);

const Layers = createLucideIcon([
  { tag: 'polygon', attrs: { points: '12 2 2 7 12 12 22 7 12 2' } },
  { tag: 'polyline', attrs: { points: '2 17 12 22 22 17' } },
  { tag: 'polyline', attrs: { points: '2 12 12 17 22 12' } },
]);

const Maximize2 = createLucideIcon([
  { tag: 'polyline', attrs: { points: '15 3 21 3 21 9' } },
  { tag: 'polyline', attrs: { points: '9 21 3 21 3 15' } },
  { tag: 'line', attrs: { x1: '21', y1: '3', x2: '14', y2: '10' } },
  { tag: 'line', attrs: { x1: '3', y1: '21', x2: '10', y2: '14' } },
]);

const ZoomIn = createLucideIcon([
  { tag: 'circle', attrs: { cx: '11', cy: '11', r: '8' } },
  { tag: 'line', attrs: { x1: '21', y1: '21', x2: '16.65', y2: '16.65' } },
  { tag: 'line', attrs: { x1: '11', y1: '8', x2: '11', y2: '14' } },
  { tag: 'line', attrs: { x1: '8', y1: '11', x2: '14', y2: '11' } },
]);

const ZoomOut = createLucideIcon([
  { tag: 'circle', attrs: { cx: '11', cy: '11', r: '8' } },
  { tag: 'line', attrs: { x1: '21', y1: '21', x2: '16.65', y2: '16.65' } },
  { tag: 'line', attrs: { x1: '8', y1: '11', x2: '14', y2: '11' } },
]);

const Compass = createLucideIcon([
  { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
  { tag: 'polygon', attrs: { points: '16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76' } },
]);

const AlertTriangle = createLucideIcon([
  {
    tag: 'path',
    attrs: {
      d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z',
    },
  },
  { tag: 'line', attrs: { x1: '12', y1: '9', x2: '12', y2: '13' } },
  { tag: 'line', attrs: { x1: '12', y1: '17', x2: '12.01', y2: '17' } },
]);

const CheckCircle2 = createLucideIcon([
  { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
  { tag: 'path', attrs: { d: 'm9 12 2 2 4-4' } },
]);

const X = createLucideIcon([
  { tag: 'line', attrs: { x1: '18', y1: '6', x2: '6', y2: '18' } },
  { tag: 'line', attrs: { x1: '6', y1: '6', x2: '18', y2: '18' } },
]);

const Plus = createLucideIcon([
  { tag: 'line', attrs: { x1: '12', y1: '5', x2: '12', y2: '19' } },
  { tag: 'line', attrs: { x1: '5', y1: '12', x2: '19', y2: '12' } },
]);

const Pin = createLucideIcon([
  { tag: 'line', attrs: { x1: '12', y1: '17', x2: '12', y2: '22' } },
  {
    tag: 'path',
    attrs: {
      d: 'M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z',
    },
  },
]);

const RotateCcw = createLucideIcon([
  { tag: 'path', attrs: { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' } },
  { tag: 'path', attrs: { d: 'M3 3v5h5' } },
]);

const Grid = createLucideIcon([
  { tag: 'rect', attrs: { width: '18', height: '18', x: '3', y: '3', rx: '2' } },
  { tag: 'path', attrs: { d: 'M3 9h18' } },
  { tag: 'path', attrs: { d: 'M3 15h18' } },
  { tag: 'path', attrs: { d: 'M9 3v18' } },
  { tag: 'path', attrs: { d: 'M15 3v18' } },
]);

const Crosshair = createLucideIcon([
  { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
  { tag: 'line', attrs: { x1: '22', y1: '12', x2: '18', y2: '12' } },
  { tag: 'line', attrs: { x1: '6', y1: '12', x2: '2', y2: '12' } },
  { tag: 'line', attrs: { x1: '12', y1: '6', x2: '12', y2: '2' } },
  { tag: 'line', attrs: { x1: '12', y1: '22', x2: '12', y2: '18' } },
]);

const Boxes = createLucideIcon([
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

const Gauge = createLucideIcon([
  { tag: 'path', attrs: { d: 'm12 14 4-4' } },
  { tag: 'path', attrs: { d: 'M3.34 19a10 10 0 1 1 17.32 0' } },
]);



  __exports.MousePointer = MousePointer;
  __exports.PenTool = PenTool;
  __exports.Anchor = Anchor;
  __exports.ArrowDownToDot = ArrowDownToDot;
  __exports.AlignVerticalSpaceAround = AlignVerticalSpaceAround;
  __exports.Trash2 = Trash2;
  __exports.Undo2 = Undo2;
  __exports.Redo2 = Redo2;
  __exports.Download = Download;
  __exports.Upload = Upload;
  __exports.Sliders = Sliders;
  __exports.Activity = Activity;
  __exports.Layers = Layers;
  __exports.Maximize2 = Maximize2;
  __exports.ZoomIn = ZoomIn;
  __exports.ZoomOut = ZoomOut;
  __exports.Compass = Compass;
  __exports.AlertTriangle = AlertTriangle;
  __exports.CheckCircle2 = CheckCircle2;
  __exports.X = X;
  __exports.Plus = Plus;
  __exports.Pin = Pin;
  __exports.RotateCcw = RotateCcw;
  __exports.Grid = Grid;
  __exports.Crosshair = Crosshair;
  __exports.Boxes = Boxes;
  __exports.Gauge = Gauge;
  return __exports;
})();

// === Module: src/components/Toolbar.tsx (__mod_11) ===
__modules.__mod_11 = (function() {
  const __exports = {};
  const React = __modules.__mod_0.default ?? __modules.__mod_0;
                                                                       
                                                                       
const { BENCHMARK_PRESETS } = __modules.__mod_9;
const {
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
  Maximize2,
  ZoomIn,
  ZoomOut,
  Compass,
  AlertTriangle,
  CheckCircle2,
  Boxes,
} = __modules.__mod_10;

                            
            
                 
                    
                    
                     
             

                               
                         
                                             
                             
                                               
                   
                   
                     
                     
                           
                                           
                       
                        
                        
                                       
                                  
                             
                         
 

function Toolbar({
  activePresetId,
  onSelectPreset,
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
}              ) {
  const fileInputRef = React.useRef                         (null);

  const tools         
                       
                  
                     
              
     = [
    { id: 'select', label: 'Select / Inspect', shortcut: 'V', icon: MousePointer },
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

  const handleFileChange = (e     ) => {
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
    React.createElement("header", { "id": "app-top-toolbar", "className": "flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900/95 border-b border-slate-800 text-slate-100 select-none z-20" }, React.createElement("div", { "className": "flex items-center gap-3" }, React.createElement("div", { "className": "flex items-center gap-2 pr-2 border-r border-slate-800" }, React.createElement("div", { "className": "w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-400/40 flex items-center justify-center text-sky-400" }, React.createElement(Boxes, { "size": 18 })), React.createElement("div", null, React.createElement("h1", { "className": "text-xs font-bold tracking-wider uppercase text-slate-100 leading-tight" }, "FEM Studio 2D"), React.createElement("p", { "className": "text-[10px] font-mono text-slate-400 leading-tight" }, "6-DOF Euler-Bernoulli · SI"))), React.createElement("div", { "className": "flex items-center gap-1.5" }, React.createElement("label", { "htmlFor": "preset-benchmark-select", "className": "text-[11px] font-medium text-slate-400 hidden sm:inline" }, "Benchmark:"), React.createElement("select", { "id": "preset-benchmark-select", "value": activePresetId, "onChange": (e     ) => onSelectPreset(e.target.value), "className": "bg-slate-800/90 hover:bg-slate-800 text-slate-100 text-xs font-medium rounded-md px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-sky-400 transition-colors cursor-pointer" }, BENCHMARK_PRESETS.map((p) => (
              React.createElement("option", { "key": p.id, "value": p.id }, p.title, " (", p.badge, ")")
            ))))), React.createElement("div", { "className": "flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800" }, tools.map((t) => {
          const IconComp = t.icon;
          const active = activeTool === t.id;
          const isDelete = t.id === 'delete';
          return (
            React.createElement("button", { "key": t.id, "id": `tool-btn-${t.id}`, "type": "button", "onClick": () => onSelectTool(t.id), "title": `${t.label} (${t.shortcut})`, "className": `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                active
                  ? isDelete
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-sm'
                    : 'bg-sky-500/20 text-sky-300 border border-sky-400/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-transparent'
              }` }, React.createElement(IconComp, { "size": 14 }), React.createElement("span", { "className": "hidden md:inline" }, t.label), React.createElement("span", { "className": "text-[10px] font-mono opacity-60 hidden lg:inline" }, "[", t.shortcut, "]"))
          );
        })), React.createElement("div", { "className": "flex items-center gap-2" }, solverOutput.stable ? (
          React.createElement("div", { "id": "solver-status-badge", "className": "flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-mono", "title": solverOutput.statusMessage }, React.createElement(CheckCircle2, { "size": 13 }), React.createElement("span", { "className": "font-semibold" }, "Stable"))
        ) : (
          React.createElement("div", { "id": "solver-status-badge", "className": "flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/25 border border-rose-500 text-rose-200 text-xs font-mono animate-pulse", "title": solverOutput.instabilityReason || 'Mechanism detected' }, React.createElement(AlertTriangle, { "size": 14, "className": "text-rose-400" }), React.createElement("span", { "className": "font-bold tracking-wide uppercase" }, "Unstable Structure"))
        ), React.createElement("div", { "className": "flex items-center bg-slate-800/70 rounded-md border border-slate-700/80 p-0.5" }, React.createElement("button", { "id": "btn-undo", "type": "button", "disabled": !canUndo, "onClick": onUndo, "title": "Undo (Ctrl+Z)", "className": `p-1.5 rounded transition-colors ${
              canUndo
                ? 'text-slate-200 hover:bg-slate-700 cursor-pointer'
                : 'text-slate-600 cursor-not-allowed'
            }` }, React.createElement(Undo2, { "size": 14 })), React.createElement("button", { "id": "btn-redo", "type": "button", "disabled": !canRedo, "onClick": onRedo, "title": "Redo (Ctrl+Y)", "className": `p-1.5 rounded transition-colors ${
              canRedo
                ? 'text-slate-200 hover:bg-slate-700 cursor-pointer'
                : 'text-slate-600 cursor-not-allowed'
            }` }, React.createElement(Redo2, { "size": 14 }))), React.createElement("div", { "className": "flex items-center bg-slate-800/70 rounded-md border border-slate-700/80 p-0.5" }, React.createElement("button", { "id": "btn-zoom-in", "type": "button", "onClick": onZoomIn, "title": "Zoom In", "className": "p-1.5 rounded text-slate-200 hover:bg-slate-700 cursor-pointer" }, React.createElement(ZoomIn, { "size": 14 })), React.createElement("button", { "id": "btn-zoom-out", "type": "button", "onClick": onZoomOut, "title": "Zoom Out", "className": "p-1.5 rounded text-slate-200 hover:bg-slate-700 cursor-pointer" }, React.createElement(ZoomOut, { "size": 14 })), React.createElement("button", { "id": "btn-fit-view", "type": "button", "onClick": onFitView, "title": "Fit Structure to Viewport", "className": "p-1.5 rounded text-slate-200 hover:bg-slate-700 cursor-pointer" }, React.createElement(Maximize2, { "size": 14 })), React.createElement("button", { "id": "btn-coord-mode", "type": "button", "onClick": onToggleCoordSystem, "title": "Toggle Cartesian (x,y) vs Polar (r,θ) Coordinate Overlay", "className": `flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono cursor-pointer transition-colors ${
              coordSystem === 'polar'
                ? 'bg-sky-500/25 text-sky-300'
                : 'text-slate-300 hover:bg-slate-700'
            }` }, React.createElement(Compass, { "size": 13 }), React.createElement("span", null, coordSystem === 'polar' ? '(r,θ)' : '(x,y)'))), React.createElement("div", { "className": "flex items-center bg-slate-800/70 rounded-md border border-slate-700/80 p-0.5" }, React.createElement("button", { "id": "btn-export-json", "type": "button", "onClick": onExportJson, "title": "Export Model as JSON", "className": "flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-200 hover:bg-slate-700 cursor-pointer" }, React.createElement(Download, { "size": 13 }), React.createElement("span", { "className": "hidden xl:inline" }, "Export")), React.createElement("button", { "id": "btn-import-json", "type": "button", "onClick": () => fileInputRef.current?.click(), "title": "Import Model from JSON", "className": "flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-200 hover:bg-slate-700 cursor-pointer" }, React.createElement(Upload, { "size": 13 }), React.createElement("span", { "className": "hidden xl:inline" }, "Import")), React.createElement("input", { "ref": fileInputRef, "type": "file", "accept": ".json,application/json", "onChange": handleFileChange, "className": "hidden" }))))
  );
}



  __exports.Toolbar = Toolbar;
  return __exports;
})();

// === Module: src/components/LayerTogglesBar.tsx (__mod_12) ===
__modules.__mod_12 = (function() {
  const __exports = {};
  const React = __modules.__mod_0.default ?? __modules.__mod_0;
                                                                        
                                                           
const { Layers, Activity, Crosshair } = __modules.__mod_10;

                                       
                             
                                                               
                                    
 

function LayerTogglesBar({
  layers,
  onUpdateLayers,
  hoverProbe,
}                      ) {
  const toggleButtons         
                                  
                  
                  
                        
     = [
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
    React.createElement(React.Fragment, null, React.createElement("div", { "id": "result-overlay-toggles", "className": "absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-xl select-none max-w-[calc(100%-24px)]" }, React.createElement("div", { "className": "flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 pr-1.5 border-r border-slate-700/80" }, React.createElement(Layers, { "size": 13, "className": "text-sky-400" }), React.createElement("span", { "className": "hidden sm:inline" }, "Overlays")), toggleButtons.map((btn) => {
          const isOn = Boolean(layers[btn.key]);
          return (
            React.createElement("button", { "key": btn.key, "id": `layer-toggle-${btn.key}`, "type": "button", "onClick": () => onUpdateLayers({ [btn.key]: !isOn }), "className": `flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border transition-all cursor-pointer ${
                isOn
                  ? btn.activeClass
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200 hover:bg-slate-800'
              }` }, React.createElement("span", { "className": "font-mono text-[10px] font-bold px-1 py-0.2 rounded bg-slate-950/60" }, btn.badge), React.createElement("span", null, btn.label))
          );
        }), React.createElement("div", { "className": "flex items-center gap-1 pl-1.5 border-l border-slate-700/80" }, React.createElement("span", { "className": "text-[10px] text-slate-400 font-medium hidden md:inline" }, "M Side:"), React.createElement("button", { "id": "moment-convention-toggle", "type": "button", "onClick": () =>
              onUpdateLayers({
                momentSide: layers.momentSide === 'tension' ? 'compression' : 'tension',
              })
            , "title": "Toggle Bending Moment Diagram Plotting Side: Tension Face (Default) vs Compression Face", "className": "px-2 py-1 rounded text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/40 cursor-pointer transition-colors" }, layers.momentSide === 'tension' ? 'Tension Face' : 'Compression Face'))), hoverProbe ? (
        React.createElement("div", { "id": "interactive-hover-probe", "style": {
            left: `${Math.min(window.innerWidth - 340, Math.max(12, hoverProbe.screenX + 18))}px`,
            top: `${Math.max(64, hoverProbe.screenY - 96)}px`,
          }, "className": "fixed z-30 pointer-events-none bg-slate-950/95 backdrop-blur-md border border-sky-400/60 rounded-lg px-3 py-2.5 shadow-2xl text-xs font-mono text-slate-100 w-64" }, React.createElement("div", { "className": "flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5" }, React.createElement("span", { "className": "flex items-center gap-1.5 font-sans font-bold text-sky-300 text-xs" }, React.createElement(Crosshair, { "size": 13 }), hoverProbe.element.id, " · ", hoverProbe.element.label || 'Member'), React.createElement("span", { "className": "text-[11px] text-slate-400" }, "x = ", hoverProbe.station.x.toFixed(2), " m")), React.createElement("div", { "className": "grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]" }, React.createElement("div", { "className": "flex justify-between" }, React.createElement("span", { "className": "text-purple-300" }, "N(x):"), React.createElement("span", null, hoverProbe.station.N.toFixed(2), " kN")), React.createElement("div", { "className": "flex justify-between" }, React.createElement("span", { "className": "text-emerald-300" }, "V(x):"), React.createElement("span", null, hoverProbe.station.V.toFixed(2), " kN")), React.createElement("div", { "className": "flex justify-between" }, React.createElement("span", { "className": "text-rose-300" }, "M(x):"), React.createElement("span", null, hoverProbe.station.M.toFixed(2), " kNm")), React.createElement("div", { "className": "flex justify-between" }, React.createElement("span", { "className": "text-sky-300" }, "|δ(x)|:"), React.createElement("span", null, hoverProbe.station.deflectionMm.toFixed(2), " mm")), React.createElement("div", { "className": "flex justify-between col-span-2 pt-1 border-t border-slate-800/90" }, React.createElement("span", { "className": "text-amber-300" }, "σ_max(x):"), React.createElement("span", null, hoverProbe.station.sigmaMaxMpa.toFixed(2), " MPa (", (hoverProbe.station.utilization * 100).toFixed(1), "% fy)"))))
      ) : null)
  );
}



  __exports.LayerTogglesBar = LayerTogglesBar;
  return __exports;
})();

// === Module: src/components/Popups.tsx (__mod_13) ===
__modules.__mod_13 = (function() {
  const __exports = {};
  const React = __modules.__mod_0.default ?? __modules.__mod_0;
             
                  
                 
                 
                 
                    
                     
                
                          
                           
const {
  computeCrossSection,
  createMaterialFromPreset,
  restraintsFromSupportPreset,
} = __modules.__mod_6;
const { cartesianToPolar, polarToCartesian } = __modules.__mod_5;
const { X, Pin, Trash2, Plus } = __modules.__mod_10;

/**
 * Mini SVG Cross-Section Preview (renders Rectangular, Circular, Hollow Rect Tube, I-Section, or Custom)
 */
function CrossSectionPreviewSvg({ element }                             ) {
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
    React.createElement("div", { "className": "flex flex-col items-center justify-center bg-slate-950/90 border border-slate-800 rounded-lg p-2 w-24 h-24 shrink-0" }, React.createElement("svg", { "width": "72", "height": "72", "viewBox": "-38 -38 76 76", "className": "overflow-visible" }, React.createElement("line", { "x1": "-34", "y1": "0", "x2": "34", "y2": "0", "stroke": "rgba(56, 189, 248, 0.35)", "strokeWidth": "1", "strokeDasharray": "3 2" }), shape === 'rectangular' || shape === 'custom' ? (
          React.createElement("rect", { "x": -wScaled / 2, "y": -hScaled / 2, "width": wScaled, "height": hScaled, "fill": "rgba(56, 189, 248, 0.22)", "stroke": "#38bdf8", "strokeWidth": "1.6" })
        ) : null, shape === 'circular' ? (
          React.createElement("circle", { "cx": "0", "cy": "0", "r": rScaled, "fill": "rgba(56, 189, 248, 0.22)", "stroke": "#38bdf8", "strokeWidth": "1.6" })
        ) : null, shape === 'hollow_rect' ? (
          React.createElement("g", null, React.createElement("rect", { "x": -wScaled / 2, "y": -hScaled / 2, "width": wScaled, "height": hScaled, "fill": "rgba(56, 189, 248, 0.22)", "stroke": "#38bdf8", "strokeWidth": "1.6" }), React.createElement("rect", { "x": -(wScaled - 2 * Math.max(3, t * scale)) / 2, "y": -(hScaled - 2 * Math.max(3, t * scale)) / 2, "width": Math.max(4, wScaled - 2 * Math.max(3, t * scale)), "height": Math.max(4, hScaled - 2 * Math.max(3, t * scale)), "fill": "#020617", "stroke": "#38bdf8", "strokeWidth": "1.2" }))
        ) : null, shape === 'i_section' ? (
          React.createElement("path", { "d": (() => {
              const hw = wScaled / 2;
              const hh = hScaled / 2;
              const tfS = Math.max(3.5, tf * scale);
              const twS = Math.max(2.5, tw * scale);
              const htw = twS / 2;
              return `M ${-hw} ${-hh} H ${hw} V ${-hh + tfS} H ${htw} V ${hh - tfS} H ${hw} V ${hh} H ${-hw} V ${hh - tfS} H ${-htw} V ${-hh + tfS} H ${-hw} Z`;
            })(), "fill": "rgba(56, 189, 248, 0.25)", "stroke": "#38bdf8", "strokeWidth": "1.5" })
        ) : null))
  );
}

                                       
                         
                                
                                   
                                
                                                                                                     
                      
                             
                   
         
                      
                  
                        
                         
                         
                    
            
                                                                                       
                                                
 

function ContextualPopup({
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
}                      ) {
  if (selectedElementId) {
    const el = model.elements.find(
      (e)                      => e.kind === 'frame2d' && e.id === selectedElementId
    );
    if (!el) return null;
    const nodeI = model.nodes.find((n) => n.id === el.nodeI);
    const nodeJ = model.nodes.find((n) => n.id === el.nodeJ);
    if (!nodeI || !nodeJ) return null;

    const dx = nodeJ.x - nodeI.x;
    const dy = nodeJ.y - nodeI.y;
    const lengthM = Math.hypot(dx, dy);

    const handleLengthChange = (newLenRaw        ) => {
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

    const handleNodeCoordChange = (which           , axis           , valRaw        ) => {
      const val = Number(valRaw);
      if (!Number.isFinite(val)) return;
      const targetId = which === 'I' ? nodeI.id : nodeJ.id;
      onUpdateModel((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === targetId ? { ...n, [axis]: val } : n)),
      }));
    };

    const handleShapeChange = (shape                   ) => {
      const nextSec = computeCrossSection(shape, el.section.dimensions);
      onUpdateModel((prev) => ({
        ...prev,
        elements: prev.elements.map((item) =>
          item.id === el.id && item.kind === 'frame2d' ? { ...item, section: nextSec } : item
        ),
      }));
    };

    const handleDimChange = (dimKey        , valRaw        ) => {
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

    const handleCustomSectionPropChange = (propKey                 , valRaw        ) => {
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

    const handleMaterialPresetChange = (preset                    ) => {
      const nextMat = createMaterialFromPreset(preset, el.material.E, el.material.fy);
      onUpdateModel((prev) => ({
        ...prev,
        elements: prev.elements.map((item) =>
          item.id === el.id && item.kind === 'frame2d' ? { ...item, material: nextMat } : item
        ),
      }));
    };

    const handleMaterialPropChange = (prop            , valRaw        ) => {
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

    const toggleHinge = (end                               ) => {
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
      React.createElement("div", { "id": "contextual-member-popup", "className": "absolute bottom-4 left-4 z-20 w-[410px] max-w-[calc(100vw-32px)] bg-slate-900/95 backdrop-blur-md border border-sky-500/40 rounded-xl shadow-2xl text-slate-100 p-3.5 select-none" }, React.createElement("div", { "className": "flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800" }, React.createElement("div", null, React.createElement("span", { "className": "text-[10px] font-mono uppercase tracking-wider text-sky-400 block" }, "1D Frame Element Inspector"), React.createElement("h3", { "className": "text-sm font-bold text-slate-100" }, el.id, " · ", el.label || 'Structural Member', " (", nodeI.id, " → ", nodeJ.id, ")")), React.createElement("div", { "className": "flex items-center gap-1" }, React.createElement("button", { "type": "button", "onClick": onDeleteEntity, "title": "Delete Member", "className": "p-1.5 rounded-md text-rose-400 hover:bg-rose-500/20 cursor-pointer" }, React.createElement(Trash2, { "size": 14 })), React.createElement("button", { "type": "button", "onClick": onClose, "title": "Close Inspector", "className": "p-1.5 rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer" }, React.createElement(X, { "size": 15 })))), React.createElement("div", { "className": "grid grid-cols-5 gap-2 mb-3 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 text-xs" }, React.createElement("div", { "className": "col-span-1" }, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "Length (m)"), React.createElement("input", { "type": "number", "step": "0.1", "min": "0.1", "value": Number(lengthM.toFixed(3)), "onChange": (e     ) => handleLengthChange( parseFloat(e.target.value) ), "className": "w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs text-sky-300" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, nodeI.id, " X (m)"), React.createElement("input", { "type": "number", "step": "0.1", "value": nodeI.x, "onChange": (e     ) => handleNodeCoordChange('I', 'x', parseFloat(e.target.value)), "className": "w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, nodeI.id, " Y (m)"), React.createElement("input", { "type": "number", "step": "0.1", "value": nodeI.y, "onChange": (e     ) => handleNodeCoordChange('I', 'y', parseFloat(e.target.value)), "className": "w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, nodeJ.id, " X (m)"), React.createElement("input", { "type": "number", "step": "0.1", "value": nodeJ.x, "onChange": (e     ) => handleNodeCoordChange('J', 'x', parseFloat(e.target.value)), "className": "w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, nodeJ.id, " Y (m)"), React.createElement("input", { "type": "number", "step": "0.1", "value": nodeJ.y, "onChange": (e     ) => handleNodeCoordChange('J', 'y', parseFloat(e.target.value)), "className": "w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" }))), React.createElement("div", { "className": "flex gap-3 mb-3" }, React.createElement(CrossSectionPreviewSvg, { "element": el }), React.createElement("div", { "className": "flex-1 space-y-2" }, React.createElement("div", { "className": "flex items-center justify-between gap-2" }, React.createElement("label", { "className": "text-[11px] font-medium text-slate-300" }, "Cross-Section:"), React.createElement("select", { "value": el.section.shape, "onChange": (e     ) => handleShapeChange(e.target.value                     ), "className": "bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100" }, React.createElement("option", { "value": "rectangular" }, "Rectangular (b × h)"), React.createElement("option", { "value": "circular" }, "Circular (Ø d)"), React.createElement("option", { "value": "hollow_rect" }, "Hollow Tube (b × h × t)"), React.createElement("option", { "value": "i_section" }, "I-Section (h × b × tw × tf)"), React.createElement("option", { "value": "custom" }, "Custom (A, I, S)"))), el.section.shape === 'rectangular' ? (
              React.createElement("div", { "className": "grid grid-cols-2 gap-2" }, React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block" }, "Width b (mm)"), React.createElement("input", { "type": "number", "step": "10", "value": dims.b ?? 300, "onChange": (e     ) => handleDimChange('b', parseFloat(e.target.value)), "className": "w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block" }, "Depth h (mm)"), React.createElement("input", { "type": "number", "step": "10", "value": dims.h ?? 500, "onChange": (e     ) => handleDimChange('h', parseFloat(e.target.value)), "className": "w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs" })))
            ) : null, el.section.shape === 'circular' ? (
              React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block" }, "Diameter d (mm)"), React.createElement("input", { "type": "number", "step": "10", "value": dims.d ?? 300, "onChange": (e     ) => handleDimChange('d', parseFloat(e.target.value)), "className": "w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs" }))
            ) : null, el.section.shape === 'hollow_rect' ? (
              React.createElement("div", { "className": "grid grid-cols-3 gap-1.5" }, React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block" }, "b (mm)"), React.createElement("input", { "type": "number", "step": "10", "value": dims.b ?? 200, "onChange": (e     ) => handleDimChange('b', parseFloat(e.target.value)), "className": "w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block" }, "h (mm)"), React.createElement("input", { "type": "number", "step": "10", "value": dims.h ?? 300, "onChange": (e     ) => handleDimChange('h', parseFloat(e.target.value)), "className": "w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block" }, "Wall t (mm)"), React.createElement("input", { "type": "number", "step": "1", "value": dims.t ?? 12, "onChange": (e     ) => handleDimChange('t', parseFloat(e.target.value)), "className": "w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })))
            ) : null, el.section.shape === 'i_section' ? (
              React.createElement("div", { "className": "grid grid-cols-4 gap-1.5" }, React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block" }, "h (mm)"), React.createElement("input", { "type": "number", "step": "10", "value": dims.h ?? 360, "onChange": (e     ) => handleDimChange('h', parseFloat(e.target.value)), "className": "w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block" }, "b (mm)"), React.createElement("input", { "type": "number", "step": "10", "value": dims.b ?? 170, "onChange": (e     ) => handleDimChange('b', parseFloat(e.target.value)), "className": "w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block" }, "tw (mm)"), React.createElement("input", { "type": "number", "step": "0.5", "value": dims.tw ?? 8, "onChange": (e     ) => handleDimChange('tw', parseFloat(e.target.value)), "className": "w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block" }, "tf (mm)"), React.createElement("input", { "type": "number", "step": "0.5", "value": dims.tf ?? 12.7, "onChange": (e     ) => handleDimChange('tf', parseFloat(e.target.value)), "className": "w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })))
            ) : null, el.section.shape === 'custom' ? (
              React.createElement("div", { "className": "grid grid-cols-3 gap-1.5" }, React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block" }, "A (mm²)"), React.createElement("input", { "type": "number", "step": "100", "value": el.section.A, "onChange": (e     ) =>
                      handleCustomSectionPropChange('A', parseFloat(e.target.value))
                    , "className": "w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block" }, "I (mm⁴)"), React.createElement("input", { "type": "number", "step": "1000000", "value": el.section.I, "onChange": (e     ) =>
                      handleCustomSectionPropChange('I', parseFloat(e.target.value))
                    , "className": "w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block" }, "S (mm³)"), React.createElement("input", { "type": "number", "step": "10000", "value": el.section.S, "onChange": (e     ) =>
                      handleCustomSectionPropChange('S', parseFloat(e.target.value))
                    , "className": "w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })))
            ) : null, React.createElement("div", { "className": "flex items-center justify-between text-[10px] font-mono text-slate-400 bg-slate-950/70 px-2 py-1 rounded border border-slate-800/80" }, React.createElement("span", null, "A=", el.section.A.toExponential(2), " mm²"), React.createElement("span", null, "I=", el.section.I.toExponential(2), " mm⁴"), React.createElement("span", null, "S=", el.section.S.toExponential(2), " mm³")))), React.createElement("div", { "className": "grid grid-cols-3 gap-2 mb-3 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80" }, React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "Material Preset"), React.createElement("select", { "value": el.material.preset, "onChange": (e     ) =>
                handleMaterialPresetChange(e.target.value                      )
              , "className": "w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs" }, React.createElement("option", { "value": "steel" }, "Steel (200 GPa)"), React.createElement("option", { "value": "concrete" }, "Concrete (30 GPa)"), React.createElement("option", { "value": "timber" }, "Timber (11 GPa)"), React.createElement("option", { "value": "custom" }, "Custom E, fy"))), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "Modulus E (GPa)"), React.createElement("input", { "type": "number", "step": "5", "min": "0.5", "value": el.material.E, "onChange": (e     ) => handleMaterialPropChange('E', parseFloat(e.target.value)), "className": "w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "Yield fy (MPa)"), React.createElement("input", { "type": "number", "step": "5", "min": "1", "value": el.material.fy, "onChange": (e     ) => handleMaterialPropChange('fy', parseFloat(e.target.value)), "className": "w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" }))), React.createElement("div", { "className": "flex flex-wrap items-center justify-between gap-2 pt-1" }, React.createElement("div", { "className": "flex items-center gap-2" }, React.createElement("button", { "type": "button", "onClick": () => toggleHinge('releaseStart'), "className": `px-2.5 py-1 rounded text-xs font-medium border cursor-pointer transition-colors ${
                el.releaseStart
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400/60'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }` }, "○ Start Hinge (", nodeI.id, ")"), React.createElement("button", { "type": "button", "onClick": () => toggleHinge('releaseEnd'), "className": `px-2.5 py-1 rounded text-xs font-medium border cursor-pointer transition-colors ${
                el.releaseEnd
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400/60'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }` }, "○ End Hinge (", nodeJ.id, ")")), React.createElement("div", { "className": "flex items-center gap-1.5" }, React.createElement("button", { "type": "button", "onClick": () => onPinParameter('member_depth', el.id), "title": "Pin Section Depth (h) to Real-Time Sensitivity Slider", "className": "flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-400/40 cursor-pointer" }, React.createElement(Pin, { "size": 11 }), React.createElement("span", null, "Pin h")), React.createElement("button", { "type": "button", "onClick": () => onPinParameter('member_E', el.id), "title": "Pin Young's Modulus (E) to Real-Time Sensitivity Slider", "className": "flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-400/40 cursor-pointer" }, React.createElement(Pin, { "size": 11 }), React.createElement("span", null, "Pin E")), React.createElement("button", { "type": "button", "onClick": () => onQuickAddMemberLoad(el.id, 'distributed'), "title": "Add Distributed Load on this Member", "className": "flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-400/40 cursor-pointer" }, React.createElement(Plus, { "size": 11 }), React.createElement("span", null, "Add Load")))))
    );
  }

  if (selectedNodeId) {
    const node = model.nodes.find((n) => n.id === selectedNodeId);
    if (!node) return null;
    const polar = cartesianToPolar(node.x, node.y);

    const updateNode = (patch                         ) => {
      onUpdateModel((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === node.id ? { ...n, ...patch } : n)),
      }));
    };

    const handleSupportChange = (support               ) => {
      updateNode({
        support,
        restraints: restraintsFromSupportPreset(support),
        inclinedAngleDeg:
          support === 'inclinedRoller' ? (node.inclinedAngleDeg ?? 30) : node.inclinedAngleDeg,
      });
    };

    const handlePolarInput = (r        , thetaDeg        ) => {
      const cart = polarToCartesian(r, thetaDeg);
      updateNode({ x: cart.x, y: cart.y });
    };

    return (
      React.createElement("div", { "id": "contextual-node-popup", "className": "absolute bottom-4 left-4 z-20 w-[370px] max-w-[calc(100vw-32px)] bg-slate-900/95 backdrop-blur-md border border-teal-500/40 rounded-xl shadow-2xl text-slate-100 p-3.5 select-none" }, React.createElement("div", { "className": "flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800" }, React.createElement("div", null, React.createElement("span", { "className": "text-[10px] font-mono uppercase tracking-wider text-teal-400 block" }, "Node & Support Inspector"), React.createElement("h3", { "className": "text-sm font-bold text-slate-100" }, node.id, " · ", node.label || 'Structural Node', " (z = 0.0 m)")), React.createElement("div", { "className": "flex items-center gap-1" }, React.createElement("button", { "type": "button", "onClick": onDeleteEntity, "title": "Delete Node", "className": "p-1.5 rounded-md text-rose-400 hover:bg-rose-500/20 cursor-pointer" }, React.createElement(Trash2, { "size": 14 })), React.createElement("button", { "type": "button", "onClick": onClose, "className": "p-1.5 rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer" }, React.createElement(X, { "size": 15 })))), React.createElement("div", { "className": "grid grid-cols-4 gap-2 mb-3 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80" }, React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "X (m)"), React.createElement("input", { "type": "number", "step": "0.1", "value": node.x, "onChange": (e     ) => updateNode({ x: parseFloat(e.target.value) || 0 }), "className": "w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "Y (m)"), React.createElement("input", { "type": "number", "step": "0.1", "value": node.y, "onChange": (e     ) => updateNode({ y: parseFloat(e.target.value) || 0 }), "className": "w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-sky-400 block mb-0.5" }, "Polar r (m)"), React.createElement("input", { "type": "number", "step": "0.1", "min": "0", "value": polar.r, "onChange": (e     ) =>
                handlePolarInput(parseFloat(e.target.value) || 0, polar.thetaDeg)
              , "className": "w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs text-sky-300" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-sky-400 block mb-0.5" }, "Angle θ (°)"), React.createElement("input", { "type": "number", "step": "5", "value": polar.thetaDeg, "onChange": (e     ) =>
                handlePolarInput(polar.r, parseFloat(e.target.value) || 0)
              , "className": "w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs text-sky-300" }))), React.createElement("div", { "className": "space-y-2 mb-3" }, React.createElement("div", { "className": "flex items-center justify-between gap-2" }, React.createElement("label", { "className": "text-xs font-medium text-slate-300" }, "Support Preset:"), React.createElement("select", { "value": node.support, "onChange": (e     ) => handleSupportChange(e.target.value                 ), "className": "bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100" }, React.createElement("option", { "value": "none" }, "Free Joint (No Rigid Restraint)"), React.createElement("option", { "value": "fixed" }, "Fixed (ux, uy, θz fixed)"), React.createElement("option", { "value": "pinned" }, "Pinned (ux, uy fixed)"), React.createElement("option", { "value": "rollerX" }, "Roller X (uy fixed, rolls along X)"), React.createElement("option", { "value": "rollerY" }, "Roller Y (ux fixed, rolls along Y)"), React.createElement("option", { "value": "inclinedRoller" }, "Custom Inclined Roller (Angle α)"))), node.support === 'inclinedRoller' ? (
            React.createElement("div", { "className": "flex items-center justify-between bg-teal-950/40 border border-teal-500/40 rounded px-2.5 py-1.5" }, React.createElement("label", { "className": "text-xs text-teal-200" }, "Incline Angle α (deg):"), React.createElement("input", { "type": "number", "step": "5", "min": "-180", "max": "180", "value": node.inclinedAngleDeg ?? 30, "onChange": (e     ) =>
                  updateNode({ inclinedAngleDeg: parseFloat(e.target.value) || 0 })
                , "className": "w-24 bg-slate-900 border border-teal-500/50 rounded px-2 py-0.5 font-mono text-xs text-teal-200" }))
          ) : null), React.createElement("div", { "className": "bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 mb-3" }, React.createElement("span", { "className": "text-[10px] font-mono uppercase tracking-wider text-purple-300 block mb-1.5" }, "Elastic Nodal Springs (Added to Global [K] Diagonal)"), React.createElement("div", { "className": "grid grid-cols-3 gap-2" }, React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "kx (kN/m)"), React.createElement("input", { "type": "number", "step": "1000", "min": "0", "value": node.springs.kx, "onChange": (e     ) =>
                  updateNode({
                    springs: { ...node.springs, kx: Math.max(0, parseFloat(e.target.value) || 0) },
                  })
                , "className": "w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "ky (kN/m)"), React.createElement("input", { "type": "number", "step": "1000", "min": "0", "value": node.springs.ky, "onChange": (e     ) =>
                  updateNode({
                    springs: { ...node.springs, ky: Math.max(0, parseFloat(e.target.value) || 0) },
                  })
                , "className": "w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "kθ (kNm/rad)"), React.createElement("input", { "type": "number", "step": "1000", "min": "0", "value": node.springs.krz, "onChange": (e     ) =>
                  updateNode({
                    springs: {
                      ...node.springs,
                      krz: Math.max(0, parseFloat(e.target.value) || 0),
                    },
                  })
                , "className": "w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-xs" })))), React.createElement("div", { "className": "flex items-center justify-between gap-2" }, React.createElement("div", { "className": "flex items-center gap-1.5" }, React.createElement("button", { "type": "button", "onClick": () => onPinParameter('node_spring_ky', node.id), "className": "flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-400/40 cursor-pointer" }, React.createElement(Pin, { "size": 11 }), React.createElement("span", null, "Pin ky")), React.createElement("button", { "type": "button", "onClick": () => onPinParameter('node_spring_krz', node.id), "className": "flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-400/40 cursor-pointer" }, React.createElement(Pin, { "size": 11 }), React.createElement("span", null, "Pin kθ"))), React.createElement("button", { "type": "button", "onClick": () => onQuickAddNodalLoad(node.id), "className": "flex items-center gap-1 px-2.5 py-1 rounded text-[11px] bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-400/40 cursor-pointer" }, React.createElement(Plus, { "size": 11 }), React.createElement("span", null, "Add Nodal Force"))))
    );
  }

  if (selectedLoadId) {
    const load = model.loads.find((l) => l.id === selectedLoadId);
    if (!load) return null;

    const updateLoad = (patch                         ) => {
      onUpdateModel((prev) => ({
        ...prev,
        loads: prev.loads.map((l) => (l.id === load.id ? ({ ...l, ...patch }                  ) : l)),
      }));
    };

    const convertMemberLoadKind = (targetKind                                       ) => {
      if (load.kind === targetKind) return;
      if (load.kind === 'member_distributed' && targetKind === 'member_point') {
        const el = model.elements.find(
          (e)                      => e.kind === 'frame2d' && e.id === load.elementId
        );
        const ni = el ? model.nodes.find((n) => n.id === el.nodeI) : undefined;
        const nj = el ? model.nodes.find((n) => n.id === el.nodeJ) : undefined;
        const L = ni && nj ? Math.hypot(nj.x - ni.x, nj.y - ni.y) : 4.0;
        const nextLoad                 = {
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
        const nextLoad                 = {
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
      React.createElement("div", { "id": "contextual-load-popup", "className": "absolute bottom-4 left-4 z-20 w-[370px] max-w-[calc(100vw-32px)] bg-slate-900/95 backdrop-blur-md border border-amber-500/50 rounded-xl shadow-2xl text-slate-100 p-3.5 select-none" }, React.createElement("div", { "className": "flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800" }, React.createElement("div", null, React.createElement("span", { "className": "text-[10px] font-mono uppercase tracking-wider text-amber-400 block" }, "Load Parameter Editor"), React.createElement("h3", { "className": "text-sm font-bold text-slate-100" }, load.id, " · ", load.label || load.kind)), React.createElement("div", { "className": "flex items-center gap-1" }, React.createElement("button", { "type": "button", "onClick": onDeleteEntity, "title": "Delete Load", "className": "p-1.5 rounded-md text-rose-400 hover:bg-rose-500/20 cursor-pointer" }, React.createElement(Trash2, { "size": 14 })), React.createElement("button", { "type": "button", "onClick": onClose, "className": "p-1.5 rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer" }, React.createElement(X, { "size": 15 })))), load.kind === 'member_distributed' || load.kind === 'member_point' ? (
          React.createElement("div", { "className": "flex items-center gap-1.5 mb-2.5 bg-slate-950/70 p-1 rounded-lg border border-slate-800" }, React.createElement("button", { "type": "button", "onClick": () => convertMemberLoadKind('member_distributed'), "className": `flex-1 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                load.kind === 'member_distributed'
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-400/50'
                  : 'text-slate-400 hover:text-slate-200'
              }` }, "Distributed (w1, w2)"), React.createElement("button", { "type": "button", "onClick": () => convertMemberLoadKind('member_point'), "className": `flex-1 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                load.kind === 'member_point'
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-400/50'
                  : 'text-slate-400 hover:text-slate-200'
              }` }, "Point Load (P @ a)"))
        ) : null, load.kind === 'member_distributed' ? (
          React.createElement("div", { "className": "space-y-2.5 mb-3" }, React.createElement("div", { "className": "grid grid-cols-2 gap-2" }, React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "Start w1 @ x=0 (kN/m)"), React.createElement("input", { "type": "number", "step": "2", "value": load.w1, "onChange": (e     ) => updateLoad({ w1: parseFloat(e.target.value) || 0 }), "className": "w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-amber-200" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "End w2 @ x=L (kN/m)"), React.createElement("input", { "type": "number", "step": "2", "value": load.w2, "onChange": (e     ) => updateLoad({ w2: parseFloat(e.target.value) || 0 }), "className": "w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-amber-200" }))), React.createElement("div", { "className": "flex items-center justify-between gap-2" }, React.createElement("label", { "className": "text-xs text-slate-300" }, "Coordinate Direction:"), React.createElement("select", { "value": load.direction, "onChange": (e     ) =>
                  updateLoad({ direction: e.target.value                            })
                , "className": "bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100" }, React.createElement("option", { "value": "local_perp" }, "Local Perpendicular (+y)"), React.createElement("option", { "value": "global_x" }, "Global X (Lateral)"), React.createElement("option", { "value": "global_y" }, "Global Y (Vertical)"))))
        ) : null, load.kind === 'member_point' ? (
          React.createElement("div", { "className": "space-y-2.5 mb-3" }, React.createElement("div", { "className": "grid grid-cols-2 gap-2" }, React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "Magnitude P (kN)"), React.createElement("input", { "type": "number", "step": "5", "value": load.p, "onChange": (e     ) => updateLoad({ p: parseFloat(e.target.value) || 0 }), "className": "w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-amber-200" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "Position a from Start (m)"), React.createElement("input", { "type": "number", "step": "0.1", "min": "0", "value": load.a, "onChange": (e     ) =>
                    updateLoad({ a: Math.max(0, parseFloat(e.target.value) || 0) })
                  , "className": "w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-amber-200" }))), React.createElement("div", { "className": "flex items-center justify-between gap-2" }, React.createElement("label", { "className": "text-xs text-slate-300" }, "Coordinate Direction:"), React.createElement("select", { "value": load.direction, "onChange": (e     ) =>
                  updateLoad({ direction: e.target.value                            })
                , "className": "bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100" }, React.createElement("option", { "value": "local_perp" }, "Local Perpendicular (+y)"), React.createElement("option", { "value": "global_x" }, "Global X (Horizontal)"), React.createElement("option", { "value": "global_y" }, "Global Y (Vertical)"))))
        ) : null, load.kind === 'nodal' ? (
          React.createElement("div", { "className": "grid grid-cols-3 gap-2 mb-3" }, React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "Fx (kN)"), React.createElement("input", { "type": "number", "step": "5", "value": load.fx, "onChange": (e     ) => updateLoad({ fx: parseFloat(e.target.value) || 0 }), "className": "w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-amber-200" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "Fy (kN)"), React.createElement("input", { "type": "number", "step": "5", "value": load.fy, "onChange": (e     ) => updateLoad({ fy: parseFloat(e.target.value) || 0 }), "className": "w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-amber-200" })), React.createElement("div", null, React.createElement("label", { "className": "text-[10px] text-slate-400 block mb-0.5" }, "Moment Mz (kNm)"), React.createElement("input", { "type": "number", "step": "5", "value": load.mz, "onChange": (e     ) => updateLoad({ mz: parseFloat(e.target.value) || 0 }), "className": "w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-amber-200" })))
        ) : null, React.createElement("div", { "className": "flex items-center justify-between" }, React.createElement("button", { "type": "button", "onClick": () => onPinParameter('load_magnitude', load.id), "className": "flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-400/40 cursor-pointer" }, React.createElement(Pin, { "size": 12 }), React.createElement("span", null, "Pin Load Magnitude to Live Sensitivity Slider"))))
    );
  }

  return null;
}



  __exports.ContextualPopup = ContextualPopup;
  return __exports;
})();

// === Module: src/components/SensitivityPanel.tsx (__mod_14) ===
__modules.__mod_14 = (function() {
  const __exports = {};
  const React = __modules.__mod_0.default ?? __modules.__mod_0;
             
                  
               
                        
                 
                           
                                                                        
const { Sliders, Gauge, RotateCcw, X, Plus, Pin, Activity } = __modules.__mod_10;

                                        
                         
                             
                             
                                                               
                                        
                                                                  
                                        
                                  
                  
                                        
                    
            
                                                                         
 

function SensitivityPanel({
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
}                       ) {
  const [Collapsed, setCollapsed] = React.useState         (false);
  const [quickPinSelect, setQuickPinSelect] = React.useState        ('');

  if (Collapsed) {
    return (
      React.createElement("button", { "id": "btn-expand-sensitivity-panel", "type": "button", "onClick": () => setCollapsed(false), "className": "absolute top-3 right-3 z-20 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/95 border border-sky-500/40 text-sky-300 text-xs font-semibold shadow-xl cursor-pointer hover:bg-slate-800" }, React.createElement(Sliders, { "size": 14 }), React.createElement("span", null, "Sensitivity & Telemetry"))
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
  const quickPinOptions                                          = [];
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

  const handleQuickPinAdd = (val        ) => {
    if (!val) return;
    const [kind, targetId] = val.split(':')                                           ;
    if (kind && targetId) {
      onAddQuickPin(kind, targetId);
    }
    setQuickPinSelect('');
  };

  const formatCurrentPinValue = (pin                       )         => {
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
    React.createElement("aside", { "id": "realtime-sensitivity-panel", "className": "w-80 shrink-0 bg-slate-900/95 border-l border-slate-800 flex flex-col h-full overflow-y-auto select-none z-10 text-slate-100" }, React.createElement("div", { "className": "flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800 bg-slate-950/50" }, React.createElement("div", { "className": "flex items-center gap-2" }, React.createElement(Sliders, { "size": 15, "className": "text-sky-400" }), React.createElement("h2", { "className": "text-xs font-bold uppercase tracking-wider text-slate-200" }, "Real-Time Sensitivity")), React.createElement("button", { "type": "button", "onClick": () => setCollapsed(true), "title": "Collapse Panel", "className": "p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer" }, React.createElement(X, { "size": 14 }))), React.createElement("div", { "className": "p-3.5 border-b border-slate-800 space-y-3" }, React.createElement("div", null, React.createElement("div", { "className": "flex items-center justify-between text-xs mb-1" }, React.createElement("span", { "className": "text-slate-300 font-medium" }, "Deflection Scale"), React.createElement("span", { "className": "font-mono text-sky-300 font-semibold" }, layers.deflectionScale, "×")), React.createElement("input", { "id": "slider-deflection-scale", "type": "range", "min": "1", "max": "500", "step": "1", "value": layers.deflectionScale, "onChange": (e     ) =>
              onUpdateLayers({ deflectionScale: Number(e.target.value) })
            , "className": "w-full accent-sky-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg" }), React.createElement("div", { "className": "flex justify-between text-[10px] font-mono text-slate-500 mt-0.5" }, React.createElement("span", null, "1× (True)"), React.createElement("span", null, "250×"), React.createElement("span", null, "500×"))), React.createElement("div", null, React.createElement("div", { "className": "flex items-center justify-between text-xs mb-1" }, React.createElement("span", { "className": "text-slate-300 font-medium" }, "N / V / M Diagram Scale"), React.createElement("span", { "className": "font-mono text-rose-300 font-semibold" }, layers.diagramScale.toFixed(1), "×")), React.createElement("input", { "id": "slider-diagram-scale", "type": "range", "min": "0.2", "max": "3.0", "step": "0.1", "value": layers.diagramScale, "onChange": (e     ) =>
              onUpdateLayers({ diagramScale: Number(e.target.value) })
            , "className": "w-full accent-rose-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg" }))), React.createElement("div", { "className": "p-3.5 border-b border-slate-800 space-y-2.5" }, React.createElement("div", { "className": "flex items-center justify-between" }, React.createElement("div", { "className": "flex items-center gap-1.5" }, React.createElement(Pin, { "size": 13, "className": "text-amber-400" }), React.createElement("span", { "className": "text-xs font-bold uppercase tracking-wider text-slate-300" }, "Parametric Sliders")), React.createElement("button", { "id": "btn-reset-sensitivity", "type": "button", "onClick": onResetPinnedParams, "title": "Reset all pinned multipliers to 1.0x", "className": "flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer" }, React.createElement(RotateCcw, { "size": 11 }), React.createElement("span", null, "1.0× Reset"))), React.createElement("p", { "className": "text-[11px] text-slate-400 leading-snug" }, "Drag any slider below to morph section stiffness, soil/joint springs, or loads at 60fps:"), React.createElement("div", { "className": "space-y-2.5 pt-1" }, pinnedParams.map((pin) => (
            React.createElement("div", { "key": pin.id, "className": "bg-slate-950/80 border border-slate-800/90 rounded-lg p-2.5 space-y-1.5" }, React.createElement("div", { "className": "flex items-center justify-between gap-1" }, React.createElement("span", { "className": "text-xs font-semibold text-slate-200 truncate" }, pin.label), React.createElement("div", { "className": "flex items-center gap-1.5 shrink-0" }, React.createElement("span", { "className": "text-[11px] font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30" }, pin.multiplier.toFixed(2), "× (", formatCurrentPinValue(pin), ")"), React.createElement("button", { "type": "button", "onClick": () => onUnpinParam(pin.id), "title": "Unpin parameter", "className": "text-slate-500 hover:text-rose-400 cursor-pointer" }, React.createElement(X, { "size": 13 })))), React.createElement("input", { "type": "range", "min": "0.1", "max": "3.0", "step": "0.05", "value": pin.multiplier, "onChange": (e     ) =>
                  onSlidePinnedParam(pin.id, parseFloat(e.target.value))
                , "className": "w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg" }), React.createElement("div", { "className": "flex justify-between text-[10px] font-mono text-slate-500" }, React.createElement("span", null, "0.1×"), React.createElement("span", null, "1.0× Base"), React.createElement("span", null, "2.0×"), React.createElement("span", null, "3.0×")))
          ))), React.createElement("div", { "className": "pt-1" }, React.createElement("select", { "id": "quick-pin-parameter-select", "value": quickPinSelect, "onChange": (e     ) => handleQuickPinAdd(e.target.value), "className": "w-full bg-slate-800/90 hover:bg-slate-800 text-xs text-slate-300 rounded-md px-2.5 py-1.5 border border-slate-700 cursor-pointer" }, React.createElement("option", { "value": "" }, "+ Pin another member / spring / load parameter..."), quickPinOptions.map((opt) => (
              React.createElement("option", { "key": opt.value, "value": opt.value }, opt.label)
            ))))), React.createElement("div", { "className": "p-3.5 border-b border-slate-800 space-y-2.5" }, React.createElement("div", { "className": "flex items-center gap-1.5" }, React.createElement(Gauge, { "size": 14, "className": "text-emerald-400" }), React.createElement("span", { "className": "text-xs font-bold uppercase tracking-wider text-slate-300" }, "Peak Envelope Telemetry")), React.createElement("div", { "className": "bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 space-y-1" }, React.createElement("div", { "className": "flex items-center justify-between text-xs" }, React.createElement("span", { "className": "text-slate-400" }, "Governing Utilization (σ_max / fy)"), React.createElement("span", { "className": `font-mono font-bold ${
                solverOutput.globalMaxUtilization > 1.0
                  ? 'text-rose-400'
                  : solverOutput.globalMaxUtilization > 0.75
                    ? 'text-amber-300'
                    : 'text-emerald-300'
              }` }, maxEtaPct.toFixed(1), "%")), React.createElement("div", { "className": "w-full h-2 bg-slate-800 rounded-full overflow-hidden" }, React.createElement("div", { "style": {
                width: `${Math.min(100, Math.max(2, maxEtaPct))}%`,
              }, "className": `h-full transition-all ${etaBarColor}` })), solverOutput.governingMember.elementId ? (
            React.createElement("div", { "className": "flex items-center justify-between text-[10px] font-mono text-slate-400 pt-0.5" }, React.createElement("span", null, "Critical: ", React.createElement("strong", { "className": "text-slate-200" }, solverOutput.governingMember.elementId), " @ x/L =", ' ', solverOutput.governingMember.xOverL.toFixed(2)), React.createElement("span", null, solverOutput.governingMember.sigmaMaxMpa.toFixed(1), " / ", solverOutput.governingMember.fyMpa, " MPa"))
          ) : null), React.createElement("div", { "className": "grid grid-cols-2 gap-2 font-mono text-xs" }, React.createElement("div", { "className": "bg-slate-950/70 border border-slate-800/80 rounded-lg p-2" }, React.createElement("span", { "className": "text-[10px] font-sans text-slate-400 block" }, "Max Deflection |δ|"), React.createElement("span", { "className": "text-sky-300 font-bold" }, solverOutput.globalMaxDeflectionMm.toFixed(2), " mm")), React.createElement("div", { "className": "bg-slate-950/70 border border-slate-800/80 rounded-lg p-2" }, React.createElement("span", { "className": "text-[10px] font-sans text-slate-400 block" }, "Max Stress σ_max"), React.createElement("span", { "className": "text-amber-300 font-bold" }, solverOutput.globalMaxSigmaMpa.toFixed(1), " MPa")), React.createElement("div", { "className": "bg-slate-950/70 border border-slate-800/80 rounded-lg p-2" }, React.createElement("span", { "className": "text-[10px] font-sans text-slate-400 block" }, "Max Moment |M|"), React.createElement("span", { "className": "text-rose-300 font-bold" }, solverOutput.globalMaxM.toFixed(2), " kNm")), React.createElement("div", { "className": "bg-slate-950/70 border border-slate-800/80 rounded-lg p-2" }, React.createElement("span", { "className": "text-[10px] font-sans text-slate-400 block" }, "Max Shear |V| / Axial |N|"), React.createElement("span", { "className": "text-emerald-300 font-bold" }, solverOutput.globalMaxV.toFixed(1), " / ", solverOutput.globalMaxN.toFixed(1), " kN")))), React.createElement("div", { "className": "p-3.5 space-y-3 flex-1" }, React.createElement("div", { "className": "space-y-1.5" }, React.createElement("div", { "className": "flex items-center gap-1.5" }, React.createElement(Activity, { "size": 14, "className": "text-sky-400" }), React.createElement("span", { "className": "text-xs font-bold uppercase tracking-wider text-slate-300" }, "Member Envelope Extrema (x/L)")), React.createElement("div", { "className": "bg-slate-950/70 border border-slate-800 rounded-lg overflow-hidden" }, React.createElement("table", { "className": "w-full text-[10.5px] font-mono text-left" }, React.createElement("thead", { "className": "bg-slate-900 text-slate-400 border-b border-slate-800" }, React.createElement("tr", null, React.createElement("th", { "className": "py-1.5 px-2" }, "ID"), React.createElement("th", { "className": "py-1.5 px-1.5 text-right" }, "M_ext (x/L)"), React.createElement("th", { "className": "py-1.5 px-1.5 text-right" }, "V_ext"), React.createElement("th", { "className": "py-1.5 px-2 text-right" }, "σ/fy"))), React.createElement("tbody", { "className": "divide-y divide-slate-800/60" }, model.elements
                  .filter((e)                      => e.kind === 'frame2d')
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
                      React.createElement("tr", { "key": el.id, "onClick": () => onSelectEntity('member', el.id), "className": "hover:bg-slate-800/60 cursor-pointer transition-colors" }, React.createElement("td", { "className": "py-1.5 px-2 font-bold text-sky-300" }, el.id), React.createElement("td", { "className": "py-1.5 px-1.5 text-right text-rose-300" }, govM.value.toFixed(1), ' ', React.createElement("span", { "className": "text-slate-500" }, "(", govM.xOverL.toFixed(2), ")")), React.createElement("td", { "className": "py-1.5 px-1.5 text-right text-emerald-300" }, govV.value.toFixed(1)), React.createElement("td", { "className": "py-1.5 px-2 text-right text-amber-300" }, (extrema.governingUtilization.value * 100).toFixed(0), "%"))
                    );
                  }))))), React.createElement("div", { "className": "space-y-1.5" }, React.createElement("div", { "className": "flex items-center gap-1.5" }, React.createElement(Activity, { "size": 14, "className": "text-teal-400" }), React.createElement("span", { "className": "text-xs font-bold uppercase tracking-wider text-slate-300" }, "Support & Spring Reactions")), React.createElement("div", { "className": "bg-slate-950/70 border border-slate-800 rounded-lg overflow-hidden" }, React.createElement("table", { "className": "w-full text-[11px] font-mono text-left" }, React.createElement("thead", { "className": "bg-slate-900 text-slate-400 border-b border-slate-800" }, React.createElement("tr", null, React.createElement("th", { "className": "py-1.5 px-2" }, "Node"), React.createElement("th", { "className": "py-1.5 px-2 text-right" }, "Rx (kN)"), React.createElement("th", { "className": "py-1.5 px-2 text-right" }, "Ry (kN)"), React.createElement("th", { "className": "py-1.5 px-2 text-right" }, "Mz (kNm)"))), React.createElement("tbody", { "className": "divide-y divide-slate-800/60" }, model.nodes
                  .filter((n) => solverOutput.nodeResults[n.id]?.hasReaction)
                  .map((n) => {
                    const nr = solverOutput.nodeResults[n.id];
                    return (
                      React.createElement("tr", { "key": n.id, "onClick": () => onSelectEntity('node', n.id), "className": "hover:bg-slate-800/60 cursor-pointer transition-colors" }, React.createElement("td", { "className": "py-1.5 px-2 font-bold text-teal-300" }, n.id), React.createElement("td", { "className": "py-1.5 px-2 text-right" }, nr.reactionFx.toFixed(1)), React.createElement("td", { "className": "py-1.5 px-2 text-right" }, nr.reactionFy.toFixed(1)), React.createElement("td", { "className": "py-1.5 px-2 text-right" }, nr.reactionMz.toFixed(1)))
                    );
                  })))))))
  );
}



  __exports.SensitivityPanel = SensitivityPanel;
  return __exports;
})();

// === Module: src/App.tsx (__mod_15) ===
__modules.__mod_15 = (function() {
  const __exports = {};
  const React = __modules.__mod_0.default ?? __modules.__mod_0;
             
                  
                 
                 
                 
                        
                          
const {
  analyzeStructure,
  computeCrossSection,
  createMaterialFromPreset,
  restraintsFromSupportPreset,
} = __modules.__mod_4;
const {
  computeSmartSnap,
  fitModelToViewport,
                         
                  
} = __modules.__mod_5;
const {
  hitTestCanvas,
  probeMemberAtCursor,
  splitMemberAtPoint,
  canAddMember,
  nextEntityId,
                      
} = __modules.__mod_7;
const {
  CanvasRenderer,
                          
                        
} = __modules.__mod_8;
const { BENCHMARK_PRESETS } = __modules.__mod_9;
const { Toolbar,                     } = __modules.__mod_11;
const { LayerTogglesBar } = __modules.__mod_12;
const { ContextualPopup } = __modules.__mod_13;
const { SensitivityPanel } = __modules.__mod_14;

function buildDefaultPinsForPreset(presetId        , model                 )                          {
  const pins                          = [];

  if (presetId === 'culvert') {
    const l1 = model.loads.find((l) => l.id === 'L1');
    if (l1 && l1.kind === 'member_distributed') {
      pins.push({
        id: 'pin_L1',
        label: 'Left Wall Earth+Water (L1)',
        kind: 'load_magnitude',
        loadId: 'L1',
        basePrimary: l1.w1,
        baseSecondary: l1.w2,
        multiplier: 1.0,
      });
    }
    const l3 = model.loads.find((l) => l.id === 'L3');
    if (l3 && l3.kind === 'member_distributed') {
      pins.push({
        id: 'pin_L3',
        label: 'Roof Soil Surcharge (L3)',
        kind: 'load_magnitude',
        loadId: 'L3',
        basePrimary: l3.w1,
        baseSecondary: l3.w2,
        multiplier: 1.0,
      });
    }
    const m3 = model.elements.find((e)                      => e.id === 'M3' && e.kind === 'frame2d');
    if (m3) {
      pins.push({
        id: 'pin_M3_h',
        label: 'Roof Slab Depth h (M3)',
        kind: 'member_depth',
        elementId: 'M3',
        baseValue: m3.section.depthMm,
        multiplier: 1.0,
      });
    }
    const n5 = model.nodes.find((n) => n.id === 'N5');
    if (n5) {
      pins.push({
        id: 'pin_N5_ky',
        label: 'Center Soil Spring ky (N5)',
        kind: 'node_spring_ky',
        nodeId: 'N5',
        baseValue: n5.springs.ky,
        multiplier: 1.0,
      });
    }
    return pins;
  }

  if (presetId === 'portal') {
    const l1 = model.loads.find((l) => l.id === 'L1');
    if (l1 && l1.kind === 'member_point') {
      pins.push({
        id: 'pin_L1',
        label: 'Lateral Wind Load P (L1)',
        kind: 'load_magnitude',
        loadId: 'L1',
        basePrimary: l1.p,
        multiplier: 1.0,
      });
    }
    const l2 = model.loads.find((l) => l.id === 'L2');
    if (l2 && l2.kind === 'member_distributed') {
      pins.push({
        id: 'pin_L2',
        label: 'Bay 1 Roof UDL (L2)',
        kind: 'load_magnitude',
        loadId: 'L2',
        basePrimary: l2.w1,
        baseSecondary: l2.w2,
        multiplier: 1.0,
      });
    }
    const m2 = model.elements.find((e)                      => e.id === 'M2' && e.kind === 'frame2d');
    if (m2) {
      pins.push({
        id: 'pin_M2_h',
        label: 'Center Column Depth h (M2)',
        kind: 'member_depth',
        elementId: 'M2',
        baseValue: m2.section.depthMm,
        multiplier: 1.0,
      });
    }
    return pins;
  }

  if (presetId === 'continuous_beam') {
    const n2 = model.nodes.find((n) => n.id === 'N2');
    if (n2) {
      pins.push({
        id: 'pin_N2_krz',
        label: 'Center Pier Spring kθ (N2)',
        kind: 'node_spring_krz',
        nodeId: 'N2',
        baseValue: n2.springs.krz,
        multiplier: 1.0,
      });
    }
    const l1 = model.loads.find((l) => l.id === 'L1');
    if (l1 && l1.kind === 'member_distributed') {
      pins.push({
        id: 'pin_L1',
        label: 'Span 1 UDL w (L1)',
        kind: 'load_magnitude',
        loadId: 'L1',
        basePrimary: l1.w1,
        baseSecondary: l1.w2,
        multiplier: 1.0,
      });
    }
    const l2 = model.loads.find((l) => l.id === 'L2');
    if (l2 && l2.kind === 'member_point') {
      pins.push({
        id: 'pin_L2',
        label: 'Span 2 Point Load P (L2)',
        kind: 'load_magnitude',
        loadId: 'L2',
        basePrimary: l2.p,
        multiplier: 1.0,
      });
    }
    return pins;
  }

  // pratt_truss
  const l2 = model.loads.find((l) => l.id === 'L2');
  if (l2 && l2.kind === 'nodal') {
    pins.push({
      id: 'pin_L2',
      label: 'Center Joint Load Fy (L2)',
      kind: 'load_magnitude',
      loadId: 'L2',
      basePrimary: l2.fy,
      multiplier: 1.0,
    });
  }
  const m6 = model.elements.find((e)                      => e.id === 'M6' && e.kind === 'frame2d');
  if (m6) {
    pins.push({
      id: 'pin_M6_E',
      label: 'Top Chord Modulus E (M6)',
      kind: 'member_E',
      elementId: 'M6',
      baseValue: m6.material.E,
      multiplier: 1.0,
    });
  }
  return pins;
}

const rendererInstance = new CanvasRenderer();

function App() {
  const initialPreset = BENCHMARK_PRESETS[0];
  const [activePresetId, setActivePresetId] = React.useState        (initialPreset.id);
  const [model, setModel] = React.useState                 (() =>
    structuredClone(initialPreset.model)
  );
  const [undoStack, setUndoStack] = React.useState                   ([]);
  const [redoStack, setRedoStack] = React.useState                   ([]);

  const [activeTool, setActiveTool] = React.useState                ('select');
  const [selectedNodeId, setSelectedNodeId] = React.useState               (null);
  const [selectedElementId, setSelectedElementId] = React.useState               ('M1');
  const [selectedLoadId, setSelectedLoadId] = React.useState               (null);
  const [hoveredElementId, setHoveredElementId] = React.useState               (null);

  const [layers, setLayers] = React.useState                    ({
    showGrid: true,
    showLoads: true,
    showSupports: true,
    showDeformed: true,
    showAxial: false,
    showShear: false,
    showMoment: true,
    showReactions: true,
    showHeatmap: false,
    momentSide: 'tension',
    deflectionScale: 120,
    diagramScale: 1.0,
  });

  const [pinnedParams, setPinnedParams] = React.useState                         (() =>
    buildDefaultPinsForPreset(initialPreset.id, initialPreset.model)
  );

  const [viewport, setViewport] = React.useState                   ({
    panX: 340,
    panY: 420,
    zoom: 85,
    width: 960,
    height: 640,
    coordSystem: 'cartesian',
    polarOrigin: { x: 0, y: 0 },
  });

  const [snapTarget, setSnapTarget] = React.useState                   (null);
  const [drawStartPoint, setDrawStartPoint] = React.useState  
              
              
                    
                            
           (null);
  const [hoverProbe, setHoverProbe] = React.useState                       (null);
  const [toastMessage, setToastMessage] = React.useState               (null);

  const canvasRef = React.useRef                          (null);
  const containerRef = React.useRef                       (null);
  const loadHandlesRef = React.useRef                    ([]);
  const panDragRef = React.useRef  
                    
                    
                    
                     
                     
                   
    ({
    active: false,
    startSx: 0,
    startSy: 0,
    origPanX: 0,
    origPanY: 0,
    moved: false,
  });

  const showToast = (msg        ) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3000);
  };

  // Run 6-DOF 2D Euler-Bernoulli FEM Solver synchronously on every model change
  const solverOutput = React.useMemo(() => analyzeStructure(model, 48), [model]);

  const updateModelWithHistory = (
    updater                                            ,
    recordUndo          = true
  ) => {
    setModel((prev) => {
      const next = updater(structuredClone(prev));
      if (recordUndo) {
        setUndoStack((u) => [...u.slice(-29), prev]);
        setRedoStack([]);
      }
      return next;
    });
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prevModel = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, model]);
    setModel(prevModel);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextModel = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, model]);
    setModel(nextModel);
  };

  const handleSelectPreset = (presetId        ) => {
    const found = BENCHMARK_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    const freshModel = structuredClone(found.model);
    setActivePresetId(presetId);
    setUndoStack([]);
    setRedoStack([]);
    setModel(freshModel);
    setSelectedNodeId(null);
    setSelectedElementId(freshModel.elements[0]?.id ?? null);
    setSelectedLoadId(null);
    setDrawStartPoint(null);
    setPinnedParams(buildDefaultPinsForPreset(presetId, freshModel));

    // Customize default visible diagram for Pratt Truss vs Frame/Beam/Culvert
    if (presetId === 'pratt_truss') {
      setLayers((l) => ({
        ...l,
        showAxial: true,
        showMoment: false,
        showShear: false,
        showHeatmap: true,
        deflectionScale: 150,
      }));
    } else {
      setLayers((l) => ({
        ...l,
        showAxial: false,
        showMoment: true,
        showShear: false,
        showHeatmap: false,
        deflectionScale: 120,
      }));
    }

    setViewport((vp) => fitModelToViewport(freshModel.nodes, vp.width, vp.height, vp));
  };

  // Fit viewport on mount and container resize
  React.useEffect(() => {
    const updateSize = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewport((vp) =>
          fitModelToViewport(model.nodes, rect.width, rect.height, vp)
        );
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Delete, Escape, V/M/S/N/L tool keys)
  React.useEffect(() => {
    const onKeyDown = (e               ) => {
      const tag = (e.target               )?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (e.key === 'Escape') {
        setDrawStartPoint(null);
        setSelectedNodeId(null);
        setSelectedElementId(null);
        setSelectedLoadId(null);
        setActiveTool('select');
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'v') setActiveTool('select');
      else if (key === 'm') setActiveTool('draw_member');
      else if (key === 's') setActiveTool('assign_support');
      else if (key === 'n') setActiveTool('add_nodal_load');
      else if (key === 'l') setActiveTool('add_member_load');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoStack, redoStack, model, selectedNodeId, selectedElementId, selectedLoadId]);

  // Render HTML5 Canvas with crisp devicePixelRatio scaling on state changes
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.floor(viewport.width * dpr));
    const targetH = Math.max(1, Math.floor(viewport.height * dpr));

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);

    const handles = rendererInstance.render(ctx, viewport, model, solverOutput, layers, {
      activeTool,
      selectedNodeId,
      selectedElementId,
      selectedLoadId,
      hoveredElementId,
      snapTarget,
      drawStartPoint,
      hoverProbe,
    });
    loadHandlesRef.current = handles;

    ctx.restore();
  }, [
    viewport,
    model,
    solverOutput,
    layers,
    activeTool,
    selectedNodeId,
    selectedElementId,
    selectedLoadId,
    hoveredElementId,
    snapTarget,
    drawStartPoint,
    hoverProbe,
  ]);

  // Delete currently selected entity (Node, Member, or Load)
  const handleDeleteEntityById = (
    kind                            ,
    id        
  ) => {
    updateModelWithHistory((prev) => {
      if (kind === 'load') {
        return {
          ...prev,
          loads: prev.loads.filter((l) => l.id !== id),
        };
      }
      if (kind === 'member') {
        return {
          ...prev,
          elements: prev.elements.filter((e) => e.id !== id),
          loads: prev.loads.filter(
            (l) =>
              !(
                (l.kind === 'member_distributed' || l.kind === 'member_point') &&
                l.elementId === id
              )
          ),
        };
      }
      // kind === 'node': remove node, incident members, and attached loads
      const removedElIds = new Set(
        prev.elements
          .filter((e) => e.kind === 'frame2d' && (e.nodeI === id || e.nodeJ === id))
          .map((e) => e.id)
      );
      return {
        ...prev,
        nodes: prev.nodes.filter((n) => n.id !== id),
        elements: prev.elements.filter((e) => !removedElIds.has(e.id)),
        loads: prev.loads.filter((l) => {
          if (l.kind === 'nodal') return l.nodeId !== id;
          if (l.kind === 'member_distributed' || l.kind === 'member_point') {
            return !removedElIds.has(l.elementId);
          }
          return true;
        }),
      };
    });

    if (kind === 'node' && selectedNodeId === id) setSelectedNodeId(null);
    if (kind === 'member' && selectedElementId === id) setSelectedElementId(null);
    if (kind === 'load' && selectedLoadId === id) setSelectedLoadId(null);
  };

  const handleDeleteSelected = () => {
    if (selectedLoadId) handleDeleteEntityById('load', selectedLoadId);
    else if (selectedElementId) handleDeleteEntityById('member', selectedElementId);
    else if (selectedNodeId) handleDeleteEntityById('node', selectedNodeId);
  };

  // Resolve a SnapResult into an existing or newly created/split Node ID inside `workingModel`
  const resolveSnapPointToNode = (
    workingModel                 ,
    snap            
  )                                             => {
    if (snap.kind === 'node' && snap.nodeId) {
      return { model: workingModel, nodeId: snap.nodeId };
    }
    if (snap.kind === 'member_segment' && snap.splitElementId) {
      // Auto-split existing member at T-junction!
      const splitRes = splitMemberAtPoint(
        workingModel,
        snap.splitElementId,
        snap.x,
        snap.y
      );
      showToast(`Auto-split member ${snap.splitElementId} at T-junction (${snap.x}m, ${snap.y}m)`);
      return { model: splitRes.model, nodeId: splitRes.newNodeId };
    }
    // Check if a node already exists at (snap.x, snap.y)
    const existing = workingModel.nodes.find(
      (n) => Math.hypot(n.x - snap.x, n.y - snap.y) < 0.04
    );
    if (existing) {
      return { model: workingModel, nodeId: existing.id };
    }
    const newNodeId = nextEntityId(
      'N',
      workingModel.nodes.map((n) => n.id)
    );
    const newNode                 = {
      id: newNodeId,
      label: newNodeId,
      x: snap.x,
      y: snap.y,
      z: 0,
      support: 'none',
      restraints: restraintsFromSupportPreset('none'),
      springs: { kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
    };
    return {
      model: { ...workingModel, nodes: [...workingModel.nodes, newNode] },
      nodeId: newNodeId,
    };
  };

  // Complete drawing a member from startSnap to endSnap
  const completeDrawMember = (
    startSnap                                                                    ,
    endSnap            
  ) => {
    if (Math.hypot(endSnap.x - startSnap.x, endSnap.y - startSnap.y) < 0.05) {
      return;
    }

    updateModelWithHistory((prev) => {
      let working = prev;
      const startRes = resolveSnapPointToNode(working, {
        x: startSnap.x,
        y: startSnap.y,
        sx: 0,
        sy: 0,
        kind: startSnap.nodeId
          ? 'node'
          : startSnap.splitElementId
            ? 'member_segment'
            : 'grid',
        nodeId: startSnap.nodeId,
        splitElementId: startSnap.splitElementId,
      });
      working = startRes.model;

      // Re-verify endSnap in case startSnap split the same element
      const endRes = resolveSnapPointToNode(working, endSnap);
      working = endRes.model;

      const check = canAddMember(working, startRes.nodeId, endRes.nodeId);
      if (!check.valid) {
        if (check.reason) showToast(check.reason);
        return prev;
      }

      const newElId = nextEntityId(
        'M',
        working.elements.map((e) => e.id)
      );
      const defaultSec = computeCrossSection('i_section', {
        h: 360,
        b: 170,
        tw: 8.0,
        tf: 12.7,
      });
      const defaultMat = createMaterialFromPreset('steel');

      const newEl                 = {
        id: newElId,
        kind: 'frame2d',
        label: `Member ${newElId}`,
        nodeI: startRes.nodeId,
        nodeJ: endRes.nodeId,
        section: defaultSec,
        material: defaultMat,
        releaseStart: false,
        releaseEnd: false,
      };

      setSelectedNodeId(null);
      setSelectedLoadId(null);
      setSelectedElementId(newElId);

      return {
        ...working,
        elements: [...working.elements, newEl],
      };
    });
  };

  // Canvas Mouse Handlers
  const handleCanvasMouseDown = (e     ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Middle mouse button or right mouse button -> pan
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      panDragRef.current = {
        active: true,
        startSx: sx,
        startSy: sy,
        origPanX: viewport.panX,
        origPanY: viewport.panY,
        moved: false,
      };
      return;
    }

    const currentSnap = computeSmartSnap(sx, sy, viewport, model.nodes, model.elements);
    setSnapTarget(currentSnap);

    if (activeTool === 'draw_member') {
      if (!drawStartPoint) {
        setDrawStartPoint({
          x: currentSnap.x,
          y: currentSnap.y,
          nodeId: currentSnap.nodeId,
          splitElementId: currentSnap.splitElementId,
        });
      } else {
        completeDrawMember(drawStartPoint, currentSnap);
        setDrawStartPoint(null);
      }
      return;
    }

    const hit = hitTestCanvas(sx, sy, viewport, model, loadHandlesRef.current);

    if (activeTool === 'delete') {
      if (hit) {
        handleDeleteEntityById(hit.kind, hit.kind === 'node' ? hit.nodeId : hit.kind === 'member' ? hit.elementId : hit.loadId);
      }
      return;
    }

    if (activeTool === 'assign_support') {
      if (hit && hit.kind === 'node') {
        // Cycle support preset or select node to open support inspector
        updateModelWithHistory((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => {
            if (n.id !== hit.nodeId) return n;
            const order                              = [
              'pinned',
              'rollerX',
              'fixed',
              'inclinedRoller',
              'none',
            ];
            const nextSup = order[(order.indexOf(n.support) + 1) % order.length];
            return {
              ...n,
              support: nextSup,
              inclinedAngleDeg: nextSup === 'inclinedRoller' ? 30 : n.inclinedAngleDeg,
              restraints: restraintsFromSupportPreset(nextSup),
            };
          }),
        }));
        setSelectedNodeId(hit.nodeId);
        setSelectedElementId(null);
        setSelectedLoadId(null);
      } else {
        showToast('Click any node to assign or cycle its support restraint.');
      }
      return;
    }

    if (activeTool === 'add_nodal_load') {
      if (hit && hit.kind === 'node') {
        handleQuickAddNodalLoad(hit.nodeId);
      } else {
        showToast('Click any node to apply a concentrated Nodal Load (Fx, Fy, Mz).');
      }
      return;
    }

    if (activeTool === 'add_member_load') {
      if (hit && hit.kind === 'member') {
        handleQuickAddMemberLoad(hit.elementId, 'distributed');
      } else {
        showToast('Click any member to apply a Distributed or Point Load.');
      }
      return;
    }

    // Default 'select' mode: if clicked on background, start pan drag; if clicked on entity, open contextual pop-up
    if (hit) {
      if (hit.kind === 'node') {
        setSelectedNodeId(hit.nodeId);
        setSelectedElementId(null);
        setSelectedLoadId(null);
      } else if (hit.kind === 'member') {
        setSelectedElementId(hit.elementId);
        setSelectedNodeId(null);
        setSelectedLoadId(null);
      } else if (hit.kind === 'load') {
        setSelectedLoadId(hit.loadId);
        setSelectedNodeId(null);
        setSelectedElementId(null);
      }
    } else {
      panDragRef.current = {
        active: true,
        startSx: sx,
        startSy: sy,
        origPanX: viewport.panX,
        origPanY: viewport.panY,
        moved: false,
      };
    }
  };

  const handleCanvasMouseMove = (e     ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (panDragRef.current.active) {
      const dx = sx - panDragRef.current.startSx;
      const dy = sy - panDragRef.current.startSy;
      if (Math.hypot(dx, dy) > 3) {
        panDragRef.current.moved = true;
      }
      setViewport((vp) => ({
        ...vp,
        panX: panDragRef.current.origPanX + dx,
        panY: panDragRef.current.origPanY + dy,
      }));
      return;
    }

    const currentSnap = computeSmartSnap(sx, sy, viewport, model.nodes, model.elements);
    setSnapTarget(currentSnap);

    // Interactive Hover Probe along any member
    const probe = probeMemberAtCursor(sx, sy, viewport, model, solverOutput, 18);
    setHoverProbe(probe);
    setHoveredElementId(probe ? probe.element.id : null);
  };

  const handleCanvasMouseUp = (e     ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (panDragRef.current.active) {
      const wasMoved = panDragRef.current.moved;
      panDragRef.current.active = false;
      if (!wasMoved && activeTool === 'select') {
        setSelectedNodeId(null);
        setSelectedElementId(null);
        setSelectedLoadId(null);
      }
      return;
    }

    // Support click-drag-release in Draw Member mode!
    if (activeTool === 'draw_member' && drawStartPoint) {
      const currentSnap = computeSmartSnap(sx, sy, viewport, model.nodes, model.elements);
      if (Math.hypot(currentSnap.x - drawStartPoint.x, currentSnap.y - drawStartPoint.y) >= 0.2) {
        completeDrawMember(drawStartPoint, currentSnap);
        setDrawStartPoint(null);
      }
    }
  };

  const handleCanvasWheel = (e     ) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setViewport((vp) => {
      const nextZoom = Math.min(280, Math.max(18, vp.zoom * factor));
      const worldX = (sx - vp.panX) / vp.zoom;
      const worldY = (vp.panY - sy) / vp.zoom;
      return {
        ...vp,
        zoom: nextZoom,
        panX: sx - worldX * nextZoom,
        panY: sy + worldY * nextZoom,
      };
    });
  };

  // Quick Add Load Helpers
  const handleQuickAddMemberLoad = (
    elementId        ,
    loadType                         
  ) => {
    const newLoadId = nextEntityId(
      'L',
      model.loads.map((l) => l.id)
    );
    const newLoad                 =
      loadType === 'distributed'
        ? {
            id: newLoadId,
            kind: 'member_distributed',
            elementId,
            w1: -20,
            w2: -20,
            direction: 'global_y',
            label: `${elementId} UDL`,
          }
        : {
            id: newLoadId,
            kind: 'member_point',
            elementId,
            p: -40,
            a: 1.5,
            direction: 'global_y',
            label: `${elementId} Point Load`,
          };

    updateModelWithHistory((prev) => ({
      ...prev,
      loads: [...prev.loads, newLoad],
    }));
    setSelectedLoadId(newLoadId);
    setSelectedElementId(null);
    setSelectedNodeId(null);
  };

  const handleQuickAddNodalLoad = (nodeId        ) => {
    const newLoadId = nextEntityId(
      'L',
      model.loads.map((l) => l.id)
    );
    const newLoad                 = {
      id: newLoadId,
      kind: 'nodal',
      nodeId,
      fx: 0,
      fy: -50,
      mz: 0,
      label: `Node ${nodeId} Force`,
    };
    updateModelWithHistory((prev) => ({
      ...prev,
      loads: [...prev.loads, newLoad],
    }));
    setSelectedLoadId(newLoadId);
    setSelectedNodeId(null);
    setSelectedElementId(null);
  };

  // Pin a parameter to the Real-Time Sensitivity Panel
  const handlePinParameter = (
    kind                               ,
    targetId        
  ) => {
    const pinId = `pin_${kind}_${targetId}`;
    if (pinnedParams.some((p) => p.id === pinId)) {
      showToast('Parameter is already pinned to the Sensitivity Panel.');
      return;
    }

    if (kind === 'member_depth') {
      const el = model.elements.find(
        (e)                      => e.kind === 'frame2d' && e.id === targetId
      );
      if (!el) return;
      setPinnedParams((prev) => [
        ...prev,
        {
          id: pinId,
          label: `Member ${el.id} Depth h`,
          kind: 'member_depth',
          elementId: el.id,
          baseValue: el.section.depthMm,
          multiplier: 1.0,
        },
      ]);
    } else if (kind === 'member_E') {
      const el = model.elements.find(
        (e)                      => e.kind === 'frame2d' && e.id === targetId
      );
      if (!el) return;
      setPinnedParams((prev) => [
        ...prev,
        {
          id: pinId,
          label: `Member ${el.id} Modulus E`,
          kind: 'member_E',
          elementId: el.id,
          baseValue: el.material.E,
          multiplier: 1.0,
        },
      ]);
    } else if (kind === 'node_spring_ky') {
      const n = model.nodes.find((item) => item.id === targetId);
      if (!n) return;
      const baseKy = n.springs.ky > 0 ? n.springs.ky : 25000;
      if (n.springs.ky === 0) {
        updateModelWithHistory((prev) => ({
          ...prev,
          nodes: prev.nodes.map((nd) =>
            nd.id === n.id ? { ...nd, springs: { ...nd.springs, ky: baseKy } } : nd
          ),
        }));
      }
      setPinnedParams((prev) => [
        ...prev,
        {
          id: pinId,
          label: `Node ${n.id} Spring ky`,
          kind: 'node_spring_ky',
          nodeId: n.id,
          baseValue: baseKy,
          multiplier: 1.0,
        },
      ]);
    } else if (kind === 'node_spring_krz') {
      const n = model.nodes.find((item) => item.id === targetId);
      if (!n) return;
      const baseKrz = n.springs.krz > 0 ? n.springs.krz : 15000;
      if (n.springs.krz === 0) {
        updateModelWithHistory((prev) => ({
          ...prev,
          nodes: prev.nodes.map((nd) =>
            nd.id === n.id ? { ...nd, springs: { ...nd.springs, krz: baseKrz } } : nd
          ),
        }));
      }
      setPinnedParams((prev) => [
        ...prev,
        {
          id: pinId,
          label: `Node ${n.id} Spring kθ`,
          kind: 'node_spring_krz',
          nodeId: n.id,
          baseValue: baseKrz,
          multiplier: 1.0,
        },
      ]);
    } else if (kind === 'load_magnitude') {
      const ld = model.loads.find((l) => l.id === targetId);
      if (!ld) return;
      const basePrimary =
        ld.kind === 'member_distributed'
          ? ld.w1
          : ld.kind === 'member_point'
            ? ld.p
            : ld.kind === 'nodal'
              ? Math.abs(ld.fy) >= Math.abs(ld.fx)
                ? ld.fy
                : ld.fx
              : 10;
      const baseSecondary = ld.kind === 'member_distributed' ? ld.w2 : undefined;

      setPinnedParams((prev) => [
        ...prev,
        {
          id: pinId,
          label: `Load ${ld.id} (${ld.label || ld.kind})`,
          kind: 'load_magnitude',
          loadId: ld.id,
          basePrimary,
          baseSecondary,
          multiplier: 1.0,
        },
      ]);
    }
  };

  // Real-time sensitivity slider handler: mutates model instantaneously without flooding undo stack
  const handleSlidePinnedParam = (pinId        , multiplier        ) => {
    const targetPin = pinnedParams.find((p) => p.id === pinId);
    if (!targetPin) return;

    setPinnedParams((prev) =>
      prev.map((p) => (p.id === pinId ? { ...p, multiplier } : p))
    );

    setModel((prev) => {
      if (targetPin.kind === 'member_depth') {
        const nextDepth = Math.max(20, Math.round(targetPin.baseValue * multiplier));
        return {
          ...prev,
          elements: prev.elements.map((el) => {
            if (el.id !== targetPin.elementId || el.kind !== 'frame2d') return el;
            const dimKey = el.section.shape === 'circular' ? 'd' : 'h';
            const nextDims = { ...el.section.dimensions, [dimKey]: nextDepth };
            return {
              ...el,
              section: computeCrossSection(el.section.shape, nextDims),
            };
          }),
        };
      }

      if (targetPin.kind === 'member_E') {
        const nextE = Number(Math.max(1, targetPin.baseValue * multiplier).toFixed(1));
        return {
          ...prev,
          elements: prev.elements.map((el) =>
            el.id === targetPin.elementId && el.kind === 'frame2d'
              ? { ...el, material: { ...el.material, E: nextE } }
              : el
          ),
        };
      }

      if (targetPin.kind === 'node_spring_ky') {
        const nextKy = Math.round(targetPin.baseValue * multiplier);
        return {
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === targetPin.nodeId
              ? { ...n, springs: { ...n.springs, ky: nextKy } }
              : n
          ),
        };
      }

      if (targetPin.kind === 'node_spring_krz') {
        const nextKrz = Math.round(targetPin.baseValue * multiplier);
        return {
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === targetPin.nodeId
              ? { ...n, springs: { ...n.springs, krz: nextKrz } }
              : n
          ),
        };
      }

      if (targetPin.kind === 'load_magnitude') {
        return {
          ...prev,
          loads: prev.loads.map((ld) => {
            if (ld.id !== targetPin.loadId) return ld;
            if (ld.kind === 'member_distributed') {
              return {
                ...ld,
                w1: Number((targetPin.basePrimary * multiplier).toFixed(2)),
                w2: Number(
                  ((targetPin.baseSecondary ?? targetPin.basePrimary) * multiplier).toFixed(2)
                ),
              };
            }
            if (ld.kind === 'member_point') {
              return {
                ...ld,
                p: Number((targetPin.basePrimary * multiplier).toFixed(2)),
              };
            }
            if (ld.kind === 'nodal') {
              if (Math.abs(ld.fy) >= Math.abs(ld.fx)) {
                return { ...ld, fy: Number((targetPin.basePrimary * multiplier).toFixed(2)) };
              }
              return { ...ld, fx: Number((targetPin.basePrimary * multiplier).toFixed(2)) };
            }
            return ld;
          }),
        };
      }

      return prev;
    });
  };

  const handleResetPinnedParams = () => {
    pinnedParams.forEach((p) => {
      handleSlidePinnedParam(p.id, 1.0);
    });
  };

  // JSON Export / Import
  const handleExportJson = () => {
    const json = JSON.stringify(model, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.name.toLowerCase().replace(/\s+/g, '_')}.fem.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported structural model to JSON.');
  };

  const handleImportJson = (jsonText        ) => {
    try {
      const parsed = JSON.parse(jsonText)                   ;
      if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.elements)) {
        showToast('Invalid structural model JSON schema.');
        return;
      }
      updateModelWithHistory(() => parsed, true);
      setViewport((vp) => fitModelToViewport(parsed.nodes, vp.width, vp.height, vp));
      showToast(`Imported "${parsed.name || 'Custom Model'}" successfully.`);
    } catch {
      showToast('Failed to parse JSON file.');
    }
  };

  return (
    React.createElement("div", { "className": "flex flex-col w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans" }, React.createElement(Toolbar, { "activePresetId": activePresetId, "onSelectPreset": handleSelectPreset, "activeTool": activeTool, "onSelectTool": (t) => {
          setActiveTool(t);
          setDrawStartPoint(null);
        }, "canUndo": undoStack.length > 0, "canRedo": redoStack.length > 0, "onUndo": handleUndo, "onRedo": handleRedo, "onExportJson": handleExportJson, "onImportJson": handleImportJson, "onZoomIn": () =>
          setViewport((vp) => ({ ...vp, zoom: Math.min(280, vp.zoom * 1.2) }))
        , "onZoomOut": () =>
          setViewport((vp) => ({ ...vp, zoom: Math.max(18, vp.zoom / 1.2) }))
        , "onFitView": () =>
          setViewport((vp) => fitModelToViewport(model.nodes, vp.width, vp.height, vp))
        , "coordSystem": viewport.coordSystem, "onToggleCoordSystem": () =>
          setViewport((vp) => ({
            ...vp,
            coordSystem: vp.coordSystem === 'cartesian' ? 'polar' : 'cartesian',
          }))
        , "solverOutput": solverOutput, "model": model }), React.createElement("main", { "className": "flex flex-1 min-h-0 relative overflow-hidden" }, React.createElement("div", { "ref": containerRef, "className": "relative flex-1 h-full overflow-hidden bg-slate-950", "onContextMenu": (e     ) => e.preventDefault() }, React.createElement(LayerTogglesBar, { "layers": layers, "onUpdateLayers": (patch) => setLayers((l) => ({ ...l, ...patch })), "hoverProbe": hoverProbe }), !solverOutput.stable ? (
            React.createElement("div", { "id": "unstable-structure-banner", "className": "absolute top-16 left-3 z-20 max-w-lg bg-rose-950/95 border border-rose-500 text-rose-100 px-3.5 py-2 rounded-lg shadow-2xl text-xs" }, React.createElement("div", { "className": "font-bold text-rose-300 uppercase tracking-wide mb-0.5" }, "Unstable Structure — Mechanism or Insufficient Restraints"), React.createElement("div", { "className": "text-rose-200/90 font-mono text-[11px]" }, solverOutput.instabilityReason ||
                  'Add supports, springs, or restrain free hinge mechanisms to restore stability.'))
          ) : null, toastMessage ? (
            React.createElement("div", { "className": "absolute top-16 right-4 z-30 bg-slate-900/95 border border-sky-400/60 text-sky-200 px-3 py-1.5 rounded-lg shadow-xl text-xs font-mono" }, toastMessage)
          ) : null, React.createElement("canvas", { "id": "structural-fem-canvas", "ref": canvasRef, "onMouseDown": handleCanvasMouseDown, "onMouseMove": handleCanvasMouseMove, "onMouseUp": handleCanvasMouseUp, "onWheel": handleCanvasWheel, "style": {
              width: `${viewport.width}px`,
              height: `${viewport.height}px`,
            }, "className": `block select-none ${
              activeTool === 'draw_member'
                ? 'cursor-crosshair'
                : activeTool === 'delete'
                  ? 'cursor-pointer'
                  : 'cursor-default'
            }` }), React.createElement(ContextualPopup, { "model": model, "selectedNodeId": selectedNodeId, "selectedElementId": selectedElementId, "selectedLoadId": selectedLoadId, "onUpdateModel": updateModelWithHistory, "onClose": () => {
              setSelectedNodeId(null);
              setSelectedElementId(null);
              setSelectedLoadId(null);
            }, "onDeleteEntity": handleDeleteSelected, "onPinParameter": handlePinParameter, "onQuickAddMemberLoad": handleQuickAddMemberLoad, "onQuickAddNodalLoad": handleQuickAddNodalLoad }), React.createElement("div", { "className": "absolute bottom-0 inset-x-0 h-7 bg-slate-900/90 backdrop-blur border-t border-slate-800 px-3 flex items-center justify-between text-[11px] font-mono text-slate-400 select-none pointer-events-none" }, React.createElement("div", { "className": "flex items-center gap-4" }, React.createElement("span", { "className": "text-sky-400 font-semibold" }, snapTarget
                  ? `X: ${snapTarget.x.toFixed(1)} m, Y: ${snapTarget.y.toFixed(1)} m (Z: 0.0 m)`
                  : 'X: 0.0 m, Y: 0.0 m'), React.createElement("span", { "className": "hidden sm:inline text-slate-500" }, "|"), React.createElement("span", { "className": "hidden sm:inline text-slate-300" }, activeTool === 'select'
                  ? 'Click any Member, Node, or Load to edit parameters · Drag background to pan · Scroll to zoom'
                  : activeTool === 'draw_member'
                    ? drawStartPoint
                      ? 'Click or release on end point (snaps to 0.1m grid, existing nodes, or T-splits members)'
                      : 'Click start point to draw new 1D Frame Member'
                    : activeTool === 'assign_support'
                      ? 'Click any node to cycle/edit support restraint (Fixed, Pinned, Roller, Inclined)'
                      : activeTool === 'add_nodal_load'
                        ? 'Click any node to add a concentrated Nodal Load'
                        : activeTool === 'add_member_load'
                          ? 'Click any member to add a Distributed (UDL/Trapezoidal) or Point Load'
                          : 'Click any Member, Node, or Load to delete it')), React.createElement("div", { "className": "flex items-center gap-3" }, React.createElement("span", null, "Nodes: ", model.nodes.length), React.createElement("span", null, "Members: ", model.elements.length), React.createElement("span", null, "Loads: ", model.loads.length), React.createElement("span", null, "Grid: 0.1 m")))), React.createElement(SensitivityPanel, { "model": model, "solverOutput": solverOutput, "layers": layers, "onUpdateLayers": (patch) => setLayers((l) => ({ ...l, ...patch })), "pinnedParams": pinnedParams, "onSlidePinnedParam": handleSlidePinnedParam, "onUnpinParam": (pinId) =>
            setPinnedParams((prev) => prev.filter((p) => p.id !== pinId))
          , "onResetPinnedParams": handleResetPinnedParams, "onAddQuickPin": handlePinParameter, "onSelectEntity": (kind, id) => {
            if (kind === 'node') {
              setSelectedNodeId(id);
              setSelectedElementId(null);
              setSelectedLoadId(null);
            } else if (kind === 'member') {
              setSelectedElementId(id);
              setSelectedNodeId(null);
              setSelectedLoadId(null);
            } else {
              setSelectedLoadId(id);
              setSelectedNodeId(null);
              setSelectedElementId(null);
            }
          } })))
  );
}

__exports.default = App;



  __exports.App = App;
  return __exports;
})();

// === Module: src/main.tsx (__mod_16) ===
__modules.__mod_16 = (function() {
  const __exports = {};
  const React = __modules.__mod_0.default ?? __modules.__mod_0; const { createRoot } = __modules.__mod_0;
const { App } = __modules.__mod_15;

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(React.createElement(App, null));
}



  
  return __exports;
})();
})();
