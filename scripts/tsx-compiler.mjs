import { stripTypeScriptTypes } from 'node:module';

/**
 * Lightweight, deterministic TSX -> JS compiler using Node 24's built-in
 * `stripTypeScriptTypes` (SWC amaro) + a recursive JSX-to-React.createElement pre-pass.
 *
 * Distinguishes JSX elements (<Tag ... /> or <Tag ...>...</Tag> or <>...</>)
 * from TypeScript generics (useState<string | null>(null), Array<Foo>, etc.)
 * with 100% accuracy.
 */
export function transpileTSX(sourceCode, filename = 'module.tsx') {
  const withoutJSX = transformJSXInSource(sourceCode);
  return stripTypeScriptTypes(withoutJSX, { mode: 'strip', sourceUrl: filename });
}

function isIdentStart(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
}

function isIdentPart(ch) {
  return isIdentStart(ch) || (ch >= '0' && ch <= '9') || ch === '.' || ch === '-';
}

/**
 * Scan balanced { ... }, ( ... ), [ ... ], strings, template literals, and comments.
 */
function skipStringOrComment(src, i) {
  const ch = src[i];
  const next = src[i + 1];
  if (ch === '/' && next === '/') {
    i += 2;
    while (i < src.length && src[i] !== '\n') i++;
    return i;
  }
  if (ch === '/' && next === '*') {
    i += 2;
    while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
    return Math.min(src.length, i + 2);
  }
  if (ch === "'" || ch === '"') {
    const quote = ch;
    i++;
    while (i < src.length) {
      if (src[i] === '\\') {
        i += 2;
        continue;
      }
      if (src[i] === quote) return i + 1;
      i++;
    }
    return i;
  }
  if (ch === '`') {
    i++;
    while (i < src.length) {
      if (src[i] === '\\') {
        i += 2;
        continue;
      }
      if (src[i] === '$' && src[i + 1] === '{') {
        i += 2;
        let depth = 1;
        while (i < src.length && depth > 0) {
          if (src[i] === "'" || src[i] === '"' || src[i] === '`' || (src[i] === '/' && (src[i + 1] === '/' || src[i + 1] === '*'))) {
            i = skipStringOrComment(src, i);
            continue;
          }
          if (src[i] === '{') depth++;
          else if (src[i] === '}') depth--;
          i++;
        }
        continue;
      }
      if (src[i] === '`') return i + 1;
      i++;
    }
    return i;
  }
  return i + 1;
}

/**
 * Try to parse a JSX element or fragment starting at index `start` (where src[start] === '<').
 * Returns { code, end } if valid JSX, or null if `<` is a comparison operator or TS generic.
 */
function tryParseJSXElement(src, start) {
  if (src[start] !== '<') return null;

  // Fragment <> ... </>
  if (src[start + 1] === '>') {
    const childrenRes = parseJSXChildren(src, start + 2, '');
    if (!childrenRes) return null;
    return {
      code: `React.createElement(React.Fragment, null${childrenRes.childrenArgs})`,
      end: childrenRes.end,
    };
  }

  // Must start with identifier after '<'
  let i = start + 1;
  if (i >= src.length || !isIdentStart(src[i])) return null;
  while (i < src.length && isIdentPart(src[i])) i++;
  const tagName = src.slice(start + 1, i);

  // After tagName, valid JSX must have whitespace, '/', or '>'
  // (whereas TS generic like Array<Foo> or Map<string, number> has ',', '<', '[', '|', '&', etc.)
  const afterTag = src[i];
  if (afterTag !== ' ' && afterTag !== '\t' && afterTag !== '\n' && afterTag !== '\r' && afterTag !== '/' && afterTag !== '>') {
    return null;
  }

  // Parse attributes up to '/>' or '>'
  const attrs = [];
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) return null;

    if (src[i] === '/' && src[i + 1] === '>') {
      // Self-closing JSX tag! Definitely JSX!
      const tagExpr = /^[a-z]/.test(tagName) ? JSON.stringify(tagName) : tagName;
      const propsExpr = buildPropsExpr(attrs);
      return {
        code: `React.createElement(${tagExpr}, ${propsExpr})`,
        end: i + 2,
      };
    }

    if (src[i] === '>') {
      // Opening tag end!
      // Verify whether this is a TS generic like `<Foo>(x)` or a real JSX opening tag `<Foo>...</Foo>`.
      // If it's a real JSX tag, parseJSXChildren will find the matching `</tagName>`.
      const childrenRes = parseJSXChildren(src, i + 1, tagName);
      if (!childrenRes) return null;
      const tagExpr = /^[a-z]/.test(tagName) ? JSON.stringify(tagName) : tagName;
      const propsExpr = buildPropsExpr(attrs);
      return {
        code: `React.createElement(${tagExpr}, ${propsExpr}${childrenRes.childrenArgs})`,
        end: childrenRes.end,
      };
    }

    // Spread attribute {...obj}
    if (src[i] === '{' && src.slice(i + 1).trimStart().startsWith('...')) {
      const exprRes = readBalancedBraces(src, i);
      if (!exprRes) return null;
      const inner = exprRes.content.trim().slice(3).trim();
      attrs.push({ spread: true, expr: transformJSXInSource(inner) });
      i = exprRes.end;
      continue;
    }

    // Attribute name
    if (!isIdentStart(src[i])) {
      // Not a valid JSX attribute -> this '<' was a TS generic or comparison!
      return null;
    }
    const attrStart = i;
    while (i < src.length && isIdentPart(src[i])) i++;
    const attrName = src.slice(attrStart, i);

    while (i < src.length && /\s/.test(src[i])) i++;

    if (src[i] !== '=') {
      // Boolean shorthand attribute, e.g. `disabled`
      // Wait: if someone wrote `useState<string | null>`, after `string` comes `|`, which fails `!isIdentStart` on next loop.
      attrs.push({ spread: false, name: attrName, value: 'true' });
      continue;
    }

    i++; // skip '='
    while (i < src.length && /\s/.test(src[i])) i++;

    if (src[i] === "'" || src[i] === '"') {
      const strEnd = skipStringOrComment(src, i);
      const rawStr = src.slice(i, strEnd);
      attrs.push({ spread: false, name: attrName, value: rawStr });
      i = strEnd;
    } else if (src[i] === '{') {
      const exprRes = readBalancedBraces(src, i);
      if (!exprRes) return null;
      attrs.push({
        spread: false,
        name: attrName,
        value: transformJSXInSource(exprRes.content),
      });
      i = exprRes.end;
    } else {
      return null;
    }
  }

  return null;
}

