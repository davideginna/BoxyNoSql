import { app, shell, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import https from 'https';
import { isNewer } from './version';

declare const __dirname: string;

/**
 * Update checking, split in two halves:
 *
 *  - **electron-updater** does the work where it can actually install the new
 *    build in place: Windows/NSIS and Linux/AppImage. Both read the
 *    `latest-*.yml` that electron-builder publishes next to the installers.
 *  - **the GitHub releases API** is the fallback for every other case (a `.deb`
 *    install, an unpackaged dev run): we can still tell the user a new version
 *    exists, we just send them to the download page instead of self-updating.
 *
 * Either way the renderer only sees `update:status` events and decides what to
 * show; all user preferences (check on startup, skipped version) live there.
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

interface Repo { owner: string; repo: string }

let win: BrowserWindow | null = null;
let manualCheck = false;
let checking = false;
/** Release page for the version we last found — used by the "download" fallback. */
let downloadUrl = '';

function readPackageJson(): any {
  for (const p of [path.join(__dirname, '../../package.json'), path.join(__dirname, '../package.json')]) {
    try { return require(p); } catch { /* try next */ }
  }
  return {};
}

function getRepo(): Repo | null {
  const pkg = readPackageJson();
  const publish = pkg.build?.publish;
  const gh = (Array.isArray(publish) ? publish : [publish]).find((p: any) => p?.provider === 'github');
  if (gh?.owner && gh?.repo) return { owner: gh.owner, repo: gh.repo };
  const m = /github\.com\/([^/]+)\/([^/]+)/.exec(pkg.homepage ?? '');
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
}

/**
 * True only where electron-updater can replace the running app by itself. A
 * `.deb` install is deliberately excluded: updating it means `pkexec dpkg -i`
 * and a password prompt, so we point at the download page instead.
 */
function canAutoInstall(): boolean {
  if (!app.isPackaged) return false;
  if (process.platform === 'win32') return true;
  if (process.platform === 'linux') return Boolean(process.env.APPIMAGE);
  return false;
}

function send(status: UpdateStatus) {
  if (win && !win.isDestroyed()) win.webContents.send('update:status', status);
}

// ── GitHub releases fallback ─────────────────────────────────────────────────
function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'BoxyNoSql-updater', Accept: 'application/vnd.github+json' }, timeout: 15000 },
      res => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          fetchJson(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`GitHub responded ${res.statusCode}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', c => { body += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e: any) { reject(new Error('Malformed response from GitHub')); }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Timed out contacting GitHub')));
    req.on('error', reject);
  });
}

async function checkViaGitHub(manual: boolean) {
  const repo = getRepo();
  if (!repo) throw new Error('No GitHub repository configured for updates');
  const release = await fetchJson(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`);
  const latest = String(release.tag_name ?? release.name ?? '').replace(/^v/, '');
  const current = app.getVersion();
  downloadUrl = release.html_url || `https://github.com/${repo.owner}/${repo.repo}/releases/latest`;
  if (!latest || !isNewer(latest, current)) {
    send({ state: 'up-to-date', version: current, manual });
    return;
  }
  send({
    state: 'available',
    version: latest,
    notes: String(release.body ?? '').trim(),
    url: downloadUrl,
    canAutoInstall: false,
    manual,
  });
}

// ── electron-updater wiring ──────────────────────────────────────────────────
function normalizeNotes(notes: unknown): string {
  if (typeof notes === 'string') return notes.trim();
  if (Array.isArray(notes)) {
    return notes.map((n: any) => (typeof n === 'string' ? n : n?.note ?? '')).join('\n\n').trim();
  }
  return '';
}

function getAutoUpdater() {
  // Required lazily: pulling it in on an unpackaged run logs noisy warnings and
  // it is never used there.
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  return autoUpdater;
}

function bindAutoUpdaterEvents(autoUpdater: any) {
  const repo = getRepo();
  autoUpdater.on('update-available', (info: any) => {
    checking = false;
    downloadUrl = repo
      ? `https://github.com/${repo.owner}/${repo.repo}/releases/tag/v${info.version}`
      : '';
    send({
      state: 'available',
      version: info.version,
      notes: normalizeNotes(info.releaseNotes),
      url: downloadUrl,
      canAutoInstall: true,
      manual: manualCheck,
    });
  });
  autoUpdater.on('update-not-available', () => {
    checking = false;
    send({ state: 'up-to-date', version: app.getVersion(), manual: manualCheck });
  });
  autoUpdater.on('download-progress', (p: any) => {
    send({
      state: 'downloading',
      percent: Math.max(0, Math.min(100, p.percent ?? 0)),
      transferred: p.transferred ?? 0,
      total: p.total ?? 0,
      bytesPerSecond: p.bytesPerSecond ?? 0,
    });
  });
  autoUpdater.on('update-downloaded', (info: any) => {
    send({ state: 'downloaded', version: info.version });
  });
  autoUpdater.on('error', (err: Error) => {
    checking = false;
    send({ state: 'error', message: err?.message || String(err), manual: manualCheck });
  });
}

let registered = false;

export function initUpdater(browserWindow: BrowserWindow) {
  // The window can be recreated (macOS `activate`); only the target changes.
  win = browserWindow;
  if (registered) return;
  registered = true;

  let autoUpdater: any = null;
  if (canAutoInstall()) {
    try {
      autoUpdater = getAutoUpdater();
      bindAutoUpdaterEvents(autoUpdater);
    } catch (e) {
      autoUpdater = null;
    }
  }

  ipcMain.handle('update:check', async (_, manual = false) => {
    if (checking) return;
    checking = true;
    manualCheck = manual;
    send({ state: 'checking', manual });
    try {
      if (autoUpdater) await autoUpdater.checkForUpdates();
      else { await checkViaGitHub(manual); checking = false; }
    } catch (e: any) {
      checking = false;
      send({ state: 'error', message: e?.message || String(e), manual });
    }
  });

  ipcMain.handle('update:download', async () => {
    if (!autoUpdater) {
      if (downloadUrl) await shell.openExternal(downloadUrl);
      return;
    }
    try {
      await autoUpdater.downloadUpdate();
    } catch (e: any) {
      send({ state: 'error', message: e?.message || String(e), manual: true });
    }
  });

  ipcMain.handle('update:install', () => {
    if (!autoUpdater) return;
    // isSilent=false so the NSIS installer still shows progress; isForceRunAfter
    // brings the app back up once it is done.
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });

  ipcMain.handle('update:open-download', async () => {
    const repo = getRepo();
    const url = downloadUrl || (repo ? `https://github.com/${repo.owner}/${repo.repo}/releases/latest` : '');
    if (url) await shell.openExternal(url);
  });
}
