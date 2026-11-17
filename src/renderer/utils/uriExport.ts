// Writer for Studio 3T-style "Connection URI Export" files (.uri) — the inverse
// of `parseStudio3TExport` in uriImport.ts, so an exported file imports back
// here (and into Studio 3T) with name, folder path, color and TLS paths intact.
//
// Settings that have no `3t.*` counterpart in Studio 3T travel as `3t.boxy.*`:
// still stripped from the URI on import (every `3t.*` param is), and a Studio 3T
// that does not know them just ignores them.
//
// The URI is written as stored, credentials included: a file without the
// password would not connect after import. The client certificate's key
// password travels too (`3t.boxy.tlsCertificateKeyFilePassword`), for the same
// reason — the export toast warns when the file holds secrets.

import { folderBreadcrumb, type Folder } from './connectionPath';

export interface ExportableConnection {
  name: string;
  uri: string;
  database?: string;
  folderId?: string;
  color?: string;
  readOnly?: boolean;
  tls?: boolean;
  tlsCertificateKeyFile?: string;
  tlsCertificateKeyFilePassword?: string;
  tlsCAFile?: string;
  tlsAllowInvalidCertificates?: boolean;
  tlsServername?: string;
  iconDbColor?: string;
  iconColColor?: string;
}

function hexToRgb(hex: string): string | undefined {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return undefined;
  return m.slice(1).map(h => parseInt(h, 16)).join(',');
}

function hasParam(uri: string, name: string): boolean {
  const q = uri.split('?')[1];
  if (!q) return false;
  return q.split('&').some(p => p.split('=')[0].toLowerCase() === name.toLowerCase());
}

/** Appends `params` to the query string, adding the `/` a bare `host:port` needs before `?`. */
function appendParams(uri: string, params: string[]): string {
  if (params.length === 0) return uri;
  const [base, query] = [uri.split('?')[0], uri.split('?').slice(1).join('?')];
  const afterScheme = base.replace(/^mongodb(\+srv)?:\/\//i, '');
  const withSlash = afterScheme.includes('/') ? base : `${base}/`;
  const all = [...(query ? query.split('&').filter(Boolean) : []), ...params];
  return `${withSlash}?${all.join('&')}`;
}

const enc = encodeURIComponent;

// File paths keep `/` and `:` readable, as the other client writes them
// (`3t.clientCertPath=/home/…/client.pem`); both are legal in a query value.
const encPath = (path: string) => enc(path).replace(/%2F/gi, '/').replace(/%3A/gi, ':');

/** One connection as a single `.uri` line, `3t.*` metadata in the query string. */
export function connectionToUri(conn: ExportableConnection, folders: Folder[]): string {
  const uri = conn.uri.trim();
  const params: string[] = [];
  // Studio 3T separates group levels with commas, so a comma inside a folder
  // name would add a level on import.
  const chain = conn.folderId ? folderBreadcrumb(conn.folderId, folders) : [];
  if (chain.length) params.push(`3t.group=${chain.map(f => enc(f.name.replace(/,/g, ' '))).join(',')}`);
  // One color per `3t.group` level, empty where a folder has none, so the
  // import can color the folders it creates. Written only if some level has one.
  if (chain.some(f => f.color)) params.push(`3t.boxy.groupColors=${chain.map(f => enc(f.color || '')).join(',')}`);
  params.push(`3t.connection.name=${enc(conn.name)}`);
  // The URI-format version the other client stamps on its own exports; written
  // so its import reads this file the same way. Ignored on our import.
  params.push('3t.uriVersion=3');
  const rgb = conn.color ? hexToRgb(conn.color) : undefined;
  if (rgb) params.push(`3t.defaultColor=${rgb}`);
  if (conn.database) params.push(`3t.databases=${enc(conn.database)}`);
  // The import turns TLS on from `tls`/`ssl` in the URI or a client certificate,
  // so a connection with TLS set only on the form needs it spelled out.
  if (conn.tls && !hasParam(uri, 'tls') && !hasParam(uri, 'ssl')) params.push('tls=true');
  if (conn.tlsCertificateKeyFile) params.push(`3t.clientCertPath=${encPath(conn.tlsCertificateKeyFile)}`);
  if (conn.tlsCertificateKeyFilePassword) params.push(`3t.boxy.tlsCertificateKeyFilePassword=${enc(conn.tlsCertificateKeyFilePassword)}`);
  if (conn.tlsServername) params.push(`3t.sniName=${enc(conn.tlsServername)}`);
  if (conn.tlsCAFile) params.push(`3t.boxy.tlsCAFile=${encPath(conn.tlsCAFile)}`);
  if (conn.tlsAllowInvalidCertificates) params.push('3t.boxy.tlsAllowInvalidCertificates=true');
  if (conn.readOnly) params.push('3t.boxy.readOnly=true');
  if (conn.iconDbColor) params.push(`3t.boxy.iconDbColor=${enc(conn.iconDbColor)}`);
  if (conn.iconColColor) params.push(`3t.boxy.iconColColor=${enc(conn.iconColColor)}`);
  return appendParams(uri, params);
}

/** A whole `.uri` file: header comment, then a `// name` line and the URI per connection. */
export function exportConnections(conns: ExportableConnection[], folders: Folder[], now = new Date()): string {
  const lines = [
    '// Connections Exported from BoxyNoSql',
    `// Exported on ${now.toISOString()}`,
    '',
  ];
  for (const c of conns) {
    lines.push(`// ${c.name}`, connectionToUri(c, folders), '');
  }
  return lines.join('\n');
}

/** Every connection in `folderId` and in the folders below it. */
export function connectionsInFolder<C extends { folderId?: string }>(
  folderId: string, conns: C[], folders: Folder[],
): C[] {
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); grew = true; }
    }
  }
  return conns.filter(c => c.folderId !== undefined && ids.has(c.folderId));
}

/** `prod-cluster.uri`, `connections.uri` — a name the save dialog can start from. */
export function exportFileName(label: string): string {
  const safe = label.trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ');
  return `${safe || 'connections'}.uri`;
}

/** True when the connection carries a password the export will write: in the URI or for the client certificate key. */
export function connectionHasSecret(conn: { uri: string; tlsCertificateKeyFilePassword?: string }): boolean {
  return uriHasPassword(conn.uri) || !!conn.tlsCertificateKeyFilePassword;
}

/** True when the URI carries a password — worth saying when it goes to the clipboard or a file. */
export function uriHasPassword(uri: string): boolean {
  const afterScheme = uri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const at = afterScheme.lastIndexOf('@');
  return at !== -1 && afterScheme.slice(0, at).includes(':');
}
