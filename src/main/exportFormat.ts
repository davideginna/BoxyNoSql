/**
 * Serialization for exports. Kept electron-free and side-effect-free so it can
 * be unit-tested; `main.ts` owns the save dialog and the file stream.
 *
 * Documents arriving here have already been through `serializeDoc()`, so the
 * values are JSON-safe (`{$oid}`, ISO strings, hex) and what lands in the file
 * is exactly what the UI showed.
 */

export type ExportFormat = 'json' | 'ndjson' | 'csv';

export const EXTENSIONS: Record<ExportFormat, string> = { json: 'json', ndjson: 'ndjson', csv: 'csv' };

export function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: any[]): string {
  return values.map(csvEscape).join(',');
}

/** Union of the top-level keys, in first-seen order. Mutates and returns `into`. */
export function collectKeys(docs: any[], into = new Set<string>()): Set<string> {
  for (const doc of docs) {
    if (doc && typeof doc === 'object') for (const k of Object.keys(doc)) into.add(k);
  }
  return into;
}

/** `users-2026-08-09.json`, `users-filtered-2026-08-09.csv`. */
export function defaultFileName(base: string, format: ExportFormat, filtered = false, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  const safe = base.replace(/[^\w.-]+/g, '_') || 'export';
  return `${safe}${filtered ? '-filtered' : ''}-${day}.${EXTENSIONS[format]}`;
}

export function dialogFilters(format: ExportFormat): { name: string; extensions: string[] }[] {
  const named: Record<ExportFormat, string> = { json: 'JSON', ndjson: 'NDJSON', csv: 'CSV' };
  return [
    { name: named[format], extensions: [EXTENSIONS[format]] },
    { name: 'All files', extensions: ['*'] },
  ];
}

/**
 * Incremental writer: one call per document, so a 50k-document export never
 * holds more than one document plus the key set in memory. CSV needs its keys
 * up front — `main.ts` gets them from a first pass over the cursor.
 */
export function createChunkWriter(format: ExportFormat, keys?: string[]): {
  head: () => string;
  row: (doc: any) => string;
  tail: () => string;
} {
  if (format === 'csv') {
    const cols = keys ?? [];
    return {
      head: () => cols.length > 0 ? csvRow(cols) + '\n' : '',
      row: doc => csvRow(cols.map(k => doc?.[k])) + '\n',
      tail: () => '',
    };
  }
  if (format === 'ndjson') {
    return { head: () => '', row: doc => JSON.stringify(doc) + '\n', tail: () => '' };
  }
  let first = true;
  return {
    head: () => '[',
    row: doc => {
      const sep = first ? '\n' : ',\n';
      first = false;
      return sep + JSON.stringify(doc, null, 2).split('\n').map(l => '  ' + l).join('\n');
    },
    tail: () => (first ? ']\n' : '\n]\n'),
  };
}
