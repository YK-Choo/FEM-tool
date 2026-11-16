/**
 * Lightweight, Fine-Grained React 18-Compatible VDOM Runtime & Hooks Engine
 *
 * Preserves DOM nodes (<canvas>, focused <input>, active range sliders, SVG icons)
 * across state updates for smooth 60fps CAD interaction and real-time sensitivity sliders.
 */

export const Fragment = Symbol.for('react.fragment');

export interface VNode {
  type: any;
  props: Record<string, any>;
  children: any[];
  key: string | number | null;
}

export function createElement(
  type: any,
  props: Record<string, any> | null,
  ...rawChildren: any[]
): VNode {
  const normalizedProps: Record<string, any> = props ? { ...props } : {};
  const key = normalizedProps.key !== undefined ? normalizedProps.key : null;
  delete normalizedProps.key;

  const flatChildren: any[] = [];
  const flatten = (arr: any[]) => {
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

interface ComponentInstance {
  hooks: any[];
  hookIndex: number;
  pendingEffects: Array<() => void>;
}

let currentInstance: ComponentInstance | null = null;
let rootRenderScheduled = false;
let activeRootRender: (() => void) | null = null;

function scheduleRender() {
  if (rootRenderScheduled || !activeRootRender) return;
  rootRenderScheduled = true;
  queueMicrotask(() => {
    rootRenderScheduled = false;
    if (activeRootRender) activeRootRender();
  });
}

export function flushSyncRender() {
  rootRenderScheduled = false;
  if (activeRootRender) activeRootRender();
}

export function useState<T>(initialValue: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  if (!currentInstance) throw new Error('useState called outside component');
  const inst = currentInstance;
  const idx = inst.hookIndex++;

  if (idx >= inst.hooks.length) {
    const init =
      typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
    inst.hooks.push(init);
  }

  const setState = (next: T | ((prev: T) => T)) => {
    const prev = inst.hooks[idx];
    const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    if (!Object.is(prev, resolved)) {
      inst.hooks[idx] = resolved;
      scheduleRender();
    }
  };

  return [inst.hooks[idx], setState];
}

export function useRef<T>(initialValue: T): { current: T } {
  if (!currentInstance) throw new Error('useRef called outside component');
  const inst = currentInstance;
  const idx = inst.hookIndex++;
  if (idx >= inst.hooks.length) {
    inst.hooks.push({ current: initialValue });
  }
  return inst.hooks[idx];
}

export function useMemo<T>(factory: () => T, deps?: any[]): T {
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

export function useCallback<T extends (...args: any[]) => any>(cb: T, deps?: any[]): T {
  return useMemo(() => cb, deps);
}

export function useEffect(effect: () => void | (() => void), deps?: any[]): void {
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

function areDepsEqual(a: any[] | undefined, b: any[] | undefined): boolean {
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

const SVG_ATTR_MAP: Record<string, string> = {
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
const componentInstances = new Map<string, ComponentInstance>();
let usedPathsInPass = new Set<string>();
let pendingEffectsQueue: Array<() => void> = [];

function expandVNode(node: any, path: string): any[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return [];
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return [{ type: '#text', text: String(node), key: null, path }];
  }
  if (Array.isArray(node)) {
    const res: any[] = [];
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
    let rendered: any;
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
  const expandedChildren: any[] = [];
  node.children.forEach((child: any, i: number) => {
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
  dom: HTMLElement | SVGElement,
  nextProps: Record<string, any>,
  prevProps: Record<string, any>,
  isSvg: boolean
) {
  const prevListeners: Record<string, any> = (dom as any).__listeners || {};
  (dom as any).__listeners = prevListeners;

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
        (dom as HTMLInputElement).type !== 'checkbox' &&
        (dom as HTMLInputElement).type !== 'file'
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
      const styleObj = (dom as HTMLElement).style;
      const prevStyle = prevProps.style || {};
      for (const sk of Object.keys(prevStyle)) {
        if (!(sk in val)) (styleObj as any)[sk] = '';
      }
      for (const [sk, sv] of Object.entries(val)) {
        (styleObj as any)[sk] = sv ?? '';
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
        if ((dom as HTMLInputElement).value !== strVal) {
          (dom as HTMLInputElement).value = strVal;
        }
      } else if (k === 'checked') {
        (dom as HTMLInputElement).checked = Boolean(val);
      } else if (k === 'disabled') {
        (dom as HTMLInputElement).disabled = Boolean(val);
      } else if (k === 'selected') {
        (dom as HTMLOptionElement).selected = Boolean(val);
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
  parentDom: Node,
  nextVNodes: any[],
  isSvgContext: boolean
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
      (existing as Element).tagName.toLowerCase() === vnode.type.toLowerCase();

    let domEl: HTMLElement | SVGElement;
    if (tagMatch) {
      domEl = existing as HTMLElement | SVGElement;
      const prevProps = (domEl as any).__vprops || {};
      applyProps(domEl, vnode.props, prevProps, isSvg);
      (domEl as any).__vprops = vnode.props;
    } else {
      domEl = isSvg
        ? document.createElementNS('http://www.w3.org/2000/svg', vnode.type)
        : document.createElement(vnode.type);
      applyProps(domEl, vnode.props, {}, isSvg);
      (domEl as any).__vprops = vnode.props;
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
      if ((domEl as HTMLSelectElement).value !== selStr) {
        (domEl as HTMLSelectElement).value = selStr;
      }
    }
  }

  // Remove any extra trailing DOM nodes
  while (parentDom.childNodes.length > nextVNodes.length) {
    const last = parentDom.lastChild;
    if (last) parentDom.removeChild(last);
  }
}

export function createRoot(container: HTMLElement) {
  let rootVNode: any = null;

  const performRender = () => {
    if (!rootVNode) return;
    usedPathsInPass = new Set<string>();
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
    render(vnode: any) {
      rootVNode = vnode;
      performRender();
    },
  };
}

export const React = {
  createElement,
  Fragment,
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
};

export default React;
