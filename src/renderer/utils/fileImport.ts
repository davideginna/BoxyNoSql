export function pickFile(accept = '.json,.ndjson,.jsonl'): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

// Parse a text blob into an array of docs.
// Accepts: JSON array, single JSON object, or NDJSON (one JSON per line).
export function parseDocs(text: string): any[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error('Expected JSON array');
    return parsed;
  }
  if (trimmed.startsWith('{')) {
    // Either a single doc or NDJSON whose first line starts with {
    const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1 && lines.every(l => l.startsWith('{'))) {
      return lines.map((l, i) => {
        try { return JSON.parse(l); }
        catch (e: any) { throw new Error(`Line ${i + 1}: ${e.message}`); }
      });
    }
    return [JSON.parse(trimmed)];
  }
  throw new Error('Unrecognized format — expected JSON array, object, or NDJSON');
}

// Parse a full-database dump: { colName: [docs], ... }
export function parseDatabaseFile(text: string): Record<string, any[]> {
  const parsed = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Database import requires JSON object mapping collection names to arrays');
  }
  for (const [k, v] of Object.entries(parsed)) {
    if (!Array.isArray(v)) throw new Error(`Value for "${k}" is not an array`);
  }
  return parsed as Record<string, any[]>;
}

function detectCsvDelimiter(firstLine: string): string {
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  return tabCount > commaCount ? '\t' : ',';
}

// RFC 4180-ish CSV/TSV parser: quoted fields, embedded delimiter/newline, "" as escaped quote.
export function parseCsv(text: string, delimiter?: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^\uFEFF/, '');
  const delim = delimiter || detectCsvDelimiter(clean.split(/\r?\n/, 1)[0] || '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  const dataRows = rows.filter(r => !(r.length === 1 && r[0] === ''));
  if (dataRows.length === 0) throw new Error('Empty CSV file');
  const [headers, ...body] = dataRows;
  return { headers, rows: body };
}

export type CsvFieldType = 'string' | 'number' | 'boolean' | 'date' | 'objectid' | 'skip';

// Converts one raw CSV cell into the Extended-JSON-compatible value for its mapped type.
// Invalid numbers fall back to the raw string rather than silently becoming 0/NaN.
export function convertCsvValue(raw: string, type: CsvFieldType): any {
  const trimmed = raw.trim();
  switch (type) {
    case 'number': {
      if (trimmed === '') return null;
      const n = Number(trimmed);
      return Number.isNaN(n) ? trimmed : n;
    }
    case 'boolean': return /^(true|1|yes)$/i.test(trimmed);
    case 'date': return trimmed === '' ? null : { $date: new Date(trimmed).toISOString() };
    case 'objectid': return trimmed === '' ? null : { $oid: trimmed };
    default: return raw;
  }
}

// Heuristic type guess for a CSV column from one sample cell — starting point
// for the mapping UI, not a substitute for the user reviewing/correcting it.
export function guessCsvColumnType(sample: string): CsvFieldType {
  const v = sample.trim();
  if (v === '') return 'string';
  if (/^[0-9a-fA-F]{24}$/.test(v)) return 'objectid';
  if (/^(true|false)$/i.test(v)) return 'boolean';
  if (!Number.isNaN(Number(v))) return 'number';
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/.test(v) && !Number.isNaN(Date.parse(v))) return 'date';
  return 'string';
}

export interface CsvColumnMapping { field: string; type: CsvFieldType }

// Builds documents from parsed CSV rows using a per-column field name + type mapping.
// Columns with an empty field name, or type 'skip', are dropped from the output.
export function buildCsvDocuments(headers: string[], rows: string[][], mapping: CsvColumnMapping[]): any[] {
  return rows.map(row => {
    const doc: Record<string, any> = {};
    headers.forEach((_, i) => {
      const m = mapping[i];
      if (!m || !m.field.trim() || m.type === 'skip') return;
      doc[m.field.trim()] = convertCsvValue(row[i] ?? '', m.type);
    });
    return doc;
  });
}
