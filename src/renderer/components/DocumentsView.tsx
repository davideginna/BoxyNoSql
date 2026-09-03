import { useState, useEffect, useRef, useCallback } from 'react';
import DocumentTree from './DocumentTree';
import ContextMenu, { ContextMenuEntry } from './ContextMenu';
import Icon from './Icon';
import { showConfirm, showAlert } from '../dialog';
import { isTypingTarget } from '../utils/dom';
import { onEscape, onRunKey } from '../utils/keys';
import { buildFilter, detectType, OPERATORS_BY_TYPE, TYPE_COLORS, TYPE_LABELS, type Operator, type Condition, type FieldType } from '../utils/buildFilter';
import {
  cycleSort, buildSort, buildProjection, knownFields, toggleHidden,
  loadHiddenFields, saveHiddenFields, sortTooltip, SORT_DIR_LABEL, SORT_DIR_HINT,
  type SortKey, type SortDir,
} from '../utils/docTable';
import QueryHistoryMenu, { useQueryHistory } from './QueryHistoryMenu';
import { useVirtualRows, VirtualSpacer } from './VirtualRows';
import BulkEditModal from './BulkEditModal';
import ExplainModal from './ExplainModal';
import { showToast } from '../toast';
import { previewLabel, type QueryEntry } from '../utils/queryHistory';
import MonacoJsonEditor, { type MonacoJsonEditorHandle } from './MonacoJsonEditor';
import type { MonacoThemeName } from './MonacoQueryEditor';

type ViewMode = 'table' | 'tree';

interface DocumentsViewProps {
  connectionId: string;
  database: string;
  collection: string;
  /** False for a tab that is mounted but not on screen — see `MainContent`. */
  active?: boolean;
  /** Connection flag: every write is refused by the main process anyway, this
   *  only keeps the buttons from offering what will be rejected. */
  readOnly?: boolean;
}

// Shell-style pretty print: {$oid:"x"} → ObjectId("x"), {$date:"x"} → ISODate("x")
function prettyDoc(doc: any): string {
  return JSON.stringify(doc, null, 2)
    .replace(/\{\s*"\$oid":\s*"([0-9a-fA-F]{24})"\s*\}/g, 'ObjectId("$1")')
    .replace(/\{\s*"\$date":\s*"([^"\\]+)"\s*\}/g, 'ISODate("$1")');
}

function normalizePretty(text: string): string {
  return text
    .replace(/ObjectId\(\s*"([0-9a-fA-F]{24})"\s*\)/g, '{"$$oid":"$1"}')
    .replace(/ObjectId\(\s*'([0-9a-fA-F]{24})'\s*\)/g, '{"$$oid":"$1"}')
    .replace(/ISODate\(\s*"([^"]+)"\s*\)/g, '{"$$date":"$1"}')
    .replace(/ISODate\(\s*'([^']+)'\s*\)/g, '{"$$date":"$1"}');
}

function formatJson(raw: string): string {
  try { return prettyDoc(JSON.parse(normalizePretty(raw))); } catch { return raw; }
}

function validateJson(raw: string): string | null {
  try { JSON.parse(normalizePretty(raw)); return null; } catch (e: any) { return e.message; }
}

function parseEditable(raw: string): any {
  return JSON.parse(normalizePretty(raw));
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
    const orig = parseEditable(origJson);
    const curr = parseEditable(currJson);
    return diffObjects(orig, curr);
  } catch { return null; }
}

