import { useState, useEffect, useMemo } from 'react';
import Icon from './Icon';
import { ImportedConnection } from '../utils/uriImport';
import { DEFAULT_CONNECTION_COLOR } from '../utils/iconColors';
import { isEscapeKey } from '../utils/keys';

interface Props {
  items: ImportedConnection[];
  fileName: string;
  existingUris: Set<string>;
  onImport: (selected: ImportedConnection[]) => void | Promise<void>;
  onClose: () => void;
}

function hostsOf(uri: string): string[] {
  let rest = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const at = rest.lastIndexOf('@');
  if (at !== -1) rest = rest.slice(at + 1);
  return (rest.split(/[/?]/)[0] || '').split(',').filter(Boolean);
}

export default function ImportConnectionsModal({ items, fileName, existingUris, onImport, onClose }: Props) {
  const duplicates = useMemo(
    () => new Set(items.map((c, i) => (existingUris.has(c.uri) ? i : -1)).filter(i => i >= 0)),
    [items, existingUris]
  );

  // Pre-select everything that is not already saved.
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(items.map((_, i) => i).filter(i => !duplicates.has(i)))
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (isEscapeKey(e) && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const toggle = (i: number) =>
    setSelected(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const allSelected = selected.size === items.length && items.length > 0;

  const run = async () => {
    setBusy(true);
    try { await onImport(items.filter((_, i) => selected.has(i))); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1700 }}>
      <div className="modal import-uri-modal">
        <div className="modal-header">
          <h3>Import connections</h3>
          <span className="import-uri-file"><Icon name="import" size={13} /> {fileName}</span>
        </div>

        <div className="modal-body import-uri-body">
          {items.length === 0 ? (
            <div className="conn-manager-empty">No connection URIs found in this file.</div>
          ) : (
            <>
              <div className="import-uri-toolbar">
                <label className="import-uri-selectall">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((_, i) => i)))}
                  />
                  Select all
                </label>
                <span className="import-uri-count">{selected.size} of {items.length} selected</span>
              </div>

              <div className="import-uri-list">
                {items.map((c, i) => {
                  const isDup = duplicates.has(i);
                  return (
                    <label key={i} className={`import-uri-row${selected.has(i) ? ' selected' : ''}`}>
                      <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                      <Icon name="plug" size={15} color={c.color || DEFAULT_CONNECTION_COLOR} />
                      <div className="import-uri-info">
                        <div className="import-uri-top">
                          <span className="name">{c.name}</span>
                          {c.folderPath.length > 0 && (
                            <span className="conn-tag import-uri-folder">
                              <Icon name="folder" size={10} /> {c.folderPath.join(' / ')}
                            </span>
                          )}
                          {c.database && <span className="conn-tag">{c.database}</span>}
                          {isDup && <span className="import-uri-dup">already saved</span>}
                        </div>
                        <div className="conn-meta">
                          {hostsOf(c.uri).map((h, k) => <span key={k} className="conn-host">{h}</span>)}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button onClick={run} disabled={busy || selected.size === 0}>
            {busy ? 'Importing…' : `Import ${selected.size}`}
          </button>
        </div>
      </div>
    </div>
  );
}
