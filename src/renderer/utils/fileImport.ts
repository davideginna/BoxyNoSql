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
