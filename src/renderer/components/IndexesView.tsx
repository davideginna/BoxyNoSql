import { useState, useEffect, useRef } from 'react';
import { showConfirm } from '../dialog';
import Icon from './Icon';

const inv = (ch: string, ...a: any[]) => (window as any).electron.invoke(ch, ...a);

interface IndexesViewProps {
  connectionId: string;
  database: string;
  collection: string;
}

type Direction = 1 | -1 | 'text' | '2dsphere' | 'hashed';

interface IndexField {
  id: number;
  field: string;
  dir: Direction;
}

function extractPaths(obj: any, prefix = '', depth = 0): string[] {
  if (depth > 4 || typeof obj !== 'object' || obj === null || Array.isArray(obj)) return [];
  const paths: string[] = [];
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths.push(path);
    paths.push(...extractPaths(obj[key], path, depth + 1));
  }
  return paths;
}

function getFieldsFromDocs(docs: any[]): string[] {
  const fields = new Set<string>();
  docs.forEach(doc => extractPaths(doc).forEach(f => fields.add(f)));
  return Array.from(fields).sort();
}

const DIR_OPTIONS: { value: Direction; label: string }[] = [
  { value: 1, label: 'ASC (1)' },
  { value: -1, label: 'DESC (-1)' },
  { value: 'text', label: 'text' },
  { value: '2dsphere', label: '2dsphere' },
  { value: 'hashed', label: 'hashed' },
];

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M3 4h10M6 4V2h4v2M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="6.5" y1="7" x2="6.5" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="9.5" y1="7" x2="9.5" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

let fieldIdSeq = 0;

