import { useEffect } from 'react';
import Icon from './Icon';
import { UpdateStatus, formatBytes, formatSpeed } from '../utils/updates';
import { isEscapeKey } from '../utils/keys';

interface Props {
  status: UpdateStatus;
  currentVersion: string;
  onDownload: () => void;
  onInstall: () => void;
  onOpenDownloadPage: () => void;
  onSkip: (version: string) => void;
  onClose: () => void;
}

const TITLES: Record<UpdateStatus['state'], string> = {
  checking: 'Checking for updates',
  'up-to-date': 'No updates',
  available: 'Update available',
  downloading: 'Downloading update',
  downloaded: 'Update ready',
  error: 'Update check failed',
};

export default function UpdateModal({
  status, currentVersion, onDownload, onInstall, onOpenDownloadPage, onSkip, onClose,
}: Props) {
  // A download in flight must not be dismissed by Escape — quitting mid-write
  // leaves a partial file the updater would have to redo anyway.
  const dismissable = status.state !== 'downloading';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (isEscapeKey(e) && dismissable) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, dismissable]);

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 2000 }}
      onClick={() => { if (dismissable) onClose(); }}
    >
      <div className="modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name={status.state === 'error' ? 'warn' : 'download'} size={16} />
            {TITLES[status.state]}
          </h3>
          {dismissable && (
            <button className="icon-btn" onClick={onClose}><Icon name="close" size={15} /></button>
          )}
        </div>

        <div className="modal-body">
          {status.state === 'checking' && (
            <p className="update-line">Looking for a newer version…</p>
          )}

          {status.state === 'up-to-date' && (
            <p className="update-line">
              <Icon name="check" size={15} style={{ color: 'var(--success)' }} />{' '}
              BoxyNoSql {currentVersion} is the latest version.
            </p>
          )}

          {status.state === 'available' && (<>
            <p className="update-line">
              <strong>BoxyNoSql {status.version}</strong> is available — you have {currentVersion}.
            </p>
            {status.notes && (
              <div className="update-notes">{status.notes}</div>
            )}
            <p className="update-hint">
              {status.canAutoInstall
                ? 'The update downloads in the background; the app restarts to install it.'
                : 'This install type cannot update itself — the download page opens in your browser.'}
            </p>
          </>)}

          {status.state === 'downloading' && (<>
            <div className="update-progress">
              <div className="update-progress-bar" style={{ width: `${status.percent}%` }} />
            </div>
            <p className="update-hint">
              {Math.round(status.percent)}%
              {status.total > 0 && ` · ${formatBytes(status.transferred)} of ${formatBytes(status.total)}`}
              {formatSpeed(status.bytesPerSecond) && ` · ${formatSpeed(status.bytesPerSecond)}`}
            </p>
          </>)}

          {status.state === 'downloaded' && (
            <p className="update-line">
              BoxyNoSql {status.version} is downloaded. Restart to install it — or keep working and it
              installs the next time you quit.
            </p>
          )}

          {status.state === 'error' && (<>
            <p className="update-line">Couldn't check for updates.</p>
            <div className="update-notes">{status.message}</div>
          </>)}
        </div>

        <div className="modal-footer">
          {status.state === 'available' && (<>
            <button className="secondary" onClick={() => onSkip(status.version)}>Skip this version</button>
            <button className="secondary" onClick={onClose}>Later</button>
            <button onClick={status.canAutoInstall ? onDownload : onOpenDownloadPage}>
              {status.canAutoInstall ? 'Download & install' : 'Download'}
            </button>
          </>)}

          {status.state === 'downloaded' && (<>
            <button className="secondary" onClick={onClose}>Later</button>
            <button onClick={onInstall}>Restart & install</button>
          </>)}

          {status.state === 'error' && (<>
            <button className="secondary" onClick={onClose}>Close</button>
            <button onClick={onOpenDownloadPage}>Open downloads page</button>
          </>)}

          {(status.state === 'checking' || status.state === 'up-to-date') && (
            <button className="secondary" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
