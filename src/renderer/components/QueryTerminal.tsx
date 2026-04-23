import { useState, useEffect, useRef, useCallback } from 'react';
import MonacoQueryEditor from './MonacoQueryEditor';

interface QueryTerminalProps {
  connectionId: string;
  database: string;
  collection: string;
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

export default function QueryTerminal({ connectionId, database, collection, result, setResult }: QueryTerminalProps) {
  const [query, setQuery] = useState(`db.collection("${collection}").find({}).limit(20)`);
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

  // Theme detection from body class
  const theme: 'vs-dark' | 'vs' | 'hc-black' =
    document.body.classList.contains('theme-light') ? 'vs'
    : document.body.classList.contains('theme-hc') ? 'hc-black'
    : 'vs-dark';

  // Load sample fields from the current collection for context-aware suggestions
  useEffect(() => {
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

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await (window as any).electron.invoke('run-query', connectionId, database, collection, query);
      setResult(Array.isArray(res) ? res : [res]);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleClear = () => {
    setResult([]);
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
    <div className="tab-pane active" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div className="toolbar">
        <button onClick={handleRun} disabled={loading}>
          {loading ? 'Running...' : '▶ Run Query'}
        </button>
        <button className="secondary" onClick={handleClear}>Clear</button>
        <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>
          <kbd style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 10, fontFamily: 'monospace' }}>Ctrl+Space</kbd> suggestions ·
          <kbd style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 10, fontFamily: 'monospace', marginLeft: 4 }}>Ctrl+Enter</kbd> run
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>
          {result.length > 0 && `${result.length} result${result.length !== 1 ? 's' : ''} · `}{database}.{collection}
        </span>
      </div>
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: `0 0 ${editorHeight}px`, display: 'flex', border: '1px solid #3c3c3c', margin: '8px 8px 0 8px', borderRadius: 4, overflow: 'hidden' }}>
          <MonacoQueryEditor
            value={query}
            onChange={setQuery}
            onRun={handleRun}
            theme={theme}
            collectionSample={sampleFields}
          />
        </div>
        <div
          onMouseDown={startResize}
          title="Drag to resize"
          style={{
            height: 6, cursor: 'row-resize', flexShrink: 0,
            background: 'transparent',
            borderTop: '1px solid transparent',
            borderBottom: '1px solid transparent',
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        />
        <div style={{ flex: 1, overflow: 'auto', borderTop: '1px solid #3c3c3c', minHeight: 0 }}>
          {error && (
            <div style={{ padding: 12, color: '#f48771', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
              Error: {error}
            </div>
          )}
          {!error && result.length === 0 && !loading && (
            <div style={{ padding: 12, color: '#888', fontSize: 12 }}>No results</div>
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
                        <td key={k} style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
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
            <pre style={{ margin: 0, padding: 12, color: '#cccccc', background: '#1e1e1e', fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(result.length === 1 ? result[0] : result, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
