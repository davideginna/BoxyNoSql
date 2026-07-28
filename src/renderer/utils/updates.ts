/**
 * Renderer-side update policy. The main process only reports what it found on
 * GitHub; whether that turns into a visible dialog is decided here, from prefs
 * kept in `localStorage` alongside the other UI preferences.
 */

export type UpdateStatus =
  | { state: 'checking'; manual: boolean }
  | { state: 'up-to-date'; version: string; manual: boolean }
  | {
      state: 'available';
      version: string;
      notes: string;
      url: string;
      canAutoInstall: boolean;
      manual: boolean;
    }
  | { state: 'downloading'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string; manual: boolean };

const KEY_STARTUP = 'updateCheckOnStartup';
const KEY_SKIPPED = 'updateSkippedVersion';

export function getCheckOnStartup(): boolean {
  return localStorage.getItem(KEY_STARTUP) !== 'false';
}

export function setCheckOnStartup(value: boolean): void {
  localStorage.setItem(KEY_STARTUP, String(value));
}

export function getSkippedVersion(): string | null {
  return localStorage.getItem(KEY_SKIPPED);
}

export function setSkippedVersion(version: string | null): void {
  if (version) localStorage.setItem(KEY_SKIPPED, version);
  else localStorage.removeItem(KEY_SKIPPED);
}

/**
 * A check the user asked for always reports back, including "you're up to
 * date" and errors. The automatic startup check may only interrupt with a real
 * new version, and never with one the user chose to skip.
 */
export function shouldShow(status: UpdateStatus, skippedVersion: string | null): boolean {
  switch (status.state) {
    case 'downloading':
    case 'downloaded':
      // Only reachable after the user started a download — the dialog is open.
      return true;
    case 'available':
      return status.manual || status.version !== skippedVersion;
    default:
      return status.manual;
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  return bytesPerSecond > 0 ? `${formatBytes(bytesPerSecond)}/s` : '';
}
