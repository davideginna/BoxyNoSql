/**
 * Where a dotted path sits in the document editor's text, so the edit modal's
 * "Changes" panel can show the line that was actually changed and jump to it.
 *
 * A small scanner instead of a parser: the text is the editor dialect
 * (`ObjectId("…")`, `ISODate("…")`), and only strings and brackets matter for
 * finding a key. The diff never descends into arrays, so keys under an array
 * get a marker that no path can match. A path that ends inside a shell-style
 * value (`_id.$oid`, which the text spells `ObjectId("…")`) resolves to its
 * deepest key that is in the text.
 */

const IN_ARRAY = '\u0000[]';

/** 1-based line of the key at `path` ("a.b.c"), or the deepest prefix found; `(root)` is line 1. */
export function lineOfPath(text: string, path: string): number | null {
  if (path === '(root)') return 1;
  const target = path.split('.');
  const stack: { array: boolean; key: string | null }[] = [];
  let line = 1;
  let best: { depth: number; line: number } | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') { line++; continue; }
    if (ch === '{' || ch === '[') { stack.push({ array: ch === '[', key: null }); continue; }
    if (ch === '}' || ch === ']') { stack.pop(); continue; }
    if (ch !== '"' && ch !== "'") continue;

    const start = i;
    let str = '';
    for (i++; i < text.length && text[i] !== ch; i++) {
      if (text[i] === '\\') { str += text[i + 1] ?? ''; i++; } else str += text[i];
    }
    let j = i + 1;
    while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++;
    const top = stack[stack.length - 1];
    if (text[j] !== ':' || !top || top.array) continue;

    top.key = str;
    const keys = stack.map(f => (f.array ? IN_ARRAY : f.key ?? ''));
    let depth = 0;
    while (depth < keys.length && depth < target.length && keys[depth] === target[depth]) depth++;
    if (depth === keys.length && (!best || depth > best.depth)) {
      best = { depth, line: line + countNewlines(text, start, i) };
      if (depth === target.length) return best.line;
    }
  }
  return best?.line ?? null;
}

function countNewlines(text: string, from: number, to: number): number {
  let n = 0;
  for (let k = from; k < to; k++) if (text[k] === '\n') n++;
  return n;
}

/** The text of a 1-based line, trimmed, plus its offsets for selecting it in the editor. */
export function lineAt(text: string, line: number): { text: string; start: number; end: number } | null {
  let start = 0;
  for (let n = 1; n < line; n++) {
    const nl = text.indexOf('\n', start);
    if (nl === -1) return null;
    start = nl + 1;
  }
  const nl = text.indexOf('\n', start);
  const end = nl === -1 ? text.length : nl;
  const raw = text.slice(start, end);
  const lead = raw.length - raw.trimStart().length;
  return { text: raw.trim(), start: start + lead, end: start + raw.trimEnd().length };
}
