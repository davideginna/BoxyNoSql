// Parser for Studio 3T "Connection URI Export" files (.uri).
//
// Format: comment lines starting with `//` (the last one before a URI is the
// connection label), blank lines, and one connection URI per line. Studio 3T
// stuffs its own metadata into the query string as `3t.*` params:
//   3t.connection.name  → connection name
//   3t.group            → comma-separated folder path (e.g. "CAST,prod")
//   3t.defaultColor     → "r,g,b"
//   3t.databases        → comma-separated db list
// Those params are stripped from the stored URI (the main process also strips
// them at connect time via sanitizeUri, but storing them clean keeps the
// connection form readable).

export interface ImportedConnection {
  name: string;
  uri: string;
  folderPath: string[];
  color?: string;
  database?: string;
}

function rgbToHex(value: string): string | undefined {
  const parts = value.split(',').map(p => parseInt(p.trim(), 10));
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return undefined;
  return '#' + parts.map(n => n.toString(16).padStart(2, '0')).join('');
}

// Drops `3t.*` params and params with an empty value (Studio 3T exports
// `replicaSet=` even when there is no replica set, which the driver rejects).
function cleanUri(uri: string, params: URLSearchParams): string {
  const base = uri.split('?')[0];
  const kept: string[] = [];
  params.forEach((v, k) => {
    if (k.toLowerCase().startsWith('3t.')) return;
    if (v === '') return;
    kept.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  });
  return kept.length ? `${base}?${kept.join('&')}` : base;
}

function hostsOf(uri: string): string {
  let rest = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const at = rest.lastIndexOf('@');
  if (at !== -1) rest = rest.slice(at + 1);
  return rest.split(/[/?]/)[0] || 'connection';
}

// Database name from the URI path (`…/admin?…`), ignoring an empty path.
function databaseOf(uri: string): string | undefined {
  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '').split('?')[0];
  const slash = withoutScheme.indexOf('/');
  if (slash === -1) return undefined;
  const db = withoutScheme.slice(slash + 1).trim();
  return db || undefined;
}

export function parseStudio3TExport(text: string): ImportedConnection[] {
  const out: ImportedConnection[] = [];
  let lastComment: string | undefined;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('//')) {
      const comment = line.replace(/^\/+\s*/, '').trim();
      // Skip the export header ("Connections Exported from…", "Exported on…")
      if (comment && !/^(connections )?exported/i.test(comment)) lastComment = comment;
      continue;
    }
    if (!/^mongodb(\+srv)?:\/\//i.test(line)) continue;

    const qIdx = line.indexOf('?');
    const params = new URLSearchParams(qIdx === -1 ? '' : line.slice(qIdx + 1));

    const name = params.get('3t.connection.name')?.trim() || lastComment || hostsOf(line);
    const folderPath = (params.get('3t.group') || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const colorParam = params.get('3t.defaultColor');
    const database = databaseOf(line) || params.get('3t.databases')?.split(',')[0]?.trim() || undefined;

    out.push({
      name,
      uri: cleanUri(line, params),
      folderPath,
      color: colorParam ? rgbToHex(colorParam) : undefined,
      database,
    });
    lastComment = undefined;
  }

  return out;
}

// Two connections exported from the same group share a name ("admin" is the
// common case), so disambiguate with the folder path for display purposes.
export function displayLabel(c: ImportedConnection): string {
  return c.folderPath.length ? `${c.folderPath.join(' / ')} / ${c.name}` : c.name;
}