function FieldSuggestInput({ value, onChange, suggestions, placeholder }: {
  value: string; onChange: (v: string) => void; suggestions: string[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setFilter(value); }, [value]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filtered = suggestions.filter(s => s.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div ref={ref} className="field-suggest">
      <input
        value={filter}
        placeholder={placeholder}
        onChange={e => { setFilter(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="idx-input"
      />
      {open && filtered.length > 0 && (
        <div className="field-suggest-menu">
          {filtered.map(s => (
            <div key={s}
              className="field-suggest-item"
              onMouseDown={() => { onChange(s); setFilter(s); setOpen(false); }}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatOps(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function formatSince(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return '<1h ago';
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return '—'; }
}

export default function IndexesView({ connectionId, database, collection }: IndexesViewProps) {
  const [indexes, setIndexes] = useState<any[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, { ops: number; since: string }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [fields, setFields] = useState<IndexField[]>([{ id: ++fieldIdSeq, field: '', dir: 1 }]);
  const [optUnique, setOptUnique] = useState(false);
  const [optSparse, setOptSparse] = useState(false);
  const [optBackground, setOptBackground] = useState(false);
  const [optName, setOptName] = useState('');
  const [creating, setCreating] = useState(false);
  const [docFields, setDocFields] = useState<string[]>([]);

  const loadAll = async () => {
    setLoading(true); setError(null);
    try {
      const [idx, stats] = await Promise.all([
        inv('get-indexes', connectionId, database, collection),
        inv('get-index-stats', connectionId, database, collection),
      ]);
      setIndexes(idx);
      const map: Record<string, { ops: number; since: string }> = {};
      (stats as any[]).forEach(s => {
        map[s.name] = {
          ops: s.accesses?.ops ?? 0,
          since: s.accesses?.since ? new Date(s.accesses.since).toISOString() : '',
        };
      });
      setStatsMap(map);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const loadDocFields = async () => {
    try {
      const docs = await inv('get-documents', connectionId, database, collection, {}, 20);
      setDocFields(getFieldsFromDocs(docs));
    } catch { /* ignore */ }
  };

  useEffect(() => { loadAll(); loadDocFields(); }, [connectionId, database, collection]);

  const keyObj = Object.fromEntries(fields.filter(f => f.field).map(f => [f.field, f.dir]));
  const keyPreview = JSON.stringify(keyObj);

  const handleCreate = async () => {
    if (Object.keys(keyObj).length === 0) { setError('Add at least one field'); return; }
    setCreating(true); setError(null);
    try {
      const options: any = {};
      if (optUnique) options.unique = true;
      if (optSparse) options.sparse = true;
      if (optBackground) options.background = true;
      if (optName.trim()) options.name = optName.trim();
      await inv('create-index', connectionId, database, collection, keyObj, options);
      setShowCreate(false);
      setFields([{ id: ++fieldIdSeq, field: '', dir: 1 }]);
      setOptUnique(false); setOptSparse(false); setOptBackground(false); setOptName('');
      await loadAll();
    } catch (e: any) { setError(e.message); }
    setCreating(false);
  };

  const handleDrop = async (name: string) => {
    if (!await showConfirm({ message: `Drop index "${name}"?`, danger: true, confirmText: 'Drop' })) return;
    try {
      await inv('drop-index', connectionId, database, collection, name);
      await loadAll();
    } catch (e: any) { setError(e.message); }
  };

  const addField = () => setFields(f => [...f, { id: ++fieldIdSeq, field: '', dir: 1 }]);
  const removeField = (id: number) => setFields(f => f.filter(x => x.id !== id));
  const updateField = (id: number, patch: Partial<IndexField>) =>
    setFields(f => f.map(x => x.id === id ? { ...x, ...patch } : x));

  return (
    <div className="idx-view">
      <div className="toolbar">
        <button onClick={() => { setShowCreate(v => !v); if (!showCreate) loadDocFields(); }}>
          {showCreate ? <><Icon name="close" size={13} /> Cancel</> : <><Icon name="plus" size={13} /> Create Index</>}
        </button>
        <button className="secondary" onClick={loadAll} disabled={loading}>↻ Refresh</button>
      </div>

      {error && <div className="idx-error">{error}</div>}

      {showCreate && (
        <div className="idx-create-panel">
          <div className="idx-create-cols">
            <div className="idx-create-fields">
              <div className="idx-section-label">Index Fields</div>
              {fields.map((f, i) => (
                <div key={f.id} className="idx-field-row">
                  <span className="idx-field-num">{i + 1}.</span>
                  <FieldSuggestInput value={f.field} onChange={v => updateField(f.id, { field: v })} suggestions={docFields} placeholder="field name" />
                  <select
                    value={String(f.dir)}
                    onChange={e => updateField(f.id, { dir: isNaN(Number(e.target.value)) ? e.target.value as Direction : Number(e.target.value) as Direction })}
                    className="idx-select"
                  >
                    {DIR_OPTIONS.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
                  </select>
                  <button onClick={() => removeField(f.id)} disabled={fields.length === 1}
                    className="icon-btn idx-remove-field">×</button>
                </div>
              ))}
              <button className="secondary idx-add-field" onClick={addField}>+ Add field</button>
            </div>

            <div className="idx-create-options">
              <div className="idx-section-label">Options</div>
              {[
                { label: 'Unique', val: optUnique, set: setOptUnique },
                { label: 'Sparse', val: optSparse, set: setOptSparse },
                { label: 'Background (legacy)', val: optBackground, set: setOptBackground },
              ].map(({ label, val, set }) => (
                <label key={label} className="idx-option-row">
                  <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} />{label}
                </label>
              ))}
              <div className="idx-field-label">Name (optional)</div>
              <input value={optName} onChange={e => setOptName(e.target.value)} placeholder="auto-generated"
                className="idx-input idx-name-input" />
              <div className="idx-field-label">Preview</div>
              <div className="idx-preview">
                {keyPreview || '{}'}
              </div>
              <button className="idx-create-btn" onClick={handleCreate} disabled={creating || Object.keys(keyObj).length === 0}>
                {creating ? 'Creating…' : 'Create Index'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="idx-list">
        {loading && <div className="idx-placeholder">Loading…</div>}
        {!loading && indexes.length === 0 && (
          <div className="idx-placeholder">No indexes</div>
        )}
        {!loading && indexes.length > 0 && (
          <table className="ur-table idx-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th>Unique</th>
                <th>Sparse</th>
                <th className="idx-col-ops">Ops used</th>
                <th>Since</th>
                <th className="idx-col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {indexes.map((idx: any) => {
                const s = statsMap[idx.name];
                const used = s && s.ops > 0;
                return (
                  <tr key={idx.name}>
                    <td className="mono">{idx.name}</td>
                    <td className="mono">{JSON.stringify(idx.key)}</td>
                    <td>{idx.unique ? <Icon name="check" size={13} color="var(--success)" /> : ''}</td>
                    <td>{idx.sparse ? <Icon name="check" size={13} color="var(--success)" /> : ''}</td>
                    <td className={`idx-col-ops${used ? ' used' : ''}`}>
                      {s ? formatOps(s.ops) : '—'}
                    </td>
                    <td className="idx-col-since">
                      {s && s.since ? formatSince(s.since) : '—'}
                    </td>
                    <td>
                      {idx.name !== '_id_' && (
                        <button
                          title="Drop index"
                          onClick={() => handleDrop(idx.name)}
                          className="icon-btn idx-drop-btn"
                        >
                          <IconTrash />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="status-bar">
        <span>{indexes.length} indexes</span>
        <span>{database}.{collection}</span>
      </div>
    </div>
  );
}
