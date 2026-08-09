/**
 * Sort + projection model for the document list.
 *
 * Both are applied server-side (`get-documents` passes them straight to
 * `find().sort()` / `find(..., { projection })`), so they survive paging and
 * cost nothing on the renderer side. Everything here is pure so it can be
 * unit-tested; the only impure part is the localStorage pair at the bottom.
 */

export type SortDir = 1 | -1;
export interface SortKey { field: string; dir: SortDir }

/**
 * One click on a column header.
 *
 * Plain click: the clicked field becomes the *only* key and cycles
 * asc → desc → unsorted. Clicking a different field always restarts at asc.
 * Additive (shift-click): the field is appended as a secondary key and cycles
 * asc → desc → removed, leaving the other keys and their order alone.
 */
export function cycleSort(keys: SortKey[], field: string, additive = false): SortKey[] {
  const current = keys.find(k => k.field === field);
  if (!additive) {
    if (!current || keys.length > 1) return [{ field, dir: 1 }];
    return current.dir === 1 ? [{ field, dir: -1 }] : [];
  }
  if (!current) return [...keys, { field, dir: 1 }];
  if (current.dir === 1) return keys.map(k => k.field === field ? { field, dir: -1 as SortDir } : k);
  return keys.filter(k => k.field !== field);
}

/**
 * "ascending" / "descending" plus a concrete example of what that means for
 * the three types people actually sort by — an arrow alone leaves everyone
 * guessing which end a date sorts from.
 */
export const SORT_DIR_LABEL: Record<SortDir, string> = { 1: 'ascending', [-1]: 'descending' };
export const SORT_DIR_HINT: Record<SortDir, string> = {
  1: 'A→Z · 1→9 · oldest first',
  [-1]: 'Z→A · 9→1 · newest first',
};

/** Full `title` text for a sortable column header. */
export function sortTooltip(field: string, current: SortDir | null): string {
  const next = current === 1 ? 'sort descending' : current === -1 ? 'remove the sort' : 'sort ascending';
  const state = current
    ? `Sorted ${SORT_DIR_LABEL[current]} (${SORT_DIR_HINT[current]}).`
    : `Not sorted by ${field}.`;
  return `${state}\nClick to ${next}. Shift-click to add it as another sort key.`;
}

/** Mongo sort document, or null when nothing is sorted (so the caller can skip `.sort()`). */
export function buildSort(keys: SortKey[]): Record<string, SortDir> | null {
  if (keys.length === 0) return null;
  const out: Record<string, SortDir> = {};
  for (const k of keys) out[k.field] = k.dir;
  return out;
}

/**
 * Exclusion projection: new fields keep showing up on their own, and `_id` is
 * never excludable — edit, delete and the selection model all key off it.
 */
export function buildProjection(hidden: string[]): Record<string, 0> | null {
  const fields = hidden.filter(f => f !== '_id');
  if (fields.length === 0) return null;
  const out: Record<string, 0> = {};
  for (const f of fields) out[f] = 0;
  return out;
}

/**
 * Field names to offer in the column picker. A hidden field is by definition
 * absent from the documents that come back, so the saved hidden list is the
 * only place its name still exists — union the two or hiding a field would
 * make it impossible to bring back.
 */
export function knownFields(docs: any[], hidden: string[]): string[] {
  const seen = new Set<string>();
  for (const doc of docs) for (const k of Object.keys(doc)) seen.add(k);
  for (const f of hidden) seen.add(f);
  return Array.from(seen);
}

export function toggleHidden(hidden: string[], field: string): string[] {
  if (field === '_id') return hidden;
  return hidden.includes(field) ? hidden.filter(f => f !== field) : [...hidden, field];
}

const STORAGE_KEY = 'hiddenFields';

const mapKey = (connectionId: string, db: string, col: string) => `${connectionId}|${db}|${col}`;

function loadAll(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function loadHiddenFields(connectionId: string, db: string, col: string): string[] {
  return loadAll()[mapKey(connectionId, db, col)] ?? [];
}

export function saveHiddenFields(connectionId: string, db: string, col: string, hidden: string[]) {
  const all = loadAll();
  const key = mapKey(connectionId, db, col);
  if (hidden.length === 0) delete all[key];
  else all[key] = hidden;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
