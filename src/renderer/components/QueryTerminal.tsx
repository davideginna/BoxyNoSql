import { useState, useEffect, useRef, useCallback } from 'react';
import MonacoQueryEditor, { MonacoThemeName } from './MonacoQueryEditor';
import QueryHistoryMenu, { useQueryHistory } from './QueryHistoryMenu';
import ContextMenu, { ContextMenuEntry } from './ContextMenu';
import ExplainModal from './ExplainModal';
import Icon from './Icon';
import { showAlert } from '../dialog';
import { previewLabel } from '../utils/queryHistory';
import { onRunKey } from '../utils/keys';
import { prettyDoc } from '../utils/editableJson';
import { showToast } from '../toast';

interface QueryTerminalProps {
  connectionId: string;
  database: string;
  /** Absent for the database shell (sidebar → Open shell): `db` is all there is. */
  collection?: string;
  /** False for a tab that is mounted but not on screen — see `MainContent`. */
  active?: boolean;
  result: any[];
  setResult: (result: any[]) => void;
}

function renderCell(v: any): string {
  if (v === null || v === undefined) return v === null ? 'null' : '';
  if (typeof v === 'object') {
    if ('$oid' in v && typeof v.$oid === 'string') return `ObjectId("${v.$oid}")`;
    if ('$date' in v && typeof v.$date === 'string') return `ISODate("${v.$date}")`;
    return JSON.stringify(v);
  }
  return String(v);
}

function isPlainObj(v: any): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    && !('$oid' in v) && !('$date' in v);
}

