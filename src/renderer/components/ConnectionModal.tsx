import { useState, useEffect, useRef } from 'react';
import { showConfirm } from '../dialog';
import ColorEditor from './ColorEditor';
import Icon from './Icon';

interface Connection {
  id: string; name: string; uri: string; database?: string;
  folderId?: string; color?: string; order?: number;
  iconDbColor?: string; iconColColor?: string;
}

interface ConnectionModalProps {
  connection: Connection | null;
  onSave: (conn: Connection) => void;
  onClose: () => void;
}

function parseConnectionExport(text: string): { uri: string; name?: string } | null {
  const lines = text.split('\n').map(l => l.trim());
  const uriLine = lines.find(l => l.startsWith('mongodb://') || l.startsWith('mongodb+srv://'));
  if (!uriLine) return null;
  const uriIndex = lines.indexOf(uriLine);
  const commentBefore = lines
    .slice(0, uriIndex)
    .filter(l => l.startsWith('//') && !l.includes('exported on') && !l.includes('http'))
    .pop();
  const name = commentBefore?.replace(/^\/\/\s*/, '').trim();
  return { uri: uriLine, name: name || undefined };
}

export default function ConnectionModal({ connection, onSave, onClose }: ConnectionModalProps) {
  const [name, setName] = useState('');
  const [uri, setUri] = useState('mongodb://localhost:27017');
  const [database, setDatabase] = useState('');
  const [color, setColor] = useState<string | undefined>(undefined);
  const [iconDbColor, setIconDbColor] = useState<string | undefined>(undefined);
  const [iconColColor, setIconColColor] = useState<string | undefined>(undefined);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [wrapLog, setWrapLog] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const initial = useRef({ name: '', uri: 'mongodb://localhost:27017', database: '', color: '', iconDbColor: '', iconColColor: '' });

  useEffect(() => {
    if (connection) {
      setName(connection.name);
      setUri(connection.uri);
      setDatabase(connection.database || '');
      setColor(connection.color);
      setIconDbColor(connection.iconDbColor);
      setIconColColor(connection.iconColColor);
      initial.current = {
        name: connection.name, uri: connection.uri, database: connection.database || '',
        color: connection.color || '', iconDbColor: connection.iconDbColor || '', iconColColor: connection.iconColColor || '',
      };
    }
  }, [connection]);

  const isDirty = () =>
    name !== initial.current.name || uri !== initial.current.uri || database !== initial.current.database ||
    (color || '') !== initial.current.color ||
    (iconDbColor || '') !== initial.current.iconDbColor ||
    (iconColColor || '') !== initial.current.iconColColor;

  const attemptClose = async () => {
    if (isDirty()) {
      const discard = await showConfirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Close without saving?',
        confirmText: 'Discard',
        danger: true,
      });
      if (!discard) return;
    }
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); attemptClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  useEffect(() => {
    const off = (window as any).electron.on('test-log', (msg: string) => {
      setLogs(prev => [...prev, msg]);
    });
    return off;
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const handleUriPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const parsed = parseConnectionExport(text);
    if (parsed) {
      e.preventDefault();
      setUri(parsed.uri);
      if (parsed.name && !name) setName(parsed.name);
    }
  };

  const handleTest = async () => {
    setLogs([]);
    setTestResult(null);
    setTesting(true);
    const result = await (window as any).electron.invoke('test-connection', uri);
    setTestResult(result);
    setTesting(false);
  };

  const handleSubmit = () => {
    onSave({
      id: connection?.id || Date.now().toString(),
      name, uri,
      database: database || undefined,
      folderId: connection?.folderId,
      color,
      iconDbColor,
      iconColColor,
      order: connection?.order,
    });
  };

  const showLog = logs.length > 0 || testing;

  return (
    <div className="modal-overlay" style={{ zIndex: 1800 }} onClick={attemptClose}>
      <div className="modal" style={{ width: 720 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{connection ? 'Edit Connection' : 'New Connection'}</h3>
          <button className="icon-btn" onClick={attemptClose}><Icon name="close" size={15} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="My Database" />
          </div>
          <div className="form-group">
            <label>Connection String</label>
            <input
              type="text" value={uri}
              onChange={e => setUri(e.target.value)}
              onPaste={handleUriPaste}
              placeholder="mongodb://localhost:27017"
            />
          </div>
          <div className="form-group">
            <label>Default Database (optional)</label>
            <input type="text" value={database} onChange={e => setDatabase(e.target.value)} placeholder="mydb" />
          </div>
          <div className="form-group">
            <label>Connection color</label>
            <ColorEditor value={color} allowClear clearLabel="Default" onChange={setColor} />
          </div>
          <div className="form-group">
            <label>Database icon color (override global)</label>
            <ColorEditor value={iconDbColor} allowClear clearLabel="Use global" onChange={setIconDbColor} />
          </div>
          <div className="form-group">
            <label>Collection icon color (override global)</label>
            <ColorEditor value={iconColColor} allowClear clearLabel="Use global" onChange={setIconColColor} />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={handleTest} disabled={testing}>
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
            {testResult && !testing && (
              <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4, color: testResult.success ? 'var(--success)' : 'var(--error)' }}>
                {testResult.success ? <><Icon name="check" size={13} /> Connected</> : <><Icon name="close" size={13} /> {testResult.error}</>}
              </span>
            )}
            {showLog && (
              <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={wrapLog} onChange={e => setWrapLog(e.target.checked)} />
                Wrap log
              </label>
            )}
          </div>
          {showLog && (
            <div
              ref={logRef}
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '8px 10px',
                fontFamily: 'Consolas, Monaco, monospace',
                fontSize: 12,
                color: 'var(--text-secondary)',
                maxHeight: 220,
                overflowY: 'auto',
                overflowX: wrapLog ? 'hidden' : 'auto',
                lineHeight: 1.6,
              }}
            >
              {logs.map((l, i) => (
                <div
                  key={i}
                  style={{
                    whiteSpace: wrapLog ? 'pre-wrap' : 'pre',
                    wordBreak: wrapLog ? 'break-word' : 'normal',
                    color: l.startsWith('✓') ? 'var(--success)'
                      : l.startsWith('✕') ? 'var(--error)'
                      : 'var(--text-secondary)'
                  }}
                >
                  {l}
                </div>
              ))}
              {testing && <div style={{ color: 'var(--accent)' }}>…</div>}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="secondary" onClick={attemptClose}>Cancel</button>
          <button onClick={handleSubmit} disabled={!name || !uri}>Save</button>
        </div>
      </div>
    </div>
  );
}
