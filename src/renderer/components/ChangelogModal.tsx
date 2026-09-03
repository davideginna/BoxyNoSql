import { useEffect } from 'react';
import Icon from './Icon';
import { isEscapeKey } from '../utils/keys';
import { parseChangelog, sectionsSince, type ChangelogSection } from '../utils/changelog';

interface Props {
  raw: string;
  /** Set for the automatic "what's new since you last opened this" popup —
   *  only sections newer than this version are shown. Omit for the on-demand
   *  "View changelog" button, which shows the full history. */
  sinceVersion?: string | null;
  onClose: () => void;
}

export default function ChangelogModal({ raw, sinceVersion, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (isEscapeKey(e)) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const all = parseChangelog(raw);
  const sections = sinceVersion ? sectionsSince(all, sinceVersion) : all;
  // `sectionsSince` already falls back to the latest section for an
  // unrecognized `sinceVersion` — an empty result here means the changelog
  // itself is empty or failed to parse, not that there is nothing new.
  const shown: ChangelogSection[] = sections.length > 0 ? sections : all.slice(0, 1);

  return (
    <div className="modal-overlay" style={{ zIndex: 1900 }} onClick={e => { e.stopPropagation(); onClose(); }}>
      <div className="modal modal-wide changelog-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{sinceVersion ? "What's new" : 'Changelog'}</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={15} /></button>
        </div>
        <div className="modal-body changelog-body">
          {shown.length === 0
            ? <p className="update-hint">No changelog available.</p>
            : shown.map(s => (
              <div key={s.version} className="changelog-section">
                <div className="changelog-section-header">
                  <span className="changelog-version">v{s.version}</span>
                  <span className="changelog-date">{s.date}</span>
                </div>
                <div className="changelog-notes">{s.body}</div>
              </div>
            ))}
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
