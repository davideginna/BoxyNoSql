import { useState, useEffect, useMemo, useRef } from 'react';
import { showConfirm } from '../dialog';
import {
  parseMongoUri, buildMongoUri, findPartsProblem, EMPTY_PARTS, OPTION_SPEC,
  MongoUriParts, MongoHost, OptionGroup, OptionKey,
} from '../utils/mongoUri';
import ColorEditor from './ColorEditor';
import Icon from './Icon';
import { onEscape } from '../utils/keys';

interface Connection {
  id: string; name: string; uri: string; readOnly?: boolean; database?: string;
  folderId?: string; color?: string; order?: number;
  iconDbColor?: string; iconColColor?: string;
  tls?: boolean;
  tlsCertificateKeyFile?: string;
  tlsCertificateKeyFilePassword?: string;
  tlsCAFile?: string;
  tlsAllowInvalidCertificates?: boolean;
  tlsServername?: string;
}

// Sub-tabs of the breakdown panel, in display order. Grouped by what you are
// actually doing: reaching the server, proving who you are, tuning the driver.
const PART_TABS: readonly (readonly [OptionGroup, string])[] = [
  ['server', 'Server'],
  ['auth', 'Auth'],
  ['options', 'Options'],
];
const PART_TAB_LABEL: Record<OptionGroup, string> = { server: 'Server', auth: 'Auth', options: 'Options' };

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
  const [readOnly, setReadOnly] = useState(false);
  const [tls, setTls] = useState(false);
  const [certFile, setCertFile] = useState('');
  const [certPassword, setCertPassword] = useState('');
  const [caFile, setCaFile] = useState('');
  const [allowInvalidCerts, setAllowInvalidCerts] = useState(false);
  const [servername, setServername] = useState('');
  const [tab, setTab] = useState<'general' | 'tls' | 'appearance'>('general');
  // 'string' → the URI is what the user types and the breakdown is a read-only
  // lens on it. 'fields' → the breakdown is the source of truth and the URI is
  // regenerated from it, so whatever was pasted no longer counts.
  const [uriMode, setUriMode] = useState<'string' | 'fields'>('string');
  const [fields, setFields] = useState<MongoUriParts>(EMPTY_PARTS);
  const [partTab, setPartTab] = useState<OptionGroup>('server');
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [wrapLog, setWrapLog] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const initial = useRef({ name: '', uri: 'mongodb://localhost:27017', database: '', color: '', iconDbColor: '', iconColColor: '' });

  useEffect(() => {
    // A different connection means a different URI: back to the string as the
    // source of truth, whatever the previous one was being edited as.
    setUriMode('string');
    setShowPassword(false);
    setPartTab('server');
    if (connection) {
      setName(connection.name);
      setUri(connection.uri);
      setDatabase(connection.database || '');
      setReadOnly(!!connection.readOnly);
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

  // In 'string' mode the breakdown follows the URI; in 'fields' mode the URI
  // follows the breakdown, so everything downstream (test, save) keeps reading
  // a single `uri` and needs no changes.
  const parsed = useMemo(() => parseMongoUri(uri), [uri]);
  const view = uriMode === 'fields' ? fields : (parsed ?? EMPTY_PARTS);
  const problem = uriMode === 'fields' ? findPartsProblem(fields) : null;
  const fieldsError = problem?.message ?? null;
  const editingFields = uriMode === 'fields';

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  // Unlocking on its own must not touch the URI: rebuilding it here would
  // reorder the query params of an untouched connection and make the form look
  // dirty before the user typed anything.
  const unlockFields = () => {
    setFields(parsed ?? EMPTY_PARTS);
    setUriMode('fields');
  };

  // Every field edit regenerates the URI, so `uri` stays the single value the
  // rest of the form (test, save) reads.
  const applyFields = (updater: (f: MongoUriParts) => MongoUriParts) => {
    const next = updater(fields);
    setFields(next);
    setUri(buildMongoUri(next));
  };

  const setField = <K extends keyof MongoUriParts>(key: K, value: MongoUriParts[K]) =>
    applyFields(f => ({ ...f, [key]: value }));
  const setHost = (index: number, patch: Partial<MongoHost>) =>
    applyFields(f => ({ ...f, hosts: f.hosts.map((h, i) => (i === index ? { ...h, ...patch } : h)) }));
  const addHost = () => applyFields(f => ({ ...f, hosts: [...f.hosts, { host: '', port: '' }] }));
  const removeHost = (index: number) =>
    applyFields(f => (f.hosts.length > 1 ? { ...f, hosts: f.hosts.filter((_, i) => i !== index) } : f));

  // One control per known query option, driven by the table in `mongoUri.ts`:
  // a select for enumerations, a three-state select for booleans (the empty
  // entry writes nothing at all, so the driver default keeps applying), a
  // number box for pool sizes and timeouts.
  const renderOption = (key: OptionKey) => {
    const spec = OPTION_SPEC[key];
    const value = view[key];
    const locked = !editingFields;

    if (spec.kind === 'bool' || spec.kind === 'enum') {
      const known = spec.kind === 'bool' ? ['true', 'false'] : (spec.values ?? []);
      // A value the list does not know (a mechanism a newer driver added) is
      // shown as its own entry instead of silently reading as "not set".
      const values = value && !known.includes(value) ? [value, ...known] : known;
      return (
        <div className="form-group" key={key}>
          <label>{spec.label}</label>
          <select
            aria-label={spec.label} value={value} disabled={locked}
            onChange={e => setField(key, e.target.value)}
          >
            <option value="">— not set —</option>
            {values.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      );
    }

    return (
      <div className="form-group" key={key}>
        <label>{spec.label}</label>
        <input
          type={spec.kind === 'number' ? 'number' : 'text'}
          min={spec.kind === 'number' ? 0 : undefined}
          step={spec.kind === 'number' ? 1 : undefined}
          aria-label={spec.label} value={value} readOnly={locked}
          className={locked ? 'ro' : undefined}
          placeholder={spec.placeholder ?? '—'}
          onChange={e => setField(key, e.target.value)}
        />
      </div>
    );
  };

  const copyUri = async () => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard denied — the field is selectable anyway */ }
  };

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

  useEffect(() => onEscape(() => attemptClose()));

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
      readOnly: readOnly || undefined,
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
    <div className="modal-overlay" style={{ zIndex: 1800 }}>
      <div className="modal conn-modal" style={{ width: 720 }}>
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
                <label className="conn-readonly">
                  <input type="checkbox" checked={readOnly} onChange={e => setReadOnly(e.target.checked)} />
                  <span>Read-only</span>
                  <span className="conn-readonly-hint">
                    Blocks every write on this connection — inserts, updates, drops, index changes and
                    write methods in the query terminal. Enforced in the main process, not just hidden.
                  </span>
                </label>
              </div>
              <div className="form-group">
                <label>Connection String</label>
                <div className="conn-uri-row">
                  <input
                    type="text" value={uri}
                    readOnly={editingFields}
                    className={editingFields ? 'ro' : undefined}
                    onChange={e => setUri(e.target.value)}
                    onPaste={handleUriPaste}
                    placeholder="mongodb://localhost:27017"
                  />
                  <button
                    className="secondary" onClick={copyUri} disabled={!uri}
                    title="Copy the whole connection string"
                  >
                    <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="conn-parts">
                <div className="conn-parts-head">
                  <span className="conn-parts-title">
                    {editingFields ? 'Fields (source of truth)' : 'Parsed from the connection string'}
                  </span>
                  {editingFields ? (
                    <button className="secondary" onClick={() => setUriMode('string')}
                      title="Go back to editing the string — the fields stay as they are">
                      <Icon name="close" size={13} /> Done
                    </button>
                  ) : (
                    <button className="secondary" onClick={unlockFields}
                      title="Unlock the fields — from then on they build the connection string">
                      <Icon name="edit" size={13} /> Edit fields
                    </button>
                  )}
                </div>

                {!editingFields && !parsed && uri.trim() && (
                  <div className="conn-parts-hint">Not a <code>mongodb://</code> URI — nothing to break down.</div>
                )}
                {editingFields && (
                  <div className="conn-parts-hint">
                    These fields now build the connection string above; whatever was pasted there no longer counts.
                  </div>
                )}

                {/* Subordinate to the General/TLS/Appearance strip above: pills,
                    not underlined tabs, and a size down. */}
                <div className="conn-subtabs">
                  {PART_TABS.map(([id, label]) => (
                    <button
                      key={id}
                      className={`conn-subtab ${partTab === id ? 'active' : ''}${problem?.group === id ? ' has-error' : ''}`}
                      onClick={() => setPartTab(id)}
                    >
                      {label}
                      {problem?.group === id && <Icon name="warn" size={11} />}
                    </button>
                  ))}
                </div>

                {partTab === 'server' && (
                  <>
                    <div className="conn-parts-grid">
                      <div className="form-group">
                        <label>Scheme</label>
                        <select aria-label="Scheme" value={view.scheme} disabled={!editingFields}
                          onChange={e => setField('scheme', e.target.value as MongoUriParts['scheme'])}>
                          <option value="mongodb">mongodb</option>
                          <option value="mongodb+srv">mongodb+srv</option>
                        </select>
                      </div>
                      {renderOption('replicaSet')}
                      {renderOption('directConnection')}
                    </div>

                    <div className="form-group">
                      <label>{view.hosts.length > 1 ? 'Hosts' : 'Host'}</label>
                      {view.hosts.map((h, i) => (
                        <div className="conn-host-row" key={i}>
                          <input type="text" value={h.host} readOnly={!editingFields}
                            aria-label={`Host ${i + 1}`}
                            className={!editingFields ? 'ro' : undefined} placeholder="localhost"
                            onChange={e => setHost(i, { host: e.target.value })} />
                          <input type="text" value={view.scheme === 'mongodb+srv' ? '' : h.port}
                            readOnly={!editingFields || view.scheme === 'mongodb+srv'}
                            aria-label={`Port ${i + 1}`}
                            className={!editingFields || view.scheme === 'mongodb+srv' ? 'ro conn-port' : 'conn-port'}
                            placeholder={view.scheme === 'mongodb+srv' ? 'from DNS' : '27017'}
                            onChange={e => setHost(i, { port: e.target.value })} />
                          {editingFields && (
                            <>
                              <button className="icon-btn" onClick={addHost} title="Add a host">
                                <Icon name="plus" size={14} />
                              </button>
                              <button className="icon-btn" onClick={() => removeHost(i)}
                                disabled={view.hosts.length === 1} title="Remove this host">
                                <Icon name="trash" size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="conn-parts-grid two">
                      {renderOption('appName')}
                      {renderOption('compressors')}
                    </div>
                  </>
                )}

                {partTab === 'auth' && (
                  <>
                    <div className="conn-parts-grid">
                      <div className="form-group">
                        <label>Username</label>
                        <input type="text" value={view.username} readOnly={!editingFields}
                          aria-label="Username"
                          className={!editingFields ? 'ro' : undefined} placeholder="—"
                          onChange={e => setField('username', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Password</label>
                        <div className="conn-pwd-row">
                          <input type={showPassword ? 'text' : 'password'} value={view.password}
                            readOnly={!editingFields} className={!editingFields ? 'ro' : undefined} placeholder="—"
                            aria-label="Password"
                            onChange={e => setField('password', e.target.value)} />
                          <button className="icon-btn" onClick={() => setShowPassword(v => !v)}
                            title={showPassword ? 'Hide password' : 'Show password'}>
                            <Icon name="eye" size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Auth database (URI path)</label>
                        <input type="text" value={view.database} readOnly={!editingFields}
                          aria-label="Auth database"
                          className={!editingFields ? 'ro' : undefined} placeholder="—"
                          onChange={e => setField('database', e.target.value)} />
                      </div>
                    </div>

                    <div className="conn-parts-grid two">
                      {renderOption('authSource')}
                      {renderOption('authMechanism')}
                    </div>
                  </>
                )}

                {partTab === 'options' && (
                  <>
                    <div className="conn-parts-grid">
                      {renderOption('readPreference')}
                      {renderOption('readConcernLevel')}
                      {renderOption('w')}
                      {renderOption('journal')}
                      {renderOption('retryWrites')}
                      {renderOption('retryReads')}
                      {renderOption('connectTimeoutMS')}
                      {renderOption('socketTimeoutMS')}
                      {renderOption('serverSelectionTimeoutMS')}
                      {renderOption('maxPoolSize')}
                      {renderOption('minPoolSize')}
                    </div>

                    {/* Whatever has no field of its own, verbatim. Last, and
                        hidden while locked and empty so the panel stays quiet. */}
                    {(editingFields || view.options) && (
                      <div className="form-group">
                        <label>Other options</label>
                        <input type="text" value={view.options} readOnly={!editingFields}
                          aria-label="Other options"
                          className={!editingFields ? 'ro' : undefined}
                          placeholder="heartbeatFrequencyMS=10000&maxStalenessSeconds=90"
                          onChange={e => setField('options', e.target.value)} />
                      </div>
                    )}
                  </>
                )}

                {/* Outside the panels on purpose: the field at fault may live on
                    a tab that is not open, and a disabled Save with no visible
                    reason is worse than a long message. */}
                {problem && (
                  <div className="conn-parts-error" role="alert">
                    {problem.message}
                    {partTab !== problem.group && <> — see the <b>{PART_TAB_LABEL[problem.group]}</b> tab.</>}
                  </div>
                )}
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
            <button onClick={handleTest} disabled={testing || !!fieldsError}>
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
          <button onClick={handleSubmit} disabled={!name || !uri || !!fieldsError}>Save</button>
        </div>
      </div>
    </div>
  );
}
