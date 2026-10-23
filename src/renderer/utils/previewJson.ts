// Read-only previews of a filter / sort (the query panel's "Query preview",
// the custom JSON filter card, the status bar). A condition value can be
// thousands of characters long, and printed whole it made the preview — and
// the status bar under it — big enough to cover the rest of the UI. Long
// string values are cut here instead, keeping the structure of the filter
// readable; the full text is one click away in the Filter (JSON) modal.

export const PREVIEW_STRING_MAX = 60;

/** Deep copy of `value` with every string longer than `max` cut to `max` chars + "…". */
export function clipStrings(value: unknown, max = PREVIEW_STRING_MAX): unknown {
  if (typeof value === 'string') return value.length > max ? value.slice(0, max) + '…' : value;
  if (Array.isArray(value)) return value.map(v => clipStrings(v, max));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[clipStrings(k, max) as string] = clipStrings(v, max);
    return out;
  }
  return value;
}

/** `JSON.stringify` of the clipped value; `indent` as in JSON.stringify. */
export function previewJson(value: unknown, indent?: number, max = PREVIEW_STRING_MAX): string {
  return JSON.stringify(clipStrings(value, max), null, indent);
}

/** One-line filter + sort, as the status bar shows it. Empty when there is neither. */
export function queryLine(filter: unknown, sort: unknown, max = PREVIEW_STRING_MAX): string {
  const parts: string[] = [];
  if (filter && typeof filter === 'object' && Object.keys(filter).length > 0) parts.push(previewJson(filter, undefined, max));
  if (sort && typeof sort === 'object' && Object.keys(sort).length > 0) parts.push('sort ' + previewJson(sort, undefined, max));
  return parts.join(' · ');
}
