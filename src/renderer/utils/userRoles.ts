/**
 * A user's roles as the server stores them: `{role, db}` pairs.
 *
 * A role is not necessarily scoped to the database the dialog was opened on —
 * `readAnyDatabase`, `clusterMonitor`, `root`… only exist on `admin` — so the
 * editor works on pairs, never on bare role names.
 *
 * Saving an edit replaces the whole roles array (`updateUser`), so before it
 * runs the dialog shows `diffRoles()`: which roles are about to be granted and
 * which revoked. Like a bulk edit, a permission change is a write where
 * "what exactly is about to happen" has to be answerable.
 */

export interface RoleRef {
  role: string;
  db: string;
}

export const BUILTIN_ROLES = [
  'read', 'readWrite', 'dbAdmin', 'dbOwner', 'userAdmin',
  'readAnyDatabase', 'readWriteAnyDatabase', 'userAdminAnyDatabase', 'dbAdminAnyDatabase',
  'clusterAdmin', 'clusterManager', 'clusterMonitor', 'hostManager',
  'backup', 'restore', 'root',
];

/** Built-in roles that the server only accepts on the `admin` database. */
const ADMIN_ONLY_ROLES = new Set([
  'readAnyDatabase', 'readWriteAnyDatabase', 'userAdminAnyDatabase', 'dbAdminAnyDatabase',
  'clusterAdmin', 'clusterManager', 'clusterMonitor', 'hostManager',
  'backup', 'restore', 'root',
]);

/** The database a role should default to: `admin` for the admin-only built-ins, else the open one. */
export function defaultDbForRole(role: string, openDb: string): string {
  return ADMIN_ONLY_ROLES.has(role.trim()) ? 'admin' : openDb;
}

export function formatRole(r: RoleRef): string {
  return `${r.role}@${r.db}`;
}

function sameRole(a: RoleRef, b: RoleRef): boolean {
  return a.role === b.role && a.db === b.db;
}

/** Trims both fields; what the form holds is whatever was typed. */
export function normalizeRoles(rows: RoleRef[]): RoleRef[] {
  return rows.map(r => ({ role: r.role.trim(), db: r.db.trim() }));
}

/**
 * First problem with the rows as typed, or `null` if they can be saved.
 * An empty list is valid: a user with no roles is allowed by the server.
 */
export function validateRoles(rows: RoleRef[]): string | null {
  const roles = normalizeRoles(rows);
  for (let i = 0; i < roles.length; i++) {
    const r = roles[i];
    if (!r.role) return `Role ${i + 1}: the role name is empty`;
    if (!r.db) return `Role ${i + 1} (${r.role}): the database is empty`;
    if (roles.findIndex(other => sameRole(other, r)) !== i) return `${formatRole(r)} is listed twice`;
  }
  return null;
}

/** Roles in `next` but not in `current` (added), and the other way round (removed). */
export function diffRoles(current: RoleRef[], next: RoleRef[]): { added: RoleRef[]; removed: RoleRef[] } {
  const before = normalizeRoles(current);
  const after = normalizeRoles(next);
  return {
    added: after.filter(r => !before.some(b => sameRole(b, r))),
    removed: before.filter(r => !after.some(a => sameRole(a, r))),
  };
}

/** Role names for the picker: the built-ins, then the database's custom roles, no duplicates. */
export function roleSuggestions(customRoles: string[]): string[] {
  const extra = customRoles.filter(r => !BUILTIN_ROLES.includes(r)).sort();
  return [...BUILTIN_ROLES, ...extra];
}

/** Body of the confirmation shown before an edit is saved: one line per role granted or revoked. */
export function describeRoleChange(username: string, diff: { added: RoleRef[]; removed: RoleRef[] }): string {
  const lines = [`Change the roles of "${username}":`];
  for (const r of diff.added) lines.push(`  + grant  ${formatRole(r)}`);
  for (const r of diff.removed) lines.push(`  − revoke ${formatRole(r)}`);
  if (diff.removed.length > 0) {
    lines.push('', 'If this is the user the connection logs in as, revoking a role can lock this connection out of managing users.');
  }
  return lines.join('\n');
}

/**
 * Databases for the role's database picker: the open one and `admin` first
 * (where nearly every role lives), then the server's others in name order.
 * `admin` is offered even when `listDatabases` was refused or does not list it.
 */
export function databaseSuggestions(serverDbs: string[], openDb: string): string[] {
  const first = openDb === 'admin' ? ['admin'] : [openDb, 'admin'];
  const rest = serverDbs.filter(d => !first.includes(d)).sort();
  return [...first, ...rest];
}
