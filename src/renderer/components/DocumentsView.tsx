import { useState, useEffect, useRef, useCallback } from 'react';
import DocumentTree from './DocumentTree';
import ContextMenu, { ContextMenuEntry } from './ContextMenu';
import { showConfirm } from '../dialog';

type ViewMode = 'table' | 'tree';
type Operator = '$eq' | '$ne' | '$gt' | '$gte' | '$lt' | '$lte' | '$regex' | '$exists';

interface Condition {
  id: number;
  field: string;
  op: Operator;
  value: string;
}

interface DocumentsViewProps {
  connectionId: string;
  database: string;
  collection: string;
}

const OPERATORS: { value: Operator; label: string }[] = [
  { value: '$eq', label: '=' },
  { value: '$ne', label: '≠' },
  { value: '$gt', label: '>' },
  { value: '$gte', label: '≥' },
  { value: '$lt', label: '<' },
  { value: '$lte', label: '≤' },
  { value: '$regex', label: '~' },
  { value: '$exists', label: 'exists' },
];

function buildFilter(conditions: Condition[]): any {
  if (conditions.length === 0) return {};
  const parts = conditions.map(c => {
    let val: any = c.value;
    if (c.op === '$exists') val = c.value !== 'false';
    else if (val === 'true') val = true;
    else if (val === 'false') val = false;
    else if (val === 'null') val = null;
    else if (val !== '' && !isNaN(Number(val))) val = Number(val);
    return { [c.field]: { [c.op]: val } };
  });
  return parts.length === 1 ? parts[0] : { $and: parts };
}

function formatJson(raw: string): string {
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}

