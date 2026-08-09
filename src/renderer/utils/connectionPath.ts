/**
 * Identity of a tree node in words: which connection, in which folder, on which
 * server. The sidebar shows a database as a bare name, so two connections to a
 * `testdb` each look identical — this is what the tooltips spell out.
 *
 * Credentials never appear: the username is useful for telling two connections
 * to the same host apart, the password is not.
 */

export interface Folder { id: string; name: string; color?: string; parentId?: string }

/** Root-to-leaf chain of a folder's ancestors. Loop-safe. */
export function folderBreadcrumb(folderId: string, folders: Folder[]): Folder[] {
  const path: Folder[] = [];
  const seen = new Set<string>();
  let current = folders.find(f => f.id === folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? folders.find(f => f.id === current!.parentId) : undefined;
  }
  return path;
}

export function folderPathLabel(folderId: string | undefined, folders: Folder[]): string {
  if (!folderId) return '';
  return folderBreadcrumb(folderId, folders).map(f => f.name).join(' / ');
}

/** `admin@localhost:27017`, `cluster0.abc.mongodb.net` — host(s) and user, no password. */
export function serverLabel(uri: string): string {
  const trimmed = (uri || '').trim();
  if (!trimmed) return '';
  const afterScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const at = afterScheme.lastIndexOf('@');
  const credentials = at === -1 ? '' : afterScheme.slice(0, at);
  const hosts = (at === -1 ? afterScheme : afterScheme.slice(at + 1)).split(/[/?]/)[0];
  const user = credentials ? decodeURIComponent(credentials.split(':')[0]) : '';
  if (!hosts) return '';
  return user ? `${user}@${hosts}` : hosts;
}

export interface NodeIdentity {
  connection: string;
  folder?: string;
  server?: string;
  database?: string;
  collection?: string;
}

/**
 * Multi-line `title` text. One label per line, blanks dropped, so a connection
 * at the root of the tree does not get an empty "Folder:" line.
 */
export function nodeTooltip(id: NodeIdentity): string {
  return ([
    ['Connection', id.connection],
    ['Folder', id.folder],
    ['Server', id.server],
    ['Database', id.database],
    ['Collection', id.collection],
  ] as const)
    .filter(([, value]) => !!value)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}
