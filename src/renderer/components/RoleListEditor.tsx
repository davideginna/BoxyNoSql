import Icon from './Icon';
import SuggestInput from './SuggestInput';
import { RoleRef, defaultDbForRole } from '../utils/userRoles';

interface Props {
  roles: RoleRef[];
  onChange: (roles: RoleRef[]) => void;
  /** The database the dialog is open on: the default for a new row. */
  database: string;
  /** Role names offered by the picker (free text is allowed too). */
  suggestions: string[];
  /** Database names offered for each role's database (free text is allowed too). */
  databases: string[];
}

/**
 * Editable list of `{role, db}` pairs, shared by "new user" and "edit roles".
 * Picking an admin-only built-in (`readAnyDatabase`, `root`…) moves the row to
 * `admin`, since the server refuses those anywhere else; the database stays
 * editable for every other case.
 */
export default function RoleListEditor({ roles, onChange, database, suggestions, databases }: Props) {

  const update = (i: number, patch: Partial<RoleRef>) =>
    onChange(roles.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const setRoleName = (i: number, role: string) => {
    const db = defaultDbForRole(role, roles[i].db);
    update(i, { role, db });
  };

  return (
    <div className="role-list">
      {roles.length === 0 && <div className="role-list-empty">No roles</div>}
      {roles.map((r, i) => (
        <div key={i} className="role-list-row">
          <SuggestInput placeholder="Role" value={r.role} aria-label={`Role ${i + 1}`}
            suggestions={suggestions} onChange={v => setRoleName(i, v)} />
          <span className="role-list-at">@</span>
          <SuggestInput placeholder="Database" value={r.db} aria-label={`Database of role ${i + 1}`}
            suggestions={databases} onChange={v => update(i, { db: v })} />
          <button className="icon-btn" title="Remove this role"
            onClick={() => onChange(roles.filter((_, j) => j !== i))}>
            <Icon name="trash" size={13} />
          </button>
        </div>
      ))}
      <button className="secondary role-list-add"
        onClick={() => onChange([...roles, { role: '', db: database }])}>
        + Add role
      </button>
    </div>
  );
}