function truncate(v: any, max = 60): string {
  const s = JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Single-pass JSON tokenizer → colored HTML. No HTML attr collision.
function highlightJson(raw: string): string {
  const safe = escapeHtml(raw);
  const re = /(ObjectId|ISODate)\(("(?:\\.|[^"\\])*")\)|("(?:\\.|[^"\\])*")(\s*:)?|\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b(true|false|null)\b/g;
  return safe.replace(re, (_m, wrap, wrapStr, str, colon, num, kw) => {
    if (wrap) return `<span class="jo">${wrap}(</span><span class="js">${wrapStr}</span><span class="jo">)</span>`;
    if (str) return colon
      ? `<span class="jk">${str}</span>${colon}`
      : `<span class="js">${str}</span>`;
    if (num) return `<span class="jn">${num}</span>`;
    if (kw) return kw === 'null'
      ? `<span class="jl">null</span>`
      : `<span class="jb">${kw}</span>`;
    return _m;
  });
}

function highlightText(text: string, query: string): string {
  const colored = highlightJson(text);
  if (!query) return colored;
  // Highlight find matches on top; match against escaped raw (case-insensitive)
  // Simple approach: re-highlight using escaped query over the already-colored string;
  // skip inside tags.
  const q = escapeRe(escapeHtml(query));
  return colored.replace(new RegExp(`(${q})(?![^<]*>)`, 'gi'), '<mark class="find-mark">$1</mark>');
}

const inv = (ch: string, ...a: any[]) => (window as any).electron.invoke(ch, ...a);

// Line numbers are a pure UI preference, so they live in localStorage next to
// `theme` / `sidebarWidth`, and they are shared by every JSON editor.
const LINE_NUMBERS_KEY = 'docLineNumbers';
export const loadLineNumbers = () => localStorage.getItem(LINE_NUMBERS_KEY) !== 'false';
export const saveLineNumbers = (on: boolean) => localStorage.setItem(LINE_NUMBERS_KEY, String(on));

const WRAP_KEY = 'docEditorWrap';
export const loadWrap = () => localStorage.getItem(WRAP_KEY) === 'true';
export const saveWrap = (on: boolean) => localStorage.setItem(WRAP_KEY, String(on));

function idToString(id: any): string {
  if (id === null || id === undefined) return '';
  if (typeof id === 'object' && '$oid' in id) return id.$oid;
  return String(id);
}

let condId = 0;

// Starting guesses for the row heights of the two view modes, used only until a
// row of that kind has actually been on screen. Both are a collapsed row: a
// table row is one line of text, a tree row is its header plus the gap.
// Exported so the tests can fake a layout that matches, and the arithmetic in
// their assertions stays exact.
export const TABLE_ROW_ESTIMATE = 28;
export const TREE_ROW_ESTIMATE = 32;

export default function DocumentsView({ connectionId, database, collection, active = true, readOnly = false }: DocumentsViewProps) {
  // Same detection as QueryTerminal/AggregationBuilder: App re-renders this
  // tree on theme change.
  const monacoTheme: MonacoThemeName =
    document.body.classList.contains('theme-light') ? 'vs'
    : document.body.classList.contains('theme-hc') ? 'hc-black'
    : document.body.classList.contains('theme-solarized') ? 'boxy-solarized'
    : 'vs-dark';
  const [documents, setDocuments] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  // Closed by default: an empty builder took ~20% of the width to show a
  // placeholder. The toolbar Filter button opens it and carries the count.
  const [showQB, setShowQB] = useState(false);
  const [matchAll, setMatchAll] = useState(true);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  // Unfiltered totals come from collection metadata, so they are approximate.
  const [totalEstimated, setTotalEstimated] = useState(false);
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
  const [showQueryModal, setShowQueryModal] = useState(false);
  // Add document modal
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [addJson, setAddJson] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const addEditorRef = useRef<MonacoJsonEditorHandle>(null);
  // Find in view modal
  const [viewFind, setViewFind] = useState('');
  const [showViewFind, setShowViewFind] = useState(false);
  // Find in edit modal
  const [editFind, setEditFind] = useState('');
  const [showEditFind, setShowEditFind] = useState(false);
  const [editFindIdx, setEditFindIdx] = useState(0);
  const editEditorRef = useRef<MonacoJsonEditorHandle>(null);
  const viewFindRef = useRef<HTMLInputElement>(null);
  const editFindRef = useRef<HTMLInputElement>(null);
  // Line-number gutter, shared by the add and edit editors and remembered.
  const [lineNumbers, setLineNumbers] = useState(loadLineNumbers);
  // Soft-wrap, edit editor only, also remembered.
  const [editWrap, setEditWrap] = useState(loadWrap);
  // Edit modal fills the window while true; not persisted, resets per session.
  const [editMaximized, setEditMaximized] = useState(false);
  // Sort keys (in precedence order) and hidden fields. Both go to the server on
  // every load — see utils/docTable.ts. Sort resets per collection; the hidden
  // fields are remembered per collection in localStorage.
  const [sortKeys, setSortKeys] = useState<SortKey[]>([]);
  const [hiddenFields, setHiddenFields] = useState<string[]>([]);
  const [showFieldsMenu, setShowFieldsMenu] = useState(false);
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number } | null>(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showExplain, setShowExplain] = useState(false);

  useEffect(() => { saveLineNumbers(lineNumbers); }, [lineNumbers]);
  useEffect(() => { saveWrap(editWrap); }, [editWrap]);

  // Both view modes are windowed: a page limit of a few thousand used to put a
  // few thousand rows — or a few thousand `DocumentTree`s — in the DOM at once,
  // and laying that out is what locked the UI. Selection stays keyed by the
  // index into `documents`, never by what happens to be mounted, so select-all,
  // shift-ranges and the bulk bar count are unaffected by which rows exist.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const tableWin = useVirtualRows({
    scrollerRef: tableScrollRef, listRef: tableBodyRef, count: documents.length,
    estimate: TABLE_ROW_ESTIMATE, resetKey: documents,
  });
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const treeListRef = useRef<HTMLDivElement>(null);
  const treeWin = useVirtualRows({
    scrollerRef: treeScrollRef, listRef: treeListRef, count: documents.length,
    estimate: TREE_ROW_ESTIMATE, resetKey: documents,
  });

  // `keys`/`hidden` are explicit rather than read from state because every
  // caller that changes them loads in the same handler, before React has
  // re-rendered with the new value.
  const loadDocuments = async (filter: any, lim: number, pg: number, keys: SortKey[] = sortKeys, hidden: string[] = hiddenFields) => {
    setLoading(true); setError(null);
    try {
      const result = await inv(
        'get-documents', connectionId, database, collection, filter, lim, pg * lim,
        buildSort(keys), buildProjection(hidden),
      );
      setDocuments(result.docs);
      setTotal(result.total);
      setTotalEstimated(!!result.estimated);
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  };

  useEffect(() => {
    setConditions([]); setSelectedIndices(new Set()); setDocExpands({});
    setPage(0); setTotal(0);
    const hidden = loadHiddenFields(connectionId, database, collection);
    setSortKeys([]); setHiddenFields(hidden); setShowFieldsMenu(false);
    loadDocuments({}, limit, 0, [], hidden);
  }, [connectionId, database, collection]);

  const history = useQueryHistory('filter', connectionId, database, collection);

  const applyFilter = () => {
    const filter = buildFilter(conditions, matchAll);
    // An empty filter is not worth remembering — it is what Reset does.
    if (conditions.length > 0) {
      history.record(
        JSON.stringify({ matchAll, conditions: conditions.map(({ id: _id, ...rest }) => rest) }),
        previewLabel(JSON.stringify(filter)),
      );
    }
    setPage(0);
    loadDocuments(filter, limit, 0);
  };

  // A recalled filter carries no condition ids — they are per-session UI keys.
  const recallFilter = (entry: QueryEntry) => {
    let parsed: { matchAll: boolean; conditions: Omit<Condition, 'id'>[] };
    try { parsed = JSON.parse(entry.body); } catch { return; }
    const restored = parsed.conditions.map(c => ({ ...c, id: ++condId }));
    setConditions(restored);
    setMatchAll(parsed.matchAll);
    setShowQB(true);
    setPage(0);
    loadDocuments(buildFilter(restored, parsed.matchAll), limit, 0);
  };
  const resetFilter = () => { setConditions([]); setPage(0); loadDocuments({}, limit, 0); };
  const goToPage = (pg: number) => { setPage(pg); loadDocuments(buildFilter(conditions, matchAll), limit, pg); };

  // Sorting and hiding both re-run the query from page 0: the current page of a
  // differently-sorted result is a different set of documents, and a stale page
  // number would point past the end of nothing in particular.
  const applySort = (keys: SortKey[]) => {
    setSortKeys(keys); setPage(0); setSelectedIndices(new Set());
    loadDocuments(buildFilter(conditions, matchAll), limit, 0, keys);
  };
  const headerSort = (field: string, additive: boolean) => applySort(cycleSort(sortKeys, field, additive));
  const sortField = (field: string, dir: SortDir) => {
    const current = sortKeys.find(k => k.field === field);
    applySort(current && current.dir === dir ? sortKeys.filter(k => k.field !== field) : [{ field, dir }]);
  };

  const applyHidden = (hidden: string[]) => {
    setHiddenFields(hidden);
    saveHiddenFields(connectionId, database, collection, hidden);
    setPage(0);
    loadDocuments(buildFilter(conditions, matchAll), limit, 0, sortKeys, hidden);
  };

  // The fields popover is a plain absolutely-positioned div, not a modal, so it
  // needs its own outside-click handling; Escape rides the shared stack.
  const fieldsMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showFieldsMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!fieldsMenuRef.current?.contains(e.target as Node)) setShowFieldsMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    const offEsc = onEscape(() => setShowFieldsMenu(false));
    return () => {
      document.removeEventListener('mousedown', onDown);
      offEsc();
    };
  }, [showFieldsMenu]);

  /**
   * The document as it is stored, not as the list shows it. While fields are
   * hidden the rows come back projected, and saving one of those would
   * `replaceOne` the hidden fields out of existence — so re-read the whole
   * document by `_id` before it reaches an editor or a viewer.
   */
  const fetchFull = async (doc: any): Promise<any> => {
    if (hiddenFields.length === 0) return doc;
    try {
      const res = await inv('get-documents', connectionId, database, collection, { _id: doc._id }, 1, 0, null, null);
      return res.docs?.[0] ?? doc;
    } catch { return doc; }
  };

  const openEdit = useCallback(async (doc: any) => {
    const full = await fetchFull(doc);
    const json = prettyDoc(full);
    setEditingDoc(full);
    setEditJson(json);
    setOriginalEditJson(json);
    setEditError(null);
    setShowEditFind(false);
    setEditFind('');
  }, [hiddenFields, connectionId, database, collection]);

  const closeEdit = useCallback(async (skipConfirm = false) => {
    const isDirty = editJson !== originalEditJson;
    if (!skipConfirm && isDirty) {
      const ok = await showConfirm({ message: 'Close without saving changes?' });
      if (!ok) return;
    }
    setEditingDoc(null);
  }, [editJson, originalEditJson]);

  // Escape closes whatever is innermost. Registered per modal so the stack
  // order matches what the user sees; the find bar goes before its modal.
  useEffect(() => {
    if (!active || !editingDoc) return;
    return onEscape(() => {
      if (showEditFind) { setShowEditFind(false); setEditFind(''); return; }
      // Same path as the Cancel button: it asks before throwing away edits.
      closeEdit();
    });
  }, [active, editingDoc, showEditFind, closeEdit]);

  useEffect(() => {
    if (!active || !viewingDoc) return;
    return onEscape(() => {
      if (showViewFind) { setShowViewFind(false); setViewFind(''); return; }
      setViewingDoc(null);
    });
  }, [active, viewingDoc, showViewFind]);

  useEffect(() => active && showAddDoc ? onEscape(() => setShowAddDoc(false)) : undefined, [active, showAddDoc]);
  useEffect(() => active && showQueryModal ? onEscape(() => setShowQueryModal(false)) : undefined, [active, showQueryModal]);

  // Alt+Enter runs, from anywhere in the view — including from inside the
  // filter fields, which is where you are when you want to run. Ctrl+Enter in
  // the modals keeps its own meaning (save), so this only fires with no modal.
  useEffect(() => {
    if (!active || editingDoc || viewingDoc || showAddDoc || showQueryModal || showExplain) return;
    return onRunKey(e => { e.preventDefault(); applyFilter(); });
  }, [active, editingDoc, viewingDoc, showAddDoc, showQueryModal, showExplain, conditions, matchAll, limit, sortKeys, hiddenFields]);

  const openAddDoc = useCallback(() => {
    setAddJson('{\n  \n}');
    setAddError(null);
    setShowAddDoc(true);
    setTimeout(() => addEditorRef.current?.selectOffsetRange(4, 4), 50);
  }, []);

  const handleAddSave = async () => {
    setAddError(null);
    const jsonErr = validateJson(addJson);
    if (jsonErr) { setAddError('Invalid JSON: ' + jsonErr); return; }
    let parsed: any;
    try { parsed = parseEditable(addJson); } catch (e: any) { setAddError('Invalid JSON: ' + e.message); return; }
    try {
      const docs = Array.isArray(parsed) ? parsed : [parsed];
      await inv('insert-documents', connectionId, database, collection, docs);
      setShowAddDoc(false);
      loadDocuments(buildFilter(conditions, matchAll), limit, page);
    } catch (err: any) { setAddError(err.message); }
  };

  const openView = useCallback(async (doc: any) => {
    setViewingDoc(await fetchFull(doc));
    setShowViewFind(false);
    setViewFind('');
  }, [hiddenFields, connectionId, database, collection]);

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
    if (readOnly) return;
    if (selectedIndices.size === 0) return;
    const count = selectedIndices.size;
    const ok = await showConfirm({ message: `Delete ${count} document${count !== 1 ? 's' : ''}?`, danger: true, confirmText: 'Delete' });
    if (!ok) return;
    try {
      const toDelete = [...selectedIndices].map(i => documents[i]).filter(Boolean);
      await Promise.all(toDelete.map(doc =>
        inv('delete-document', connectionId, database, collection, idToString(doc._id))
      ));
      setSelectedIndices(new Set());
      loadDocuments(buildFilter(conditions, matchAll), limit, page);
    } catch (err: any) { setError(err.message); }
  }, [selectedIndices, documents, connectionId, database, collection, conditions, limit]);

  const handleBulkCopy = useCallback(() => {
    if (selectedIndices.size === 0) return;
    const docs = [...selectedIndices].sort((a, b) => a - b).map(i => documents[i]).filter(Boolean);
    const text = docs.length === 1 ? JSON.stringify(docs[0], null, 2) : JSON.stringify(docs, null, 2);
    navigator.clipboard.writeText(text);
  }, [selectedIndices, documents]);

  /**
   * One field across the selection. Typed confirmation is deliberately not
   * used here — this is reversible per field, unlike a drop — but the update
   * document is shown in the modal before it runs.
   */
  const applyBulkEdit = async (update: Record<string, any>, description: string) => {
    const ids = [...selectedIndices].map(i => documents[i]).filter(Boolean).map(d => idToString(d._id));
    if (!await showConfirm({ title: 'Edit field', message: `${description}?`, confirmText: 'Apply' })) return;
    try {
      const res = await inv('bulk-update-documents', connectionId, database, collection, ids, update);
      setShowBulkEdit(false);
      showToast({ message: `${res.modifiedCount} document${res.modifiedCount === 1 ? '' : 's'} updated`, kind: 'success' });
      loadDocuments(buildFilter(conditions, matchAll), limit, page);
    } catch (err: any) { setError(err.message); }
  };

  const handlePaste = useCallback(async () => {
    if (readOnly) return;
    try {
      const text = await navigator.clipboard.readText();
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { setError('Clipboard does not contain valid JSON'); return; }
      const docs = Array.isArray(parsed) ? parsed : [parsed];
      // Remove _id from pasted docs to avoid duplicate key errors
      const cleaned = docs.map(({ _id: _, ...rest }: any) => rest);
      await inv('insert-documents', connectionId, database, collection, cleaned);
      loadDocuments(buildFilter(conditions, matchAll), limit, page);
    } catch (err: any) { setError('Paste failed: ' + err.message); }
  }, [connectionId, database, collection, conditions, limit]);

  // Global keyboard shortcuts. Bound only by the tab on screen: every tab ever
  // opened stays mounted, so an unguarded handler would fire Ctrl+D once per
  // open documents tab.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape is not handled here at all: it goes through the shared stack
      // below, so the innermost thing open is the one that closes.
      // Inside a text field these keys belong to the field: Ctrl+C/V/X are the
      // clipboard, Delete/Backspace delete characters — not documents.
      if (isTypingTarget(e.target)) return;
      if (showAddDoc || showExplain) return;
      if (editingDoc) {
        if (e.ctrlKey && e.key === 'f') { e.preventDefault(); setShowEditFind(v => !v); setTimeout(() => editFindRef.current?.focus(), 50); }
        if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); handleSave(); }
        return;
      }
      if (viewingDoc) {
        if (e.ctrlKey && e.key === 'f') { e.preventDefault(); setShowViewFind(v => !v); setTimeout(() => viewFindRef.current?.focus(), 50); }
        return;
      }
      if (e.ctrlKey && e.key === 'd') { e.preventDefault(); if (!readOnly) openAddDoc(); return; }
      if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        if (documents.length > 0) setSelectedIndices(new Set(documents.map((_, i) => i)));
        return;
      }
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
  }, [active, readOnly, selectedIndices, documents, editingDoc, viewingDoc, showAddDoc, showExplain, showEditFind, openEdit, openView, openAddDoc, handleBulkDelete, handleBulkCopy, handlePaste]);

  // Find in edit editor
  const findInEdit = useCallback((dir: 1 | -1 = 1) => {
    if (!editFind) return;
    const text = editJson.toLowerCase();
    const query = editFind.toLowerCase();
    const positions: number[] = [];
    let pos = 0;
    while ((pos = text.indexOf(query, pos)) !== -1) { positions.push(pos); pos++; }
    if (positions.length === 0) return;
    const next = ((editFindIdx + dir) % positions.length + positions.length) % positions.length;
    setEditFindIdx(next);
    const start = positions[next];
    editEditorRef.current?.selectOffsetRange(start, start + editFind.length);
  }, [editJson, editFind, editFindIdx]);

  const allFields = (): { field: string; type: FieldType }[] => {
    const map = new Map<string, FieldType>();
    documents.forEach(doc => {
      Object.entries(doc).forEach(([k, v]) => {
        if (!map.has(k)) map.set(k, detectType(v));
      });
    });
    return Array.from(map.entries()).map(([field, type]) => ({ field, type })).sort((a, b) => a.field.localeCompare(b.field));
  };

  const addCondition = (field: string, type: FieldType = 'string', value = '') => {
    const ops = OPERATORS_BY_TYPE[type];
    const defaultOp = ops[0].value;
    setConditions(prev => [...prev, { id: ++condId, field, op: defaultOp, value, type }]);
  };
  const updateCondition = (id: number, changes: Partial<Condition>) => {
    setConditions(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, ...changes };
      if (changes.type && changes.type !== c.type) {
        const ops = OPERATORS_BY_TYPE[changes.type];
        updated.op = ops[0].value;
        updated.value = '';
      }
      if (changes.op && changes.op !== c.op) updated.value = '';
      return updated;
    }));
  };
  const removeCondition = (id: number) => {
    setConditions(prev => prev.filter(c => c.id !== id));
  };

  const handleDropField = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const raw = e.dataTransfer.getData('qb-field');
    if (raw) {
      try {
        const { field, type, value } = JSON.parse(raw);
        addCondition(field, type as FieldType, value);
        return;
      } catch {}
    }
    const plain = e.dataTransfer.getData('field');
    if (plain) addCondition(plain);
  };

  const handleSave = async () => {
    setEditError(null);
    const jsonErr = validateJson(editJson);
    if (jsonErr) { setEditError('Invalid JSON: ' + jsonErr); return; }
    let parsed: any;
    try { parsed = parseEditable(editJson); } catch (e: any) { setEditError('Invalid JSON: ' + e.message); return; }
    try {
      await inv('update-document', connectionId, database, collection, idToString(editingDoc._id), parsed);
      setEditingDoc(null);
      loadDocuments(buildFilter(conditions, matchAll), limit, page);
    } catch (err: any) { setEditError(err.message); }
  };

  const handleDelete = async (doc: any) => {
    if (!await showConfirm({ message: `Delete document ${idToString(doc._id)}?`, danger: true, confirmText: 'Delete' })) return;
    try {
      await inv('delete-document', connectionId, database, collection, idToString(doc._id));
      loadDocuments(buildFilter(conditions, matchAll), limit, page);
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
    a.download = `doc_${idToString(doc._id)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Export through the main process: the documents never come back to the
   * renderer, they go from the cursor straight to the file the native dialog
   * picked. `scope: 'view'` is what the toolbar shows — same filter, same sort,
   * same visible fields; `'all'` ignores every one of them.
   */
  const exportDocuments = async (format: 'json' | 'ndjson' | 'csv', scope: 'view' | 'all') => {
    const isView = scope === 'view';
    try {
      const res = await inv('export-documents', {
        connectionId, dbName: database, collection, format,
        filter: isView ? buildFilter(conditions, matchAll) : {},
        sort: isView ? buildSort(sortKeys) : null,
        projection: isView ? buildProjection(hiddenFields) : null,
        filtered: isView && conditions.length > 0,
      });
      if (res.canceled) return;
      await showAlert({
        title: 'Export complete',
        message: `${res.count} document${res.count === 1 ? '' : 's'} written.`,
        detail: res.filePath,
      });
    } catch (err: any) { setError(err.message); }
  };

  const exportItems = (): ContextMenuEntry[] => {
    const forScope = (scope: 'view' | 'all'): ContextMenuEntry[] =>
      (['json', 'ndjson', 'csv'] as const).map(f => ({
        label: f.toUpperCase(),
        icon: 'download' as const,
        onClick: () => exportDocuments(f, scope),
      }));
    return [
      { label: `Current view — filter, sort, ${hiddenFields.length > 0 ? 'visible fields only' : 'all fields'}`, icon: 'filter', disabled: true, onClick: () => {} },
      ...forScope('view'),
      { separator: true },
      { label: 'Whole collection', icon: 'collection', disabled: true, onClick: () => {} },
      ...forScope('all'),
    ];
  };

  const buildCtxItems = (idx: number): ContextMenuEntry[] => {
    const doc = documents[idx];
    return [
      { label: 'View', icon: 'eye', shortcut: 'F3', onClick: () => openView(doc) },
      { label: 'Edit', icon: 'edit', shortcut: 'Ctrl+J', disabled: readOnly, onClick: () => openEdit(doc) },
      { separator: true },
      { label: 'Expand all', icon: 'expandAll', onClick: () => setDocExpands(p => ({ ...p, [idx]: { tick: (p[idx]?.tick || 0) + 1, target: true } })) },
      { label: 'Collapse all', icon: 'collapseAll', onClick: () => setDocExpands(p => ({ ...p, [idx]: { tick: (p[idx]?.tick || 0) + 1, target: false } })) },
      { separator: true },
      { label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', onClick: () => handleCopy(doc) },
      { label: 'Export JSON', icon: 'save', onClick: () => handleExport(doc) },
      { separator: true },
      { label: 'Add field', icon: 'plus', disabled: readOnly, onClick: async () => {
        const updated = { ...await fetchFull(doc), newField: '' };
        setEditingDoc(updated);
        setEditJson(prettyDoc(updated));
        setEditError(null);
      }},
      { separator: true },
      { label: 'Delete', icon: 'trash', disabled: readOnly, onClick: () => handleDelete(doc) },
    ];
  };

  const getKeys = (): string[] => {
    if (documents.length === 0) return [];
    const keys = new Set<string>();
    documents.forEach(doc => Object.keys(doc).forEach(k => keys.add(k)));
    return Array.from(keys);
  };

  const keys = getKeys();
  const fieldOptions = knownFields(documents, hiddenFields).sort((a, b) => a === '_id' ? -1 : b === '_id' ? 1 : a.localeCompare(b));
  const jsonValid = validateJson(editJson);

  const findMatchCount = (text: string, query: string) => {
    if (!query) return 0;
    return (text.match(new RegExp(escapeRe(query), 'gi')) || []).length;
  };
  const editMatchCount = findMatchCount(editJson, editFind);
  const viewText = viewingDoc ? prettyDoc(viewingDoc) : '';
  const viewMatchCount = findMatchCount(viewText, viewFind);

  const hasSelection = selectedIndices.size > 0;

  return (
    <div className="docs-view">
      <div className="toolbar">
        <div className="view-toggle">
          <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>
            <span className="toolbar-label"><Icon name="menu" size={13} /> Table</span>
          </button>
          <button className={viewMode === 'tree' ? 'active' : ''} onClick={() => setViewMode('tree')}>
            <span className="toolbar-label"><Icon name="tree" size={13} /> Tree</span>
          </button>
        </div>
        <button
          className={`secondary${showQB ? ' active-secondary' : ''}`}
          onClick={() => setShowQB(v => !v)}
          title="Toggle query builder"
        >
          <span className="toolbar-label"><Icon name="filter" size={13} /> Filter{conditions.length > 0 ? ` (${conditions.length})` : ''}</span>
        </button>
        <button
          className="secondary"
          title="Export documents"
          onClick={e => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setExportMenu({ x: r.left, y: r.bottom + 4 });
          }}
        >
          <span className="toolbar-label"><Icon name="download" size={13} /> Export</span>
        </button>
        <QueryHistoryMenu
          history={history}
          onPick={recallFilter}
          current={() => ({
            body: JSON.stringify({ matchAll, conditions: conditions.map(({ id: _id, ...rest }) => rest) }),
            label: previewLabel(JSON.stringify(buildFilter(conditions, matchAll))),
          })}
        />
        <div className="fields-menu-wrap" ref={fieldsMenuRef}>
          <button
            className={`secondary${showFieldsMenu ? ' active-secondary' : ''}`}
            onClick={() => setShowFieldsMenu(v => !v)}
            title="Show/hide fields and sort"
          >
            <span className="toolbar-label">
              <Icon name="columns" size={13} /> Fields{hiddenFields.length > 0 ? ` (${hiddenFields.length} hidden)` : ''}
            </span>
          </button>
          {showFieldsMenu && (
            <div className="fields-menu">
              <div className="fields-menu-head">
                <span>Fields</span>
                <span className="fields-menu-hint">ASC = A→Z, oldest first · shift-click a column header to add a second key</span>
              </div>
              <div className="fields-menu-list">
                {fieldOptions.length === 0 && <div className="fields-menu-empty">No fields yet</div>}
                {fieldOptions.map(field => {
                  const key = sortKeys.find(k => k.field === field);
                  const hidden = hiddenFields.includes(field);
                  return (
                    <div key={field} className="fields-menu-row">
                      <label className="fields-menu-name" title={field === '_id' ? '_id is always shown — edit and delete need it' : field}>
                        <input
                          type="checkbox"
                          checked={!hidden}
                          disabled={field === '_id'}
                          onChange={() => applyHidden(toggleHidden(hiddenFields, field))}
                        />
                        <span className={hidden ? 'fields-menu-hidden' : ''}>{field}</span>
                      </label>
                      <button
                        className={`fields-sort-btn${key?.dir === 1 ? ' active' : ''}`}
                        title={`Sort ${field} ascending — ${SORT_DIR_HINT[1]}${key?.dir === 1 ? ' (click again to remove)' : ''}`}
                        onClick={() => sortField(field, 1)}
                      ><Icon name="arrowUp" size={11} /> ASC</button>
                      <button
                        className={`fields-sort-btn${key?.dir === -1 ? ' active' : ''}`}
                        title={`Sort ${field} descending — ${SORT_DIR_HINT[-1]}${key?.dir === -1 ? ' (click again to remove)' : ''}`}
                        onClick={() => sortField(field, -1)}
                      ><Icon name="arrowDown" size={11} /> DESC</button>
                    </div>
                  );
                })}
              </div>
              <div className="fields-menu-foot">
                <button className="secondary btn-xs" disabled={hiddenFields.length === 0} onClick={() => applyHidden([])}>Show all</button>
                <button className="secondary btn-xs" disabled={sortKeys.length === 0} onClick={() => applySort([])}>Clear sort</button>
              </div>
            </div>
          )}
        </div>
        {sortKeys.length > 0 && (
          <div className="sort-chips">
            {sortKeys.map(k => (
              <button
                key={k.field}
                className="sort-chip"
                title={`Sorted ${SORT_DIR_LABEL[k.dir]} by ${k.field} (${SORT_DIR_HINT[k.dir]}).\nClick to remove this sort key.`}
                onClick={() => applySort(sortKeys.filter(s => s.field !== k.field))}
              >
                {k.field}
                <Icon name={k.dir === 1 ? 'arrowUp' : 'arrowDown'} size={10} />
                {k.dir === 1 ? 'ASC' : 'DESC'}
                <Icon name="close" size={10} />
              </button>
            ))}
          </div>
        )}
        <span className="toolbar-label toolbar-limit-label">Limit:</span>
        {/* Clamped to 1: `limit: 0` is "no limit" to MongoDB, so an emptied
            field used to fetch the whole collection. Big pages are fine now —
            the rows are windowed — but they are still one round trip. */}
        <input
          type="number" className="toolbar-limit-input" min={1} value={limit}
          title="Documents per page. Rows are windowed, so a few thousand scroll without freezing"
          onChange={e => setLimit(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
        />
        <button onClick={applyFilter} disabled={loading}>{loading ? '…' : <><Icon name="play" size={12} /> Run</>}</button>
        <button className="secondary" onClick={resetFilter}><Icon name="refresh" size={13} /> Reset</button>
        <button
          className="secondary" onClick={() => setShowExplain(true)}
          title="Explain this filter — index usage, documents examined, timings"
        ><Icon name="plan" size={13} /> Explain</button>
        <button
          className="secondary" onClick={openAddDoc} disabled={readOnly}
          title={readOnly ? 'This connection is read-only' : 'Add document (Ctrl+D)'}
        ><Icon name="plus" size={13} /> Add</button>
        {/* Paste creates documents, so it belongs next to Add — it is the one
            bulk action that works with nothing selected. */}
        <button
          className="secondary" onClick={handlePaste} disabled={readOnly}
          title={readOnly ? 'This connection is read-only' : 'Paste from clipboard (Ctrl+V)'}
        ><Icon name="pin" size={13} /> Paste</button>
        {viewMode === 'tree' && (
          <>
            <div className="toolbar-divider" />
            <button className="secondary" title="Expand all" onClick={() => { setExpandTarget(true); setExpandTick(t => t + 1); }}><Icon name="expandAll" size={13} /></button>
            <button className="secondary" title="Collapse all" onClick={() => { setExpandTarget(false); setExpandTick(t => t + 1); }}><Icon name="collapseAll" size={13} /></button>
          </>
        )}
      </div>

      {/* Bulk action bar — only while something is selected; with an empty
          selection every button in it was disabled anyway. */}
      {hasSelection && (
        <div className="bulk-action-bar bulk-action-bar--active">
          <span>{selectedIndices.size} selected</span>
          <button className="secondary" onClick={handleBulkCopy} title="Copy selected (Ctrl+C)"><Icon name="copy" size={13} /> Copy</button>
          <button
            className="secondary" onClick={() => setShowBulkEdit(true)} disabled={readOnly}
            title={readOnly ? 'This connection is read-only' : 'Set, rename or unset a field on every selected document'}
          ><Icon name="edit" size={13} /> Edit field</button>
          <button
            className="danger" onClick={handleBulkDelete} disabled={readOnly}
            title={readOnly ? 'This connection is read-only' : 'Delete selected (Del)'}
          ><Icon name="trash" size={13} /> Delete</button>
          <button className="secondary" onClick={() => setSelectedIndices(new Set())}><Icon name="close" size={13} /> Deselect all</button>
        </div>
      )}

      {error && <div className="docs-error">{error}</div>}

      <div className="docs-split">

        <div
          className="docs-main"
          onContextMenu={e => { e.preventDefault(); setEmptyCtxMenu({ x: e.clientX, y: e.clientY }); }}
        >
          {documents.length === 0 && !loading && !error && (
            <div className="docs-empty">No documents</div>
          )}

          {viewMode === 'table' && keys.length > 0 && (
            <div className={`document-table${tableWin.windowed ? ' windowed' : ''}`} ref={tableScrollRef}>
              <table>
                <thead>
                  <tr>
                    <th className="doc-check-cell">
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
                    {keys.map(k => {
                      const sk = sortKeys.find(s => s.field === k);
                      const rank = sortKeys.findIndex(s => s.field === k);
                      return (
                        <th
                          key={k}
                          className={`doc-th-sortable${sk ? ' sorted' : ''}`}
                          title={sortTooltip(k, sk?.dir ?? null)}
                          onClick={e => headerSort(k, e.shiftKey)}
                          // Shift-click on a header extends the text selection otherwise.
                          onMouseDown={e => { if (e.shiftKey) e.preventDefault(); }}
                        >
                          {k}
                          {sk && (
                            // Arrow *and* the word: an arrow alone leaves people
                            // guessing which end a date or a string sorts from.
                            <span className="doc-th-sort">
                              <Icon name={sk.dir === 1 ? 'arrowUp' : 'arrowDown'} size={11} />
                              {sk.dir === 1 ? 'ASC' : 'DESC'}
                              {sortKeys.length > 1 && <span className="doc-th-rank">{rank + 1}</span>}
                            </span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody ref={tableBodyRef}>
                  <VirtualSpacer height={tableWin.padTop} colSpan={keys.length + 1} />
                  {documents.slice(tableWin.start, tableWin.end).map((doc, i) => {
                    const idx = tableWin.start + i;
                    return (
                      <tr key={idx}
                        ref={tableWin.rowRef(idx)}
                        className={selectedIndices.has(idx) ? 'doc-row-selected' : ''}
                        onClick={e => handleDocClick(idx, e)}
                        onMouseDown={e => { if (e.shiftKey) e.preventDefault(); }}
                        onDoubleClick={() => openEdit(doc)}
                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); handleDocClick(idx, e); setCtxMenu({ x: e.clientX, y: e.clientY, idx }); }}
                      >
                        <td className="doc-check-cell" onClick={e => e.stopPropagation()}>
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
                    );
                  })}
                  <VirtualSpacer height={tableWin.padBottom} colSpan={keys.length + 1} />
                </tbody>
              </table>
            </div>
          )}

          {viewMode === 'tree' && (
            <div className="tree-view-container" ref={treeScrollRef}>
              <div ref={treeListRef}>
                <VirtualSpacer height={treeWin.padTop} />
                {documents.slice(treeWin.start, treeWin.end).map((doc, i) => {
                  const idx = treeWin.start + i;
                  return (
                    // The wrapper is what gets measured, and `flow-root` (in
                    // index.css) keeps the item's bottom margin inside it —
                    // otherwise every row would measure 5px short and the
                    // scroll height would drift by that much per document.
                    <div key={idx} className="doc-tree-row" ref={treeWin.rowRef(idx)}>
                      <DocumentTree
                        doc={doc}
                        selected={selectedIndices.has(idx)}
                        onSelect={e => handleDocClick(idx, e)}
                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); handleDocClick(idx, e); setCtxMenu({ x: e.clientX, y: e.clientY, idx }); }}
                        expandTick={expandTick}
                        expandTarget={expandTarget}
                        docExpTick={docExpands[idx]?.tick ?? 0}
                        docExpTarget={docExpands[idx]?.target ?? true}
                      />
                    </div>
                  );
                })}
                <VirtualSpacer height={treeWin.padBottom} />
              </div>
            </div>
          )}
        </div>

        {/* Query Builder — right panel */}
        {showQB && (() => {
          const fieldList = allFields();
          const activeFilter = buildFilter(conditions, matchAll);
          const hasFilter = conditions.length > 0;
          return (
            <div className="qb-panel">
              <div className="qb-panel-header">
                <span className="qb-panel-title">Query</span>
                <select
                  className="qb-match-select"
                  value={matchAll ? 'and' : 'or'}
                  onChange={e => setMatchAll(e.target.value === 'and')}
                >
                  <option value="and">Match all ($and)</option>
                  <option value="or">Match any ($or)</option>
                </select>
              </div>

              <div className="qb-conditions-list">
                {conditions.map(c => {
                  const ops = OPERATORS_BY_TYPE[c.type] || OPERATORS_BY_TYPE.string;
                  const opDef = ops.find(o => o.value === c.op);
                  const noValue = opDef?.noValue ?? false;
                  return (
                    <div key={c.id} className="qb-cond-card">
                      <div className="qb-cond-row1">
                        <select
                          className="qb-field-select"
                          value={c.field}
                          onChange={e => {
                            const f = fieldList.find(x => x.field === e.target.value);
                            updateCondition(c.id, { field: e.target.value, type: f?.type ?? 'string' });
                          }}
                        >
                          <option value={c.field}>{c.field}</option>
                          {fieldList.filter(x => x.field !== c.field).map(x => (
                            <option key={x.field} value={x.field}>{x.field}</option>
                          ))}
                        </select>
                        <select
                          className="qb-op-select"
                          value={c.op}
                          onChange={e => updateCondition(c.id, { op: e.target.value as Operator })}
                        >
                          {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <button className="qb-del-btn" onClick={() => removeCondition(c.id)}><Icon name="trash" size={13} /></button>
                      </div>
                      {!noValue && (
                        <div className="qb-cond-row2">
                          <span className="qb-type-badge" style={{ background: TYPE_COLORS[c.type] }}>
                            {TYPE_LABELS[c.type]}
                          </span>
                          <input
                            className="qb-val-input"
                            value={c.value}
                            placeholder={c.type === 'number' ? '0' : c.type === 'date' ? 'YYYY-MM-DD' : 'value'}
                            onChange={e => updateCondition(c.id, { value: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && applyFilter()}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                <div
                  className={`qb-drop-zone${dragOver ? ' drag-over' : ''}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDropField}
                  onDoubleClick={() => {
                    if (fieldList.length > 0) addCondition(fieldList[0].field, fieldList[0].type);
                  }}
                >
                  + Drag field here or double-click
                </div>
              </div>

              {fieldList.length > 0 && (
                <div className="qb-fields-section">
                  <div className="qb-fields-title">Fields</div>
                  <div className="qb-fields-list">
                    {fieldList.map(({ field, type }) => (
                      <div
                        key={field}
                        className="qb-field-chip"
                        draggable
                        onDragStart={e => {
                          const val = documents[0]?.[field];
                          const strVal = val == null ? '' : (typeof val === 'object' && '$oid' in val) ? val.$oid : String(val);
                          e.dataTransfer.setData('qb-field', JSON.stringify({ field, type, value: strVal }));
                        }}
                        onClick={() => addCondition(field, type)}
                        title={`${TYPE_LABELS[type]} — click or drag to add`}
                      >
                        <span className="qb-chip-dot" style={{ background: TYPE_COLORS[type] }} />
                        {field}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="qb-panel-footer">
                {hasFilter && (
                  <details className="qb-preview-details">
                    <summary className="qb-preview-summary">
                      <span>Query preview</span>
                      <span
                        className="qb-expand-btn"
                        onClick={e => { e.preventDefault(); setShowQueryModal(true); }}
                      ><Icon name="expand" size={11} /> expand</span>
                    </summary>
                    <pre className="qb-preview">{JSON.stringify(activeFilter, null, 2)}</pre>
                  </details>
                )}
                <div className="qb-footer-btns">
                  <button className="secondary btn-xs" onClick={resetFilter}>↺ Reset</button>
                  <button className="btn-xs grow" onClick={applyFilter} disabled={loading}>
                    {loading ? '…' : '▶ Run'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="status-bar">
        <span title={totalEstimated ? 'Approximate count from collection metadata — exact counts require a full scan' : undefined}>
          {totalEstimated ? '≈' : ''}{total} total{hasSelection ? ` · ${selectedIndices.size} selected` : ''}
        </span>
        <span className="status-filter">
          {conditions.length > 0 ? JSON.stringify(buildFilter(conditions, matchAll)) : ''}
        </span>
        <div className="status-pager">
          <button className="page-btn" onClick={() => goToPage(0)} disabled={page === 0 || loading}>«</button>
          <button className="page-btn" onClick={() => goToPage(page - 1)} disabled={page === 0 || loading}>‹</button>
          <span className="status-range">
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

      {showBulkEdit && (
        <BulkEditModal
          count={selectedIndices.size}
          fields={fieldOptions}
          onApply={applyBulkEdit}
          onClose={() => setShowBulkEdit(false)}
        />
      )}

      {/* Same filter, sort and projection `get-documents` runs — explaining a
          different query than the list shows would answer the wrong question. */}
      {showExplain && (
        <ExplainModal
          what="filter"
          namespace={`${database}.${collection}`}
          load={() => inv(
            'explain-find', connectionId, database, collection,
            buildFilter(conditions, matchAll), buildSort(sortKeys), buildProjection(hiddenFields),
          )}
          onClose={() => setShowExplain(false)}
        />
      )}

      {/* Export menu, anchored under the toolbar button */}
      {exportMenu && (
        <ContextMenu
          x={exportMenu.x} y={exportMenu.y}
          items={exportItems()}
          onClose={() => setExportMenu(null)}
        />
      )}

      {/* Empty area context menu */}
      {emptyCtxMenu && (
        <ContextMenu
          x={emptyCtxMenu.x} y={emptyCtxMenu.y}
          items={[{ label: 'Add document', icon: 'plus', shortcut: 'Ctrl+D', disabled: readOnly, onClick: openAddDoc }]}
          onClose={() => setEmptyCtxMenu(null)}
        />
      )}

      {/* Query preview modal */}
      {showQueryModal && (
        <div className="modal-overlay" onClick={() => setShowQueryModal(false)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Query</h3>
              <button className="icon-btn" onClick={() => setShowQueryModal(false)}><Icon name="close" size={14} /></button>
            </div>
            <div className="modal-body">
              <pre className="code-block">
                {JSON.stringify(buildFilter(conditions, matchAll), null, 2)}
              </pre>
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => { navigator.clipboard.writeText(JSON.stringify(buildFilter(conditions, matchAll), null, 2)); }}><Icon name="copy" size={13} /> Copy</button>
              <button onClick={() => setShowQueryModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Add document modal */}
      {showAddDoc && (() => {
        const addValid = validateJson(addJson);
        return (
          <div className="modal-overlay" onClick={() => setShowAddDoc(false)}>
            <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Add document</h3>
                <div className="modal-header-actions">
                  <button className="secondary btn-xs"
                    onClick={() => setAddJson(formatJson(addJson))}>Format</button>
                  <label className="editor-toggle" title="Show line numbers">
                    <input type="checkbox" checked={lineNumbers}
                      onChange={e => setLineNumbers(e.target.checked)} />
                    Line numbers
                  </label>
                  {addValid
                    ? <span className="json-status invalid"><Icon name="close" size={11} /> {addValid}</span>
                    : <span className="json-status valid"><Icon name="check" size={11} /> Valid</span>}
                  <button className="icon-btn" onClick={() => setShowAddDoc(false)}><Icon name="close" size={14} /></button>
                </div>
              </div>
              <div className="modal-body">
                {addError && <div className="modal-error">{addError}</div>}
                <MonacoJsonEditor
                  className={`tall${addValid ? ' invalid' : ''}`}
                  value={addJson}
                  ref={addEditorRef}
                  lineNumbers={lineNumbers}
                  theme={monacoTheme}
                  onChange={v => { setAddJson(v); setAddError(null); }}
                  onSave={handleAddSave}
                />
                <div className="modal-hint">
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
          <div className="modal-overlay">
            <div className={`modal modal-wide${editMaximized ? ' modal-maximized' : ''}`}>
              <div className="modal-header">
                <h3>
                  Edit — {idToString(editingDoc._id)}
                  {isDirty && <span className="edit-dirty-badge">● modified</span>}
                </h3>
                <div className="modal-header-actions">
                  <button className="secondary btn-xs"
                    onClick={() => setEditJson(formatJson(editJson))}>Format</button>
                  <label className="editor-toggle" title="Show line numbers">
                    <input type="checkbox" checked={lineNumbers}
                      onChange={e => setLineNumbers(e.target.checked)} />
                    Line numbers
                  </label>
                  <label className="editor-toggle" title="Wrap long lines">
                    <input type="checkbox" checked={editWrap}
                      onChange={e => setEditWrap(e.target.checked)} />
                    Wrap
                  </label>
                  {jsonValid
                    ? <span className="json-status invalid"><Icon name="close" size={11} /> {jsonValid}</span>
                    : <span className="json-status valid"><Icon name="check" size={11} /> Valid</span>}
                  <button className="icon-btn" title={editMaximized ? 'Restore size' : 'Maximize'}
                    onClick={() => setEditMaximized(m => !m)}><Icon name="expand" size={13} /></button>
                  <button className="icon-btn" title="Close" onClick={() => closeEdit()}><Icon name="close" size={14} /></button>
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
                  <button className="find-close" onClick={() => { setShowEditFind(false); setEditFind(''); }}><Icon name="close" size={14} /></button>
                </div>
              )}
              <div className="modal-body">
                {editError && <div className="modal-error">{editError}</div>}
                <MonacoJsonEditor
                  className={`${diff && diff.length > 0 ? 'short' : 'tall'}${jsonValid ? ' invalid' : ''}`}
                  value={editJson}
                  ref={editEditorRef}
                  lineNumbers={lineNumbers}
                  wrap={editWrap}
                  theme={monacoTheme}
                  onChange={v => { setEditJson(v); setEditError(null); }}
                  onSave={handleSave}
                  onFindShortcut={() => { setShowEditFind(v => !v); setTimeout(() => editFindRef.current?.focus(), 50); }}
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
                <div className="modal-hint">
                  Ctrl+Enter save · Ctrl+F find · Esc clears search
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
              <h3>View — {idToString(viewingDoc._id)}</h3>
              <div className="modal-header-actions">
                <button className="secondary btn-sm"
                  onClick={() => { openEdit(viewingDoc); setViewingDoc(null); }}>Edit (Ctrl+J)</button>
                <button className="icon-btn" onClick={() => setViewingDoc(null)}><Icon name="close" size={14} /></button>
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
                <button className="find-close" onClick={() => { setShowViewFind(false); setViewFind(''); }}><Icon name="close" size={14} /></button>
              </div>
            )}
            <div className="modal-body" onKeyDown={e => {
              if (e.ctrlKey && e.key === 'f') { e.preventDefault(); setShowViewFind(v => !v); setTimeout(() => viewFindRef.current?.focus(), 50); }
            }} tabIndex={-1}>
              <pre
                className="code-block break-all"
                dangerouslySetInnerHTML={{ __html: highlightText(viewText, viewFind) }}
              />
              <div className="modal-hint">
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
