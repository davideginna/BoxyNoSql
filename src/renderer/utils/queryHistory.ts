/**
 * Query history and saved queries.
 *
 * One flat list in `localStorage['queryHistory']` covers all three runners —
 * the document filter, the query terminal and the aggregation builder — because
 * they only differ by `kind` and by what they put in `body`. `body` is an
 * opaque string here: each view serializes and parses its own shape, so this
 * module never has to know about conditions, code or pipeline stages.
 *
 * An entry with a `name` is *saved*: it survives trimming and shows in its own
 * section. Everything else is history, capped per collection and per kind.
 */

export type QueryKind = 'filter' | 'query' | 'aggregation';

export interface QueryEntry {
  id: string;
  kind: QueryKind;
  /** `connectionId|db|col` — history is per collection. */
  scope: string;
  body: string;
  /** One-line preview built by the view that recorded the run. */
  label: string;
  /** Set = saved by the user. */
  name?: string;
  at: number;
}

export interface RunInput {
  kind: QueryKind;
  scope: string;
  body: string;
  label: string;
}

const STORAGE_KEY = 'queryHistory';

/** Unnamed entries kept per (kind, scope). Saved ones are never trimmed. */
export const HISTORY_LIMIT = 25;

export const scopeKey = (connectionId: string, db: string, col: string) => `${connectionId}|${db}|${col}`;

export function loadQueries(): QueryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveQueries(entries: QueryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

let seq = 0;
const newId = (now: number) => `${now}-${++seq}`;

/**
 * Record a run. Re-running something already in the list moves it back to the
 * top instead of adding a duplicate — otherwise hitting Run three times in a
 * row would fill the history with the same query.
 */
export function recordRun(entries: QueryEntry[], run: RunInput, now = Date.now()): QueryEntry[] {
  const existing = entries.find(e => e.kind === run.kind && e.scope === run.scope && e.body === run.body);
  const next = existing
    ? entries.map(e => e.id === existing.id ? { ...e, at: now, label: run.label } : e)
    : [...entries, { ...run, id: newId(now), at: now }];
  return trim(next, run.kind, run.scope);
}

function trim(entries: QueryEntry[], kind: QueryKind, scope: string): QueryEntry[] {
  const inScope = entries.filter(e => e.kind === kind && e.scope === scope && !e.name);
  if (inScope.length <= HISTORY_LIMIT) return entries;
  const doomed = new Set(
    [...inScope].sort((a, b) => b.at - a.at).slice(HISTORY_LIMIT).map(e => e.id)
  );
  return entries.filter(e => !doomed.has(e.id));
}

/** Name an entry to save it; pass null to demote it back to plain history. */
export function setName(entries: QueryEntry[], id: string, name: string | null): QueryEntry[] {
  return entries.map(e => {
    if (e.id !== id) return e;
    const { name: _dropped, ...rest } = e;
    return name ? { ...rest, name } : rest;
  });
}

export function removeQuery(entries: QueryEntry[], id: string): QueryEntry[] {
  return entries.filter(e => e.id !== id);
}

/** Everything for one collection and one runner, newest first, saved apart. */
export function forScope(entries: QueryEntry[], kind: QueryKind, scope: string): { saved: QueryEntry[]; recent: QueryEntry[] } {
  const mine = entries.filter(e => e.kind === kind && e.scope === scope).sort((a, b) => b.at - a.at);
  return { saved: mine.filter(e => e.name), recent: mine.filter(e => !e.name) };
}

/** Compact, single-line preview for the menu. */
export function previewLabel(text: string, max = 70): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max) + '…' : flat;
}
