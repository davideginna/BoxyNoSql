import { useState, useEffect } from 'react';
import { showConfirm } from '../dialog';

const inv = (ch: string, ...a: any[]) => (window as any).electron.invoke(ch, ...a);

const BUILTIN_ROLES = ['read', 'readWrite', 'dbAdmin', 'dbOwner', 'userAdmin',
  'clusterAdmin', 'readAnyDatabase', 'readWriteAnyDatabase', 'userAdminAnyDatabase', 'dbAdminAnyDatabase'];

interface Props {
  connectionId: string;
  database: string;
  onClose: () => void;
}

export default function UsersRolesModal({ connectionId, database, onClose }: Props) {
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'readWrite' });
  const [newRole, setNewRole] = useState({ name: '', inherits: '' });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      if (tab === 'users') setUsers(await inv('list-users', connectionId, database));
      else setRoles(await inv('list-roles', connectionId, database));
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [tab]);

  const createUser = async () => {
    if (!newUser.username || !newUser.password) return;
    try {
      await inv('create-user', connectionId, database, newUser.username, newUser.password,
        [{ role: newUser.role, db: database }]);
      setNewUser({ username: '', password: '', role: 'readWrite' });
      load();
    } catch (e: any) { setError(e.message); }
  };

  const dropUser = async (u: string) => {
    if (!await showConfirm({ message: `Drop user "${u}"?`, danger: true, confirmText: 'Drop' })) return;
    try { await inv('drop-user', connectionId, database, u); load(); }
    catch (e: any) { setError(e.message); }
  };

  const createRole = async () => {
    if (!newRole.name) return;
    try {
      const inherits = newRole.inherits ? [{ role: newRole.inherits, db: database }] : [];
      await inv('create-role', connectionId, database, newRole.name, [], inherits);
      setNewRole({ name: '', inherits: '' });
      load();
    } catch (e: any) { setError(e.message); }
  };

  const dropRole = async (r: string) => {
    if (!await showConfirm({ message: `Drop role "${r}"?`, danger: true, confirmText: 'Drop' })) return;
    try { await inv('drop-role', connectionId, database, r); load(); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}
        style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3>Manage — {database}</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {(['users', 'roles'] as const).map(t => (
            <button key={t} className={`ur-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="modal-body" style={{ flex: 1, overflow: 'auto' }}>
          {error && <div style={{ color: 'var(--error)', marginBottom: 8, fontSize: 12 }}>{error}</div>}

          {tab === 'users' && (
            <>
              <div className="ur-form">
                <input placeholder="Username" value={newUser.username}
                  onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))} />
                <input type="password" placeholder="Password" value={newUser.password}
                  onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} />
                <select value={newUser.role}
                  onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}>
                  {BUILTIN_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <button onClick={createUser}>+ User</button>
              </div>
              <table className="ur-table">
                <thead><tr><th>Username</th><th>Roles</th><th style={{ width: 40 }}></th></tr></thead>
                <tbody>
                  {loading
                    ? <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</td></tr>
                    : users.length === 0
                      ? <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No users</td></tr>
                      : users.map(u => (
                        <tr key={u.user}>
                          <td style={{ fontFamily: 'monospace' }}>{u.user}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {u.roles?.map((r: any) => `${r.role}@${r.db}`).join(', ') || '—'}
                          </td>
                          <td>
                            <button className="icon-btn" onClick={() => dropUser(u.user)}>×</button>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </>
          )}

          {tab === 'roles' && (
            <>
              <div className="ur-form">
                <input placeholder="Role name" value={newRole.name}
                  onChange={e => setNewRole(r => ({ ...r, name: e.target.value }))} />
                <input placeholder="Inherits (optional)" value={newRole.inherits}
                  onChange={e => setNewRole(r => ({ ...r, inherits: e.target.value }))} />
                <button onClick={createRole}>+ Role</button>
              </div>
              <table className="ur-table">
                <thead><tr><th>Role</th><th>Built-in</th><th style={{ width: 40 }}></th></tr></thead>
                <tbody>
                  {loading
                    ? <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</td></tr>
                    : roles.length === 0
                      ? <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No custom roles</td></tr>
                      : roles.map((r: any) => (
                        <tr key={r.role}>
                          <td style={{ fontFamily: 'monospace' }}>{r.role}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.isBuiltin ? 'Yes' : 'No'}</td>
                          <td>
                            {!r.isBuiltin && <button className="icon-btn" onClick={() => dropRole(r.role)}>×</button>}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
