import { useState, useEffect, useRef } from 'react';
import { showConfirm } from '../dialog';
import ColorEditor from './ColorEditor';
import Icon from './Icon';

interface Connection {
  id: string; name: string; uri: string; database?: string;
  folderId?: string; color?: string; order?: number;
  iconDbColor?: string; iconColColor?: string;
  tls?: boolean;
  tlsCertificateKeyFile?: string;
  tlsCertificateKeyFilePassword?: string;
  tlsCAFile?: string;
  tlsAllowInvalidCertificates?: boolean;
  tlsServername?: string;
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
  const [tls, setTls] = useState(false);
  const [certFile, setCertFile] = useState('');
  const [certPassword, setCertPassword] = useState('');
  const [caFile, setCaFile] = useState('');
  const [allowInvalidCerts, setAllowInvalidCerts] = useState(false);
  const [servername, setServername] = useState('');
  const [tab, setTab] = useState<'general' | 'tls' | 'appearance'>('general');
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
      setTls(!!connection.tls);
      setCertFile(connection.tlsCertificateKeyFile || '');
      setCertPassword(connection.tlsCertificateKeyFilePassword || '');
      setCaFile(connection.tlsCAFile || '');
      setAllowInvalidCerts(!!connection.tlsAllowInvalidCertificates);
      setServername(connection.tlsServername || '');
      setTab('general');
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

  const tlsSettings = () => ({
    tls: tls || undefined,
    tlsCertificateKeyFile: certFile.trim() || undefined,
    tlsCertificateKeyFilePassword: certPassword || undefined,
    tlsCAFile: caFile.trim() || undefined,
    tlsAllowInvalidCertificates: allowInvalidCerts || undefined,
    tlsServername: servername.trim() || undefined,
  });

  const pickCert = async (setter: (v: string) => void) => {
    const file = await (window as any).electron.invoke('pick-certificate-file');
    if (file) setter(file);
  };

  const handleTest = async () => {
    setLogs([]);
    setTestResult(null);
    setTesting(true);
    const result = await (window as any).electron.invoke('test-connection', uri, tlsSettings());
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
      ...tlsSettings(),
    });
  };

  const showLog = logs.length > 0 || testing;
  const tlsOn = tls || !!certFile.trim() || !!caFile.trim();

  return (
    <div className="modal-overlay" style={{ zIndex: 1800 }} onClick={attemptClose}>
      <div className="modal" style={{ width: 720 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{connection ? 'Edit Connection' : 'New Connection'}</h3>
          <button className="icon-btn" onClick={attemptClose}><Icon name="close" size={15} /></button>
        </div>
        <div className="conn-tabs">
          {([
            ['general', 'General'],
            ['tls', 'TLS'],
            ['appearance', 'Appearance'],
          ] as const).map(([id, label]) => (
            <button key={id} className={`ur-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {label}
              {id === 'tls' && tlsOn && <span className="tls-badge">on</span>}
            </button>
          ))}
        </div>

        <div className="modal-body conn-modal-body">
          {tab === 'general' && (
            <>
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
            </>
          )}

          {tab === 'tls' && (
            <div className="tls-body">
              <label className="tls-check">
                <input type="checkbox" checked={tls} onChange={e => setTls(e.target.checked)} />
                Use TLS
              </label>

              <div className="form-group">
                <label>Client certificate (PEM with certificate + key)</label>
                <div className="tls-file-row">
                  <input type="text" value={certFile} onChange={e => setCertFile(e.target.value)}
                    placeholder="/path/to/client.pem" />
                  <button className="secondary" onClick={() => pickCert(setCertFile)}>Browse…</button>
                </div>
              </div>

              <div className="form-group">
                <label>Certificate password (optional)</label>
                <input type="password" value={certPassword} onChange={e => setCertPassword(e.target.value)}
                  placeholder="leave empty if the key is not encrypted" />
              </div>

              <div className="form-group">
                <label>CA file (fixes "self signed certificate in certificate chain")</label>
                <div className="tls-file-row">
                  <input type="text" value={caFile} onChange={e => setCaFile(e.target.value)}
                    placeholder="/path/to/ca.pem" />
                  <button className="secondary" onClick={() => pickCert(setCaFile)}>Browse…</button>
                </div>
              </div>

              <div className="form-group">
                <label>SNI server name (optional)</label>
                <input type="text" value={servername} onChange={e => setServername(e.target.value)}
                  placeholder="host presented during the TLS handshake" />
              </div>

              <label className="tls-check">
                <input type="checkbox" checked={allowInvalidCerts}
                  onChange={e => setAllowInvalidCerts(e.target.checked)} />
                Accept invalid / self-signed certificates
              </label>
              <div className="tls-warning">
                Skips certificate validation — the traffic is still encrypted, but the server is
                no longer authenticated. Prefer pointing at the CA file.
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <>
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
            </>
          )}

          {/* Test lives outside the tabs: it exercises URI + TLS together, and
              its log is what you read while fixing either of them. */}
          <div className="conn-test-row">
            <button onClick={handleTest} disabled={testing}>
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
            {testResult && !testing && (
              <span className={`conn-test-result ${testResult.success ? 'ok' : 'ko'}`}>
                {testResult.success ? <><Icon name="check" size={13} /> Connected</> : <><Icon name="close" size={13} /> {testResult.error}</>}
              </span>
            )}
            {showLog && (
              <label className="conn-wrap-toggle">
                <input type="checkbox" checked={wrapLog} onChange={e => setWrapLog(e.target.checked)} />
                Wrap log
              </label>
            )}
          </div>
          {showLog && (
            <div ref={logRef} className={`conn-log${wrapLog ? ' wrap' : ''}`}>
              {logs.map((l, i) => (
                <div
                  key={i}
                  className={l.startsWith('✓') ? 'log-ok' : l.startsWith('✕') ? 'log-ko' : ''}
                >
                  {l}
                </div>
              ))}
              {testing && <div className="log-pending">…</div>}
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