function validateJson(raw: string): string | null {
  try { JSON.parse(raw); return null; } catch (e: any) { return e.message; }
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

interface DiffEntry {
  path: string;
  type: 'added' | 'removed' | 'changed';
  oldVal?: any;
  newVal?: any;
}

function diffObjects(orig: any, curr: any, path = ''): DiffEntry[] {
  if (typeof orig !== 'object' || typeof curr !== 'object' || orig === null || curr === null || Array.isArray(orig) || Array.isArray(curr)) {
    if (JSON.stringify(orig) !== JSON.stringify(curr)) {
      return [{ path: path || '(root)', type: 'changed', oldVal: orig, newVal: curr }];
    }
    return [];
  }
  const results: DiffEntry[] = [];
  const allKeys = new Set([...Object.keys(orig), ...Object.keys(curr)]);
  for (const key of allKeys) {
    const p = path ? `${path}.${key}` : key;
    if (!(key in orig)) {
      results.push({ path: p, type: 'added', newVal: curr[key] });
    } else if (!(key in curr)) {
      results.push({ path: p, type: 'removed', oldVal: orig[key] });
    } else if (JSON.stringify(orig[key]) !== JSON.stringify(curr[key])) {
      const sub = diffObjects(orig[key], curr[key], p);
      results.push(...(sub.length > 0 ? sub : [{ path: p, type: 'changed' as const, oldVal: orig[key], newVal: curr[key] }]));
    }
  }
  return results;
}

function computeDiff(origJson: string, currJson: string): DiffEntry[] | null {
  try {
    const orig = JSON.parse(origJson);
    const curr = JSON.parse(currJson);
    return diffObjects(orig, curr);
  } catch { return null; }
}

function truncate(v: any, max = 60): string {
  const s = JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function highlightText(text: string, query: string): string {
  if (!query) return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return safe.replace(new RegExp(escapeRe(query), 'gi'), m => `<mark class="find-mark">${m}</mark>`);
}

const inv = (ch: string, ...a: any[]) => (window as any).electron.invoke(ch, ...a);

let condId = 0;

export default function DocumentsView({ connectionId, database, collection }: DocumentsViewProps) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [showQB, setShowQB] = useState(false);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Multi-select
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const lastSelectedIdx = useRef<number | null>(null);
  // Edit/view modal
  const [editingDoc, setEditingDoc] = useState<any | null>(null);
  const [editJson, setEditJson] = useState('');
  const [originalEditJson, setOriginalEditJson] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<any | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expandTick, setExpandTick] = useState(0);
  const [expandTarget, setExpandTarget] = useState(false);
  const [docExpands, setDocExpands] = useState<Record<number, { tick: number; target: boolean }>>({});
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; idx: number } | null>(null);
  const [emptyCtxMenu, setEmptyCtxMenu] = useState<{ x: number; y: number } | null>(null);
  // Add document modal
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [addJson, setAddJson] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const addTextareaRef = useRef<HTMLTextAreaElement>(null);
  // Find in view modal
  const [viewFind, setViewFind] = useState('');
  const [showViewFind, setShowViewFind] = useState(false);
  // Find in edit modal
  const [editFind, setEditFind] = useState('');
  const [showEditFind, setShowEditFind] = useState(false);
  const [editFindIdx, setEditFindIdx] = useState(0);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const viewFindRef = useRef<HTMLInputElement>(null);
  const editFindRef = useRef<HTMLInputElement>(null);

  const loadDocuments = async (filter: any, lim: number, pg: number) => {
    setLoading(true); setError(null);
    try {
      const result = await inv('get-documents', connectionId, database, collection, filter, lim, pg * lim);
      setDocuments(result.docs);
      setTotal(result.total);
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  };

  useEffect(() => {
    setConditions([]); setSelectedIndices(new Set()); setDocExpands({});
    setPage(0); setTotal(0);
    loadDocuments({}, limit, 0);
  }, [connectionId, database, collection]);

  const applyFilter = () => { setPage(0); loadDocuments(buildFilter(conditions), limit, 0); };
  const resetFilter = () => { setConditions([]); setPage(0); loadDocuments({}, limit, 0); };
  const goToPage = (pg: number) => { setPage(pg); loadDocuments(buildFilter(conditions), limit, pg); };

  const openEdit = useCallback((doc: any) => {
    const json = JSON.stringify(doc, null, 2);
    setEditingDoc(doc);
    setEditJson(json);
    setOriginalEditJson(json);
    setEditError(null);
    setShowEditFind(false);
    setEditFind('');
  }, []);

  const closeEdit = useCallback(async (skipConfirm = false) => {
    const isDirty = editJson !== originalEditJson;
    if (!skipConfirm && isDirty) {
      const ok = await showConfirm({ message: 'Close without saving changes?' });
      if (!ok) return;
    }
    setEditingDoc(null);
  }, [editJson, originalEditJson]);

  const openAddDoc = useCallback(() => {
    setAddJson('{\n  \n}');
    setAddError(null);
    setShowAddDoc(true);
    setTimeout(() => {
      const ta = addTextareaRef.current;
      if (ta) { ta.focus(); ta.setSelectionRange(4, 4); }
    }, 50);
  }, []);

  const handleAddSave = async () => {
    setAddError(null);
    const jsonErr = validateJson(addJson);
    if (jsonErr) { setAddError('Invalid JSON: ' + jsonErr); return; }
    let parsed: any;
    try { parsed = JSON.parse(addJson); } catch (e: any) { setAddError('Invalid JSON: ' + e.message); return; }
    try {
      const docs = Array.isArray(parsed) ? parsed : [parsed];
      await inv('insert-documents', connectionId, database, collection, docs);
      setShowAddDoc(false);
      loadDocuments(buildFilter(conditions), limit, page);
    } catch (err: any) { setAddError(err.message); }
  };

  const openView = useCallback((doc: any) => {
    setViewingDoc(doc);
    setShowViewFind(false);
    setViewFind('');
  }, []);

  // Multi-select click handler
  const handleDocClick = useCallback((idx: number, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedIndices(prev => {
        const n = new Set(prev);
        if (n.has(idx)) n.delete(idx); else n.add(idx);
        return n;
      });
    } else if (e.shiftKey && lastSelectedIdx.current !== null) {
      const from = Math.min(lastSelectedIdx.current, idx);
      const to = Math.max(lastSelectedIdx.current, idx);
      setSelectedIndices(prev => {
        const n = new Set(prev);
        for (let i = from; i <= to; i++) n.add(i);
        return n;
      });
    } else {
      setSelectedIndices(new Set([idx]));
    }
    lastSelectedIdx.current = idx;
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIndices.size === 0) return;
    const count = selectedIndices.size;
    const ok = await showConfirm({ message: `Delete ${count} document${count !== 1 ? 's' : ''}?`, danger: true, confirmText: 'Delete' });
    if (!ok) return;
    try {
      const toDelete = [...selectedIndices].map(i => documents[i]).filter(Boolean);
      await Promise.all(toDelete.map(doc =>
        inv('delete-document', connectionId, database, collection, String(doc._id))
      ));
      setSelectedIndices(new Set());
      loadDocuments(buildFilter(conditions), limit, page);
    } catch (err: any) { setError(err.message); }
  }, [selectedIndices, documents, connectionId, database, collection, conditions, limit]);

  const handleBulkCopy = useCallback(() => {
    if (selectedIndices.size === 0) return;
    const docs = [...selectedIndices].sort((a, b) => a - b).map(i => documents[i]).filter(Boolean);
    const text = docs.length === 1 ? JSON.stringify(docs[0], null, 2) : JSON.stringify(docs, null, 2);
    navigator.clipboard.writeText(text);
  }, [selectedIndices, documents]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { setError('Clipboard does not contain valid JSON'); return; }
      const docs = Array.isArray(parsed) ? parsed : [parsed];
      // Remove _id from pasted docs to avoid duplicate key errors
      const cleaned = docs.map(({ _id: _, ...rest }: any) => rest);
      await inv('insert-documents', connectionId, database, collection, cleaned);
      loadDocuments(buildFilter(conditions), limit, page);
    } catch (err: any) { setError('Paste failed: ' + err.message); }
  }, [connectionId, database, collection, conditions, limit]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingDoc) {
        if (e.key === 'Escape') { e.preventDefault(); closeEdit(); return; }
        if (e.ctrlKey && e.key === 'f') { e.preventDefault(); setShowEditFind(v => !v); setTimeout(() => editFindRef.current?.focus(), 50); }
        if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); handleSave(); }
        return;
      }
      if (viewingDoc) {
        if (e.key === 'Escape') { e.preventDefault(); setViewingDoc(null); return; }
        if (e.ctrlKey && e.key === 'f') { e.preventDefault(); setShowViewFind(v => !v); setTimeout(() => viewFindRef.current?.focus(), 50); }
        return;
      }
      if (e.ctrlKey && e.key === 'd') { e.preventDefault(); openAddDoc(); return; }
      if (e.ctrlKey && e.key === 'c') {
        if (selectedIndices.size > 0) { e.preventDefault(); handleBulkCopy(); }
        return;
      }
      if (e.ctrlKey && e.key === 'v') {
        e.preventDefault(); handlePaste();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIndices.size > 0) {
        e.preventDefault();
        handleBulkDelete();
        return;
      }
      const singleIdx = selectedIndices.size === 1 ? [...selectedIndices][0] : null;
      if (singleIdx === null) return;
      const doc = documents[singleIdx];
      if (!doc) return;
      if (e.ctrlKey && e.key === 'j') { e.preventDefault(); openEdit(doc); }
      if (e.key === 'F3') { e.preventDefault(); openView(doc); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIndices, documents, editingDoc, viewingDoc, openEdit, openView, openAddDoc, closeEdit, handleBulkDelete, handleBulkCopy, handlePaste]);

  // Find in edit textarea
  const findInEdit = useCallback((dir: 1 | -1 = 1) => {
    const ta = editTextareaRef.current;
    if (!ta || !editFind) return;
    const text = editJson.toLowerCase();
    const query = editFind.toLowerCase();
    const positions: number[] = [];
    let pos = 0;
    while ((pos = text.indexOf(query, pos)) !== -1) { positions.push(pos); pos++; }
    if (positions.length === 0) return;
    const next = ((editFindIdx + dir) % positions.length + positions.length) % positions.length;
    setEditFindIdx(next);
    const start = positions[next];
    ta.focus();
    ta.setSelectionRange(start, start + editFind.length);
    const lineHeight = 18;
    const lines = editJson.substring(0, start).split('\n').length;
    ta.scrollTop = Math.max(0, (lines - 5) * lineHeight);
  }, [editJson, editFind, editFindIdx]);

  const allFields = (): string[] => {
    const fields = new Set<string>();
    documents.forEach(doc => Object.keys(doc).forEach(k => fields.add(k)));
    return Array.from(fields).sort();
  };

  const addCondition = (field: string) => {
    setConditions(prev => [...prev, { id: ++condId, field, op: '$eq', value: '' }]);
  };
  const updateCondition = (id: number, changes: Partial<Condition>) => {
    setConditions(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
  };
  const removeCondition = (id: number) => {
    setConditions(prev => prev.filter(c => c.id !== id));
  };

  const handleDropField = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const field = e.dataTransfer.getData('field');
    if (field) addCondition(field);
  };

  const handleSave = async () => {
    setEditError(null);
    const jsonErr = validateJson(editJson);
    if (jsonErr) { setEditError('Invalid JSON: ' + jsonErr); return; }
    let parsed: any;
    try { parsed = JSON.parse(editJson); } catch (e: any) { setEditError('Invalid JSON: ' + e.message); return; }
    try {
      await inv('update-document', connectionId, database, collection, String(editingDoc._id), parsed);
      setEditingDoc(null);
      loadDocuments(buildFilter(conditions), limit, page);
    } catch (err: any) { setEditError(err.message); }
  };

  const handleDelete = async (doc: any) => {
    if (!await showConfirm({ message: `Delete document ${String(doc._id)}?`, danger: true, confirmText: 'Delete' })) return;
    try {
      await inv('delete-document', connectionId, database, collection, String(doc._id));
      loadDocuments(buildFilter(conditions), limit, page);
    } catch (err: any) { setError(err.message); }
  };

  const handleCopy = (doc: any) => {
    navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
  };

  const handleExport = (doc: any) => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doc_${String(doc._id)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildCtxItems = (idx: number): ContextMenuEntry[] => {
    const doc = documents[idx];
    return [
      { label: '👁  View', shortcut: 'F3', onClick: () => openView(doc) },
      { label: '✏️  Edit', shortcut: 'Ctrl+J', onClick: () => openEdit(doc) },
      { separator: true },
      { label: '↕  Expand all', onClick: () => setDocExpands(p => ({ ...p, [idx]: { tick: (p[idx]?.tick || 0) + 1, target: true } })) },
      { label: '↑  Collapse all', onClick: () => setDocExpands(p => ({ ...p, [idx]: { tick: (p[idx]?.tick || 0) + 1, target: false } })) },
      { separator: true },
      { label: '📋  Copy', shortcut: 'Ctrl+C', onClick: () => handleCopy(doc) },
      { label: '💾  Export JSON', onClick: () => handleExport(doc) },
      { separator: true },
      { label: '➕  Add field', onClick: () => {
        const updated = { ...doc, newField: '' };
        setEditingDoc(updated);
        setEditJson(JSON.stringify(updated, null, 2));
        setEditError(null);
      }},
      { separator: true },
      { label: '🗑  Delete', onClick: () => handleDelete(doc) },
    ];
  };

  const getKeys = (): string[] => {
    if (documents.length === 0) return [];
    const keys = new Set<string>();
    documents.forEach(doc => Object.keys(doc).forEach(k => keys.add(k)));
    return Array.from(keys);
  };

  const keys = getKeys();
  const fields = allFields();
  const jsonValid = validateJson(editJson);

  const findMatchCount = (text: string, query: string) => {
    if (!query) return 0;
    return (text.match(new RegExp(escapeRe(query), 'gi')) || []).length;
  };
  const editMatchCount = findMatchCount(editJson, editFind);
  const viewText = viewingDoc ? JSON.stringify(viewingDoc, null, 2) : '';
  const viewMatchCount = findMatchCount(viewText, viewFind);

  const hasSelection = selectedIndices.size > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="toolbar">
        <div className="view-toggle">
          <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>
            <span className="toolbar-label">☰ Table</span>
          </button>
          <button className={viewMode === 'tree' ? 'active' : ''} onClick={() => setViewMode('tree')}>
            <span className="toolbar-label">🌲 Tree</span>
          </button>
        </div>
        <button
          className={`secondary${showQB ? ' active-secondary' : ''}`}
          onClick={() => setShowQB(v => !v)}
        >
          <span className="toolbar-label">🔧 Filter</span>
        </button>
        <span className="toolbar-label" style={{ fontSize: 12, color: '#888' }}>Limit:</span>
        <input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} style={{ width: 60 }} />
        <button onClick={applyFilter} disabled={loading}>{loading ? '…' : '▶ Run'}</button>
        <button className="secondary" onClick={resetFilter}>↺ Reset</button>
        <button className="secondary" title="Add document (Ctrl+D)" onClick={openAddDoc}>➕ Add</button>
        {viewMode === 'tree' && (
          <>
            <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch', margin: '0 2px' }} />
            <button className="secondary" title="Expand all" onClick={() => { setExpandTarget(true); setExpandTick(t => t + 1); }}>↕</button>
            <button className="secondary" title="Collapse all" onClick={() => { setExpandTarget(false); setExpandTick(t => t + 1); }}>↑</button>
          </>
        )}
      </div>

      {/* Bulk action bar */}
      <div className={`bulk-action-bar${hasSelection ? ' bulk-action-bar--active' : ''}`}>
        <span>{selectedIndices.size} selected</span>
        <button className="secondary" onClick={handleBulkCopy} disabled={!hasSelection} title="Copy selected (Ctrl+C)">📋 Copy</button>
        <button className="secondary" onClick={handlePaste} title="Paste from clipboard (Ctrl+V)">📌 Paste</button>
        <button style={hasSelection ? { background: 'var(--error)' } : {}} className={hasSelection ? '' : 'secondary'} onClick={handleBulkDelete} disabled={!hasSelection} title="Delete selected (Del)">🗑 Delete</button>
        <button className="secondary" onClick={() => setSelectedIndices(new Set())} disabled={!hasSelection}>✗ Deselect all</button>
      </div>

      {error && <div style={{ padding: '6px 12px', color: '#f48771', fontSize: 12, background: '#2d1a1a' }}>{error}</div>}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {showQB && (
          <div className="query-builder-panel">
            <div className="qb-section-title">Fields</div>
            <div className="qb-fields">
              {fields.map(f => (
                <div key={f} className="qb-field-item" draggable
                  onDragStart={e => e.dataTransfer.setData('field', f)}
                  onClick={() => addCondition(f)} title="Click or drag to add condition"
                >{f}</div>
              ))}
              {fields.length === 0 && <div style={{ color: '#555', fontSize: 11, padding: 4 }}>No documents loaded</div>}
            </div>
            <div className="qb-section-title" style={{ marginTop: 12 }}>Conditions</div>
            <div className={`qb-conditions-drop${dragOver ? ' drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDropField}
            >
              {conditions.length === 0 && <div className="qb-empty-drop">Drop field here</div>}
              {conditions.map(c => (
                <div key={c.id} className="qb-condition">
                  <span className="qb-field-tag" title={c.field}>{c.field}</span>
                  <select value={c.op} onChange={e => updateCondition(c.id, { op: e.target.value as Operator })}>
                    {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {c.op !== '$exists' && (
                    <input value={c.value} onChange={e => updateCondition(c.id, { value: e.target.value })}
                      placeholder="value" onKeyDown={e => e.key === 'Enter' && applyFilter()} />
                  )}
                  <button onClick={() => removeCondition(c.id)}>×</button>
                </div>
              ))}
            </div>
            {conditions.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                <button style={{ flex: 1, fontSize: 12 }} onClick={applyFilter}>Run</button>
                <button className="secondary" style={{ fontSize: 12 }} onClick={resetFilter}>Reset</button>
              </div>
            )}
          </div>
        )}

        <div
          style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}
          onContextMenu={e => { e.preventDefault(); setEmptyCtxMenu({ x: e.clientX, y: e.clientY }); }}
        >
          {documents.length === 0 && !loading && !error && (
            <div style={{ padding: 24, color: '#888', textAlign: 'center' }}>No documents</div>
          )}

          {viewMode === 'table' && keys.length > 0 && (
            <div className="document-table">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 32, padding: '0 8px' }}>
                      <input
                        type="checkbox"
                        checked={documents.length > 0 && selectedIndices.size === documents.length}
                        ref={el => { if (el) el.indeterminate = selectedIndices.size > 0 && selectedIndices.size < documents.length; }}
                        onChange={() => {
                          if (selectedIndices.size === documents.length) setSelectedIndices(new Set());
                          else setSelectedIndices(new Set(documents.map((_, i) => i)));
                        }}
                      />
                    </th>
                    {keys.map(k => <th key={k}>{k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc, idx) => (
                    <tr key={idx}
                      className={selectedIndices.has(idx) ? 'doc-row-selected' : ''}
                      onClick={e => handleDocClick(idx, e)}
                      onMouseDown={e => { if (e.shiftKey) e.preventDefault(); }}
                      onDoubleClick={() => openEdit(doc)}
                      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); handleDocClick(idx, e); setCtxMenu({ x: e.clientX, y: e.clientY, idx }); }}
                    >
                      <td style={{ width: 32, padding: '0 8px' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIndices.has(idx)}
                          onChange={() => {
                            setSelectedIndices(prev => {
                              const n = new Set(prev);
                              if (n.has(idx)) n.delete(idx); else n.add(idx);
                              return n;
                            });
                            lastSelectedIdx.current = idx;
                          }}
                        />
                      </td>
                      {keys.map(k => (
                        <td key={k}>
                          {doc[k] === undefined ? '' : typeof doc[k] === 'object' ? JSON.stringify(doc[k]) : String(doc[k])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {viewMode === 'tree' && (
            <div className="tree-view-container" style={{ userSelect: 'none' }}>
              {documents.map((doc, idx) => (
                <DocumentTree
                  key={idx}
                  doc={doc}
                  selected={selectedIndices.has(idx)}
                  onSelect={e => handleDocClick(idx, e)}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); handleDocClick(idx, e); setCtxMenu({ x: e.clientX, y: e.clientY, idx }); }}
                  expandTick={expandTick}
                  expandTarget={expandTarget}
                  docExpTick={docExpands[idx]?.tick ?? 0}
                  docExpTarget={docExpands[idx]?.target ?? true}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="status-bar">
        <span>{total} total{hasSelection ? ` · ${selectedIndices.size} selected` : ''}</span>
        <span style={{ flex: 1, textAlign: 'center', fontFamily: 'monospace', fontSize: 11 }}>
          {conditions.length > 0 ? JSON.stringify(buildFilter(conditions)) : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="page-btn" onClick={() => goToPage(0)} disabled={page === 0 || loading}>«</button>
          <button className="page-btn" onClick={() => goToPage(page - 1)} disabled={page === 0 || loading}>‹</button>
          <span style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
            {total === 0 ? '0 / 0' : `${page * limit + 1}–${Math.min((page + 1) * limit, total)} / ${total}`}
          </span>
          <button className="page-btn" onClick={() => goToPage(page + 1)} disabled={(page + 1) * limit >= total || loading}>›</button>
          <button className="page-btn" onClick={() => goToPage(Math.ceil(total / limit) - 1)} disabled={(page + 1) * limit >= total || loading}>»</button>
        </div>
        <span>{database}.{collection}</span>
      </div>

      {/* Doc context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          items={buildCtxItems(ctxMenu.idx)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Empty area context menu */}
      {emptyCtxMenu && (
        <ContextMenu
          x={emptyCtxMenu.x} y={emptyCtxMenu.y}
          items={[{ label: '➕  Add document', shortcut: 'Ctrl+D', onClick: openAddDoc }]}
          onClose={() => setEmptyCtxMenu(null)}
        />
      )}

      {/* Add document modal */}
      {showAddDoc && (() => {
        const addValid = validateJson(addJson);
        return (
          <div className="modal-overlay" onClick={() => setShowAddDoc(false)}>
            <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Add document</h3>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="secondary" style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => setAddJson(formatJson(addJson))}>Format</button>
                  {addValid
                    ? <span style={{ fontSize: 11, color: 'var(--error)' }}>✕ {addValid}</span>
                    : <span style={{ fontSize: 11, color: 'var(--success)' }}>✓ Valid</span>}
                  <button className="icon-btn" onClick={() => setShowAddDoc(false)}>✕</button>
                </div>
              </div>
              <div className="modal-body">
                {addError && <div style={{ color: '#f48771', marginBottom: 8, fontSize: 12 }}>{addError}</div>}
                <textarea
                  ref={addTextareaRef}
                  value={addJson}
                  onChange={e => { setAddJson(e.target.value); setAddError(null); }}
                  style={{
                    width: '100%', height: 420,
                    background: '#1e1e1e', border: `1px solid ${addValid ? '#6b2b2b' : '#3c3c3c'}`,
                    color: '#cccccc', fontFamily: 'Consolas, Monaco, monospace',
                    fontSize: 13, padding: 12, resize: 'vertical', borderRadius: 4,
                  }}
                  onKeyDown={e => {
                    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); handleAddSave(); }
                    if (e.key === 'Escape') { e.preventDefault(); setShowAddDoc(false); }
                  }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Ctrl+Enter save · Esc close · Paste an array [ ] to insert multiple
                </div>
              </div>
              <div className="modal-footer">
                <button className="secondary" onClick={() => setShowAddDoc(false)}>Cancel</button>
                <button onClick={handleAddSave} disabled={!!addValid}>Add</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit modal */}
      {editingDoc && (() => {
        const isDirty = editJson !== originalEditJson;
        const diff = isDirty ? computeDiff(originalEditJson, editJson) : null;
        return (
          <div className="modal-overlay" onClick={() => closeEdit()}>
            <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  Edit — {String(editingDoc._id)}
                  {isDirty && <span className="edit-dirty-badge">● modified</span>}
                </h3>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="secondary" style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => setEditJson(formatJson(editJson))}>Format</button>
                  {jsonValid
                    ? <span style={{ fontSize: 11, color: 'var(--error)' }}>✕ {jsonValid}</span>
                    : <span style={{ fontSize: 11, color: 'var(--success)' }}>✓ Valid</span>}
                  <button className="icon-btn" onClick={() => closeEdit()}>✕</button>
                </div>
              </div>
              {showEditFind && (
                <div className="find-bar">
                  <input ref={editFindRef} className="find-input" placeholder="Find…"
                    value={editFind}
                    onChange={e => { setEditFind(e.target.value); setEditFindIdx(0); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') findInEdit(e.shiftKey ? -1 : 1);
                      if (e.key === 'Escape') { setShowEditFind(false); setEditFind(''); }
                    }}
                  />
                  <span className="find-count">{editFind ? `${editMatchCount} match${editMatchCount !== 1 ? 'es' : ''}` : ''}</span>
                  <button className="find-nav" onClick={() => findInEdit(-1)}>↑</button>
                  <button className="find-nav" onClick={() => findInEdit(1)}>↓</button>
                  <button className="find-close" onClick={() => { setShowEditFind(false); setEditFind(''); }}>✕</button>
                </div>
              )}
              <div className="modal-body">
                {editError && <div style={{ color: '#f48771', marginBottom: 8, fontSize: 12 }}>{editError}</div>}
                <textarea
                  ref={editTextareaRef}
                  value={editJson}
                  onChange={e => { setEditJson(e.target.value); setEditError(null); }}
                  style={{
                    width: '100%', height: diff && diff.length > 0 ? 340 : 420,
                    background: '#1e1e1e', border: `1px solid ${jsonValid ? '#6b2b2b' : '#3c3c3c'}`,
                    color: '#cccccc', fontFamily: 'Consolas, Monaco, monospace',
                    fontSize: 13, padding: 12, resize: 'vertical', borderRadius: 4,
                  }}
                  onKeyDown={e => {
                    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); handleSave(); }
                    if (e.ctrlKey && e.key === 'f') { e.preventDefault(); setShowEditFind(v => !v); setTimeout(() => editFindRef.current?.focus(), 50); }
                  }}
                />
                {diff && diff.length > 0 && (
                  <div className="edit-diff-panel">
                    <div className="edit-diff-title">Changes ({diff.length})</div>
                    {diff.map((d, i) => (
                      <div key={i} className={`diff-entry diff-${d.type}`}>
                        <span className="diff-path">{d.path}</span>
                        <span className="diff-vals">
                          {d.type === 'removed' && <span className="diff-old">{truncate(d.oldVal)}</span>}
                          {d.type === 'added' && <span className="diff-new">+ {truncate(d.newVal)}</span>}
                          {d.type === 'changed' && (
                            <>
                              <span className="diff-old">{truncate(d.oldVal)}</span>
                              <span className="diff-arrow">→</span>
                              <span className="diff-new">{truncate(d.newVal)}</span>
                            </>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Ctrl+Enter save · Ctrl+F find · Esc close
                </div>
              </div>
              <div className="modal-footer">
                <button className="secondary" onClick={() => closeEdit()}>Cancel</button>
                <button onClick={handleSave} disabled={!!jsonValid}>Save</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* View modal */}
      {viewingDoc && (
        <div className="modal-overlay" onClick={() => setViewingDoc(null)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setViewingDoc(null); }}>
            <div className="modal-header">
              <h3>View — {String(viewingDoc._id)}</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="secondary" style={{ fontSize: 12 }}
                  onClick={() => { openEdit(viewingDoc); setViewingDoc(null); }}>Edit (Ctrl+J)</button>
                <button className="icon-btn" onClick={() => setViewingDoc(null)}>✕</button>
              </div>
            </div>
            {showViewFind && (
              <div className="find-bar">
                <input
                  ref={viewFindRef}
                  className="find-input"
                  placeholder="Find…"
                  value={viewFind}
                  onChange={e => setViewFind(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setShowViewFind(false); setViewFind(''); } }}
                />
                <span className="find-count">{viewFind ? `${viewMatchCount} match${viewMatchCount !== 1 ? 'es' : ''}` : ''}</span>
                <button className="find-close" onClick={() => { setShowViewFind(false); setViewFind(''); }}>✕</button>
              </div>
            )}
            <div className="modal-body" onKeyDown={e => {
              if (e.ctrlKey && e.key === 'f') { e.preventDefault(); setShowViewFind(v => !v); setTimeout(() => viewFindRef.current?.focus(), 50); }
            }} tabIndex={-1}>
              <pre
                style={{
                  background: '#1e1e1e', border: '1px solid #3c3c3c', color: '#cccccc',
                  fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, padding: 12,
                  borderRadius: 4, overflow: 'auto', maxHeight: 500, margin: 0,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}
                dangerouslySetInnerHTML={{ __html: highlightText(viewText, viewFind) }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                Ctrl+F find
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setViewingDoc(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
