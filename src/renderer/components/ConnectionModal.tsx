import { useState, useEffect, useRef } from 'react';

interface Connection {
  id: string; name: string; uri: string; database?: string;
  folderId?: string; color?: string; order?: number;
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
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (connection) {
      setName(connection.name);
      setUri(connection.uri);
      setDatabase(connection.database || '');
    }
  }, [connection]);

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
      color: connection?.color,
      order: connection?.order,
    });
  };

  const showLog = logs.length > 0 || testing;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 540 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{connection ? 'Edit Connection' : 'New Connection'}</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
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
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={handleTest} disabled={testing}>
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
            {testResult && !testing && (
              <span style={{ fontSize: 13, color: testResult.success ? 'var(--success)' : 'var(--error)' }}>
                {testResult.success ? '✓ Connected' : `✕ ${testResult.error}`}
              </span>
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
                maxHeight: 160,
                overflowY: 'auto',
                lineHeight: 1.6,
              }}
            >
              {logs.map((l, i) => (
                <div
                  key={i}
                  style={{
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
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button onClick={handleSubmit} disabled={!name || !uri}>Save</button>
        </div>
      </div>
    </div>
  );
}
