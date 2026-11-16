/**
 * Lightweight, Fine-Grained React 18-Compatible VDOM Runtime & Hooks Engine
 *
 * Keyed by virtual tree path (`__vpath`) so conditional siblings (`{cond ? <Popup/> : null}`)
 * never shift hook state paths or remount persistent DOM nodes like `<canvas>` or `<input>`.
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

  // Keep rawChildren structure (including null/boolean slots) so positional child indices
  // never shift when a conditional expression toggles between null and an element!
  normalizedProps.children = rawChildren;
  return {
    type,
    props: normalizedProps,
    children: rawChildren,
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

export function useState<T>(
  initialValue: T | (() => T)
): [T, (next: T | ((prev: T) => T)) => void] {
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
    for (let i = 0; i < node.length; i++) {
      const child = node[i];
      const k =
        child && typeof child === 'object' && child.key != null ? `k:${child.key}` : `i:${i}`;
      res.push(...expandVNode(child, `${path}/${k}`));
    }
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

  // Native DOM element: preserve slot index `i` across all rawChildren (even null slots)
  const expandedChildren: any[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const k =
      child && typeof child === 'object' && child.key != null ? `k:${child.key}` : `s:${i}`;
    expandedChildren.push(...expandVNode(child, `${path}/${node.type}/${k}`));
  }

  return [
    {
      type: node.type,
      props: node.props,
      children: expandedChildren,
      key: node.key,
      path: `${path}/${node.type}`,
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
  const handlersMap: Record<string, any> = (dom as any).__handlers || {};
  (dom as any).__listeners = prevListeners;
  (dom as any).__handlers = handlersMap;

  for (const k of Object.keys(prevProps)) {
    if (k === 'children' || k === 'ref') continue;
    if (!(k in nextProps)) {
      if (k.startsWith('on') && k.length > 2) {
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
        delete handlersMap[evtName];
        if (prevListeners[evtName]) {
          dom.removeEventListener(evtName, prevListeners[evtName]);
          delete prevListeners[evtName];
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

      handlersMap[evtName] = val;
      if (!prevListeners[evtName]) {
        const stableWrapper = (evt: Event) => {
          const fn = (dom as any).__handlers?.[evtName];
          if (typeof fn === 'function') fn(evt);
        };
        prevListeners[evtName] = stableWrapper;
        dom.addEventListener(evtName, stableWrapper);
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

/**
 * Reconcile children by matching existing DOM nodes via `__vpath` first (falling back to index/tag),
 * so inserting/removing conditional banners or pop-ups never destroys sibling `<canvas>` or `<input>` elements.
 */
function reconcileChildren(parentDom: Node, nextVNodes: any[], isSvgContext: boolean) {
  const existingNodes = Array.from(parentDom.childNodes);
  const byPath = new Map<string, Node>();
  for (const n of existingNodes) {
    const p = (n as any).__vpath;
    if (p) byPath.set(p, n);
  }

  const usedDomNodes = new Set<Node>();
  const resolvedDomNodes: Node[] = [];

  for (let i = 0; i < nextVNodes.length; i++) {
    const vnode = nextVNodes[i];
    let matched = byPath.get(vnode.path);

    if (matched && usedDomNodes.has(matched)) {
      matched = undefined;
    }

    if (vnode.type === '#text') {
      let textNode: Node;
      if (matched && matched.nodeType === Node.TEXT_NODE) {
        textNode = matched;
        if (textNode.nodeValue !== vnode.text) {
          textNode.nodeValue = vnode.text;
        }
      } else {
        textNode = document.createTextNode(vnode.text);
      }
      (textNode as any).__vpath = vnode.path;
      usedDomNodes.add(textNode);
      resolvedDomNodes.push(textNode);
      continue;
    }

    const isSvg = isSvgContext || SVG_TAGS.has(vnode.type);
    const tagMatch =
      matched &&
      matched.nodeType === Node.ELEMENT_NODE &&
      (matched as Element).tagName.toLowerCase() === vnode.type.toLowerCase();

    let domEl: HTMLElement | SVGElement;
    if (tagMatch) {
      domEl = matched as HTMLElement | SVGElement;
      const prevProps = (domEl as any).__vprops || {};
      applyProps(domEl, vnode.props, prevProps, isSvg);
      (domEl as any).__vprops = vnode.props;
    } else {
      domEl = isSvg
        ? document.createElementNS('http://www.w3.org/2000/svg', vnode.type)
        : document.createElement(vnode.type);
      applyProps(domEl, vnode.props, {}, isSvg);
      (domEl as any).__vprops = vnode.props;
    }

    (domEl as any).__vpath = vnode.path;
    usedDomNodes.add(domEl);
    resolvedDomNodes.push(domEl);

    reconcileChildren(domEl, vnode.children, isSvg);

    if (!isSvg && vnode.type === 'select' && vnode.props.value !== undefined) {
      const selStr = String(vnode.props.value);
      if ((domEl as HTMLSelectElement).value !== selStr) {
        (domEl as HTMLSelectElement).value = selStr;
      }
    }
  }

  // Remove any old DOM nodes that are no longer in resolvedDomNodes
  for (const oldNode of existingNodes) {
    if (!usedDomNodes.has(oldNode)) {
      parentDom.removeChild(oldNode);
    }
  }

  // Ensure exact DOM order without disturbing already-ordered persistent nodes (like <canvas>)
  for (let i = 0; i < resolvedDomNodes.length; i++) {
    const desired = resolvedDomNodes[i];
    const currentAtI = parentDom.childNodes[i];
    if (currentAtI !== desired) {
      if (typeof (parentDom as any).insertBefore === 'function') {
        parentDom.insertBefore(desired, currentAtI || null);
      } else {
        parentDom.appendChild(desired);
      }
    }
  }
}

export function createRoot(container: HTMLElement) {
  let rootVNode: any = null;
  let isRendering = false;
  let dirtyDuringRender = false;

  const performRender = () => {
    if (!rootVNode) return;
    if (isRendering) {
      dirtyDuringRender = true;
      return;
    }
    isRendering = true;
    try {
      do {
        dirtyDuringRender = false;
        usedPathsInPass = new Set<string>();
        pendingEffectsQueue = [];

        const expanded = expandVNode(rootVNode, 'root');
        reconcileChildren(container, expanded, false);

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

        const effects = [...pendingEffectsQueue];
        pendingEffectsQueue = [];
        for (const eff of effects) {
          eff();
        }
      } while (dirtyDuringRender);
    } finally {
      isRendering = false;
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
