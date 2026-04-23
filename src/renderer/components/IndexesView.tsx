import { useState, useEffect, useRef } from 'react';
import { showConfirm } from '../dialog';

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
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <input
        value={filter}
        placeholder={placeholder}
        onChange={e => { setFilter(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: 3, fontSize: 12 }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 500,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4,
          maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', marginTop: 2,
        }}>
          {filtered.map(s => (
            <div key={s}
              style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'monospace', color: 'var(--tree-key)' }}
              onMouseDown={() => { onChange(s); setFilter(s); setOpen(false); }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="toolbar">
        <button onClick={() => { setShowCreate(v => !v); if (!showCreate) loadDocFields(); }}>
          {showCreate ? '✕ Cancel' : '+ Create Index'}
        </button>
        <button className="secondary" onClick={loadAll} disabled={loading}>↻ Refresh</button>
      </div>

      {error && <div style={{ padding: '6px 12px', color: 'var(--error)', fontSize: 12 }}>{error}</div>}

      {showCreate && (
        <div style={{ padding: 14, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div className="idx-section-label">Index Fields</div>
              {fields.map((f, i) => (
                <div key={f.id} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
                  <FieldSuggestInput value={f.field} onChange={v => updateField(f.id, { field: v })} suggestions={docFields} placeholder="field name" />
                  <select
                    value={String(f.dir)}
                    onChange={e => updateField(f.id, { dir: isNaN(Number(e.target.value)) ? e.target.value as Direction : Number(e.target.value) as Direction })}
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '4px 6px', borderRadius: 3, fontSize: 12, flexShrink: 0 }}
                  >
                    {DIR_OPTIONS.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
                  </select>
                  <button onClick={() => removeField(f.id)} disabled={fields.length === 1}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px 4px', fontSize: 14, flexShrink: 0 }}>×</button>
                </div>
              ))}
              <button className="secondary" onClick={addField} style={{ fontSize: 12, padding: '3px 10px', marginTop: 2 }}>+ Add field</button>
            </div>

            <div style={{ minWidth: 220 }}>
              <div className="idx-section-label">Options</div>
              {[
                { label: 'Unique', val: optUnique, set: setOptUnique },
                { label: 'Sparse', val: optSparse, set: setOptSparse },
                { label: 'Background (legacy)', val: optBackground, set: setOptBackground },
              ].map(({ label, val, set }) => (
                <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} />{label}
                </label>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, marginTop: 4 }}>Name (optional)</div>
              <input value={optName} onChange={e => setOptName(e.target.value)} placeholder="auto-generated"
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: 3, fontSize: 12, marginBottom: 10 }} />
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Preview</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--bg-primary)', padding: '5px 8px', borderRadius: 3, border: '1px solid var(--border)', color: 'var(--tree-key)', wordBreak: 'break-all', marginBottom: 10 }}>
                {keyPreview || '{}'}
              </div>
              <button onClick={handleCreate} disabled={creating || Object.keys(keyObj).length === 0} style={{ width: '100%' }}>
                {creating ? 'Creating…' : 'Create Index'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && <div style={{ padding: 16, color: 'var(--text-secondary)', textAlign: 'center' }}>Loading…</div>}
        {!loading && indexes.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-secondary)', textAlign: 'center' }}>No indexes</div>
        )}
        {!loading && indexes.length > 0 && (
          <table className="ur-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th>Unique</th>
                <th>Sparse</th>
                <th style={{ textAlign: 'right' }}>Ops used</th>
                <th>Since</th>
                <th style={{ width: 44 }}></th>
              </tr>
            </thead>
            <tbody>
              {indexes.map((idx: any) => {
                const s = statsMap[idx.name];
                const used = s && s.ops > 0;
                return (
                  <tr key={idx.name}>
                    <td style={{ fontFamily: 'monospace' }}>{idx.name}</td>
                    <td style={{ fontFamily: 'monospace' }}>{JSON.stringify(idx.key)}</td>
                    <td>{idx.unique ? '✓' : ''}</td>
                    <td>{idx.sparse ? '✓' : ''}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: used ? 'var(--success)' : 'var(--text-secondary)' }}>
                      {s ? formatOps(s.ops) : '—'}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                      {s && s.since ? formatSince(s.since) : '—'}
                    </td>
                    <td>
                      {idx.name !== '_id_' && (
                        <button
                          title="Drop index"
                          onClick={() => handleDrop(idx.name)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '3px 5px', borderRadius: 3, display: 'flex', alignItems: 'center' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
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