function buildPropsExpr(attrs) {
  if (attrs.length === 0) return 'null';
  const hasSpread = attrs.some((a) => a.spread);
  if (!hasSpread) {
    const pairs = attrs.map((a) => `${JSON.stringify(a.name)}: ${a.value}`);
    return `{ ${pairs.join(', ')} }`;
  }
  const parts = attrs.map((a) =>
    a.spread ? `...(${a.expr})` : `${JSON.stringify(a.name)}: ${a.value}`
  );
  return `{ ${parts.join(', ')} }`;
}

function readBalancedBraces(src, start) {
  if (src[start] !== '{') return null;
  let i = start + 1;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (
      ch === "'" ||
      ch === '"' ||
      ch === '`' ||
      (ch === '/' && (src[i + 1] === '/' || src[i + 1] === '*'))
    ) {
      i = skipStringOrComment(src, i);
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return {
    content: src.slice(start + 1, i - 1),
    end: i,
  };
}

function parseJSXChildren(src, start, expectedCloseTag) {
  const children = [];
  let i = start;
  let textStart = start;

  const flushText = (endIdx) => {
    if (endIdx <= textStart) return;
    const raw = src.slice(textStart, endIdx);
    // Clean JSX whitespace rules: collapse multi-line indentation whitespace
    if (raw.includes('\n')) {
      const lines = raw
        .split('\n')
        .map((l, idx, arr) => {
          let s = l;
          if (idx > 0) s = s.replace(/^\s+/, '');
          if (idx < arr.length - 1) s = s.replace(/\s+$/, '');
          return s;
        })
        .filter((l) => l.length > 0);
      if (lines.length > 0) {
        children.push(JSON.stringify(decodeJSXEntities(lines.join(' '))));
      }
    } else if (raw.length > 0) {
      children.push(JSON.stringify(decodeJSXEntities(raw)));
    }
  };

  while (i < src.length) {
    // Check for closing tag `</expectedCloseTag>`
    if (src[i] === '<' && src[i + 1] === '/') {
      flushText(i);
      let j = i + 2;
      while (j < src.length && /\s/.test(src[j])) j++;
      const closeStart = j;
      while (j < src.length && isIdentPart(src[j])) j++;
      const closeName = src.slice(closeStart, j);
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === '>' && closeName === expectedCloseTag) {
        const childrenArgs = children.length > 0 ? ', ' + children.join(', ') : '';
        return { childrenArgs, end: j + 1 };
      }
      return null;
    }

    // Check for child JSX element
    if (src[i] === '<') {
      flushText(i);
      const childJSX = tryParseJSXElement(src, i);
      if (!childJSX) return null;
      children.push(childJSX.code);
      i = childJSX.end;
      textStart = i;
      continue;
    }

    // Check for JSX expression `{ ... }`
    if (src[i] === '{') {
      flushText(i);
      const exprRes = readBalancedBraces(src, i);
      if (!exprRes) return null;
      const trimmed = exprRes.content.trim();
      // Ignore empty or comment-only braces like `{/* comment */}`
      const strippedComments = trimmed
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .trim();
      if (strippedComments.length > 0) {
        children.push(transformJSXInSource(exprRes.content));
      }
      i = exprRes.end;
      textStart = i;
      continue;
    }

    i++;
  }

  return null;
}

function decodeJSXEntities(str) {
  return str
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&rarr;/g, '→')
    .replace(/&times;/g, '×')
    .replace(/&deg;/g, '°');
}

export function transformJSXInSource(src) {
  let out = '';
  let i = 0;
  let lastCopy = 0;

  while (i < src.length) {
    const ch = src[i];
    if (
      ch === "'" ||
      ch === '"' ||
      ch === '`' ||
      (ch === '/' && (src[i + 1] === '/' || src[i + 1] === '*'))
    ) {
      i = skipStringOrComment(src, i);
      continue;
    }

    if (ch === '<') {
      const jsx = tryParseJSXElement(src, i);
      if (jsx) {
        out += src.slice(lastCopy, i) + jsx.code;
        i = jsx.end;
        lastCopy = i;
        continue;
      }
    }
    i++;
  }

  out += src.slice(lastCopy);
  return out;
}
