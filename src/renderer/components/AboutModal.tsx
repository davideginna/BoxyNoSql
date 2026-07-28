import { useState, useEffect } from 'react';
import Icon from './Icon';
import { getCheckOnStartup, setCheckOnStartup } from '../utils/updates';

const inv = (ch: string, ...a: any[]) => (window as any).electron.invoke(ch, ...a);

interface AppInfo {
  name: string; version: string; description: string; author: string;
  homepage: string; license: string; buildDate: string | null;
  electron: string; chrome: string; node: string; v8: string;
  platform: string; arch: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  linux: 'Linux', win32: 'Windows', darwin: 'macOS',
};

function formatBuildDate(iso: string | null): string {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'unknown' : d.toLocaleString();
}

export default function AboutModal({
  onClose, onCheckUpdates,
}: { onClose: () => void; onCheckUpdates: () => void }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [checkStartup, setCheckStartup] = useState(() => getCheckOnStartup());

  useEffect(() => {
    inv('get-app-info').then(setInfo).catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" style={{ zIndex: 1900 }} onClick={e => { e.stopPropagation(); onClose(); }}>
      <div className="modal about-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>About</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={15} /></button>
        </div>

        <div className="modal-body about-body">
          {/* The logo itself, rebuilt as a real 3D box: each face carries one of
              the flat logo's isometric face colours, so the spin shows the same
              icon from every angle instead of a sprite. */}
          <div className="about-stage">
            <div className="about-cube" role="img" aria-label="BoxyNoSql logo">
              <div className="cube-face cube-front" />
              <div className="cube-face cube-back" />
              <div className="cube-face cube-right" />
              <div className="cube-face cube-left" />
              <div className="cube-face cube-top" />
              <div className="cube-face cube-bottom" />
            </div>
          </div>

          <div className="about-title">{info?.name ?? 'BoxyNoSql'}</div>
          <div className="about-version">
            v{info?.version ?? '—'}
            <span className="about-build">build {formatBuildDate(info?.buildDate ?? null)}</span>
          </div>
          {info?.description && <div className="about-desc">{info.description}</div>}

          <dl className="about-grid">
            <dt>Author</dt><dd>{info?.author || '—'}</dd>
            <dt>License</dt><dd>{info?.license || '—'}</dd>
            <dt>Repository</dt>
            <dd>
              {info?.homepage
                ? <a className="about-link" href={info.homepage} target="_blank" rel="noreferrer">{info.homepage}</a>
                : '—'}
            </dd>
            <dt>Platform</dt>
            <dd className="mono">{info ? `${PLATFORM_LABELS[info.platform] ?? info.platform} · ${info.arch}` : '—'}</dd>
            <dt>Runtime</dt>
            <dd className="mono">
              {info ? `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}` : '—'}
            </dd>
          </dl>

          <div className="update-check-row">
            <button className="secondary" onClick={onCheckUpdates}>
              <Icon name="download" size={14} style={{ marginRight: 6 }} />
              Check for updates
            </button>
            <label>
              <input
                type="checkbox"
                checked={checkStartup}
                onChange={e => { setCheckStartup(e.target.checked); setCheckOnStartup(e.target.checked); }}
              />
              Check on startup
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