export default function QueryTerminal({ connectionId, database, collection, result, setResult, active = true }: QueryTerminalProps) {
  const [query, setQuery] = useState(collection
    ? `db.getCollection("${collection}").find({}).limit(20)`
    : 'db.getCollectionNames()');
  // Bumped by the Format button; the editor formats on each change.
  const [formatTick, setFormatTick] = useState(0);
  const namespace = collection ? `${database}.${collection}` : database;
  // What the script printed (`print`/`printjson`), shown above the result.
  const [output, setOutput] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sampleFields, setSampleFields] = useState<string[]>([]);
  const [editorHeight, setEditorHeight] = useState<number>(
    () => Number(localStorage.getItem('queryEditorHeight')) || 160
  );
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartY.current = e.clientY;
    dragStartH.current = editorHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const h = Math.min(800, Math.max(80, dragStartH.current + ev.clientY - dragStartY.current));
      setEditorHeight(h);
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [editorHeight]);

  useEffect(() => {
    localStorage.setItem('queryEditorHeight', String(editorHeight));
  }, [editorHeight]);

  // Theme detection from body class — App re-renders this tree on theme change,
  // so the value is recomputed and pushed into Monaco by its own effect.
  const theme: MonacoThemeName =
    document.body.classList.contains('theme-light') ? 'vs'
    : document.body.classList.contains('theme-hc') ? 'hc-black'
    : document.body.classList.contains('theme-solarized') ? 'boxy-solarized'
    : 'vs-dark';

  // Load sample fields from the current collection for context-aware suggestions
  useEffect(() => {
    if (!collection) { setSampleFields([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const docs = await (window as any).electron.invoke('get-documents', connectionId, database, collection, {}, 20, 0);
        if (cancelled) return;
        const fields = new Set<string>();
        (docs.docs || []).forEach((d: any) => Object.keys(d).forEach(k => fields.add(k)));
        setSampleFields(Array.from(fields));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [connectionId, database, collection]);

  const history = useQueryHistory('query', connectionId, database, collection ?? '');

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    // Recorded before the call, not after: a query that errors is exactly the
    // one you want to pull back up and fix.
    history.record(query, previewLabel(query));
    try {
      // `{ result, output }`: the last expression's value, and what was printed.
      const res = await (window as any).electron.invoke('run-query', connectionId, database, collection ?? '', query);
      setOutput(res?.output ?? []);
      const value = res?.result;
      setResult(value === undefined ? [] : Array.isArray(value) ? value : [value]);
    } catch (err: any) {
      setOutput([]);
      // Electron wraps every handler error in "Error invoking remote method …".
      setError(String(err.message).replace(/^Error invoking remote method '[^']+': /, ''));
    }
    setLoading(false);
  };

  const [exportMenu, setExportMenu] = useState<{ x: number; y: number } | null>(null);
  const [showExplain, setShowExplain] = useState(false);

  // The rows are already in the renderer, so they go to main as they are; only
  // the formatting and the file write happen over there.
  const exportRows = async (format: 'json' | 'ndjson' | 'csv') => {
    try {
      const res = await (window as any).electron.invoke('export-rows', {
        rows: result, baseName: `${collection ?? database}-query`, format,
      });
      if (res.canceled) return;
      await showAlert({ title: 'Export complete', message: `${res.count} row${res.count === 1 ? '' : 's'} written.`, detail: res.filePath });
    } catch (err: any) { setError(err.message); }
  };

  const exportItems = (): ContextMenuEntry[] => (['json', 'ndjson', 'csv'] as const).map(f => ({
    label: f.toUpperCase(), icon: 'download' as const, onClick: () => exportRows(f),
  }));

  // Monaco binds Alt+Enter itself; this covers the rest of the pane (results,
  // toolbar, wherever the focus happens to be).
  useEffect(() => {
    if (!active || showExplain) return;
    return onRunKey(e => { e.preventDefault(); handleRun(); });
  }, [active, showExplain, query, connectionId, database, collection]);

  // Copies what the raw view shows: one document alone, several as an array,
  // ObjectIds and dates in the shell form the editors read back.
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prettyDoc(result.length === 1 ? result[0] : result));
      showToast({ message: `Copied ${result.length} result${result.length !== 1 ? 's' : ''} as JSON`, kind: 'success' });
    } catch {
      showToast({ message: "Couldn't write to the clipboard.", kind: 'error' });
    }
  };

  const handleClear = () => {
    setResult([]);
    setOutput([]);
    setError(null);
  };

  const allObjects = result.length > 0 && result.every(isPlainObj);
  const keys: string[] = allObjects
    ? Array.from(result.reduce((set: Set<string>, d: any) => {
        Object.keys(d).forEach(k => set.add(k));
        return set;
      }, new Set<string>()))
    : [];

  return (
    <div className="tab-pane active pane-col">
      {exportMenu && (
        <ContextMenu x={exportMenu.x} y={exportMenu.y} items={exportItems()} onClose={() => setExportMenu(null)} />
      )}
      {showExplain && (
        <ExplainModal
          what="query"
          namespace={namespace}
          load={() => (window as any).electron.invoke('explain-query', connectionId, database, collection ?? '', query)}
          onClose={() => setShowExplain(false)}
        />
      )}
      <div className="toolbar qt-toolbar">
        <button onClick={handleRun} disabled={loading}>
          {loading ? 'Running...' : '▶ Run Query'}
        </button>
        <button
          className="secondary"
          onClick={() => setShowExplain(true)}
          title="Explain this query — index usage, documents examined, timings"
        >
          <Icon name="plan" size={13} /> Explain
        </button>
        <button
          className="secondary"
          onClick={() => setFormatTick(t => t + 1)}
          title="Format the script (Shift+Alt+F)"
        >
          <Icon name="braces" size={13} /> Format
        </button>
        <button className="secondary" onClick={handleClear}>Clear</button>
        <button
          className="secondary"
          disabled={result.length === 0}
          title={result.length === 0 ? 'Run a query first' : 'Copy these results as JSON'}
          onClick={handleCopy}
        >
          <Icon name="copy" size={13} /> Copy
        </button>
        <button
          className="secondary"
          disabled={result.length === 0}
          title={result.length === 0 ? 'Run a query first' : 'Export these results'}
          onClick={e => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setExportMenu({ x: r.left, y: r.bottom + 4 });
          }}
        >
          <Icon name="download" size={13} /> Export
        </button>
        <QueryHistoryMenu
          history={history}
          onPick={e => setQuery(e.body)}
          current={() => ({ body: query, label: previewLabel(query) })}
        />
        <span className="qt-hint">
          <kbd className="kbd">Ctrl+Space</kbd> suggestions ·
          <kbd className="kbd">Alt+Enter</kbd> run
        </span>
        <span className="qt-meta">
          {result.length > 0 && `${result.length} result${result.length !== 1 ? 's' : ''} · `}{namespace}
        </span>
      </div>
      <div className="pane-col">
        <div className="qt-editor-box" style={{ flex: `0 0 ${editorHeight}px` }}>
          <MonacoQueryEditor
            value={query}
            onChange={setQuery}
            onRun={handleRun}
            theme={theme}
            collectionSample={sampleFields}
            formatTick={formatTick}
          />
        </div>
        <div
          onMouseDown={startResize}
          title="Drag to resize"
          className="qt-splitter"
        />
        <div className="qt-results">
          {error && (
            <div className="pane-error">
              Error: {error}
            </div>
          )}
          {!error && output.length > 0 && (
            <pre className="qt-output" aria-label="Output">{output.join('\n')}</pre>
          )}
          {!error && result.length === 0 && output.length === 0 && !loading && (
            <div className="pane-empty">No results</div>
          )}
          {!error && result.length > 0 && allObjects && (
            <div className="document-table">
              <table>
                <thead>
                  <tr>{keys.map(k => <th key={k}>{k}</th>)}</tr>
                </thead>
                <tbody>
                  {result.map((doc, idx) => (
                    <tr key={idx}>
                      {keys.map(k => (
                        <td key={k} className="qt-cell">
                          {renderCell(doc[k])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!error && result.length > 0 && !allObjects && (
            <pre className="qt-raw">
              {JSON.stringify(result.length === 1 ? result[0] : result, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
