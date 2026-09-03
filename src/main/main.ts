import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron';
import path from 'path';
import Store from 'electron-store';
import { MongoClient, Db, ObjectId } from 'mongodb';
import fs from 'fs';
import { serializeDoc } from './serialize';
import {
  collectKeys, createChunkWriter, defaultFileName, dialogFilters, type ExportFormat,
} from './exportFormat';
import { guardHandle, ReadOnlyError } from './readOnlyGuard';
import { initUpdater } from './updater';

declare const __dirname: string;

// AppImage-only: the SUID sandbox helper ships inside the squashfs, remounted
// at a fresh /tmp/.mount_XXXXXX path on every launch, so it can never be
// chown-root/chmod-4755'd the way the .deb's postinst does once at install
// time. Without this, Chromium aborts on startup rather than run unsandboxed
// — worse on Ubuntu 24.04+, where AppArmor also denies the unprivileged
// user-namespace fallback outright. `APPIMAGE` is set by electron-builder's
// AppImage launcher (including on the app's own self-relaunch after an
// auto-update), so this only touches the one distribution channel that needs
// it — the .deb and Windows builds keep the sandbox.
// Chromium's own sandbox init falls back to an unprivileged user-namespace
// sandbox when the SUID helper isn't usable (as on a read-only, nosuid-mounted
// AppImage squashfs) — verified on this build: it works even from the real
// nosuid FUSE mount. Forcing `--no-sandbox` used to work around a startup
// FATAL on Ubuntu 24.04+, but on current Electron/Chromium it does more harm
// than good: the sandboxed-off code path routes shared memory through a
// self-managed POSIX shm_open() call that some hosts fail with a spinning
// "Creating shared memory in /dev/shm/… failed: No such process" — the GPU
// and renderer processes never getting a usable region, hence a blank window.
// No override needed here anymore; if a host's namespace sandbox is genuinely
// unavailable, Chromium's own detection still disables it appropriately.

function getAdminDb(client: MongoClient): Db {
  return client.db('admin') as Db;
}


function sanitizeUri(uri: string): string {
  const qIdx = uri.indexOf('?');
  if (qIdx === -1) return uri;
  const base = uri.substring(0, qIdx);
  const cleaned = uri.substring(qIdx + 1)
    .split('&')
    .filter(p => !p.toLowerCase().startsWith('3t.'))
    .join('&');
  return cleaned ? `${base}?${cleaned}` : base;
}

interface TlsSettings {
  tls?: boolean;
  /** PEM holding the client certificate and its private key (Studio 3T's `3t.clientCertPath`). */
  tlsCertificateKeyFile?: string;
  tlsCertificateKeyFilePassword?: string;
  /** PEM with the CA chain — the fix for "self signed certificate in certificate chain". */
  tlsCAFile?: string;
  tlsAllowInvalidCertificates?: boolean;
  tlsAllowInvalidHostnames?: boolean;
  /** SNI to present, when it differs from the host in the URI (`3t.sniName`). */
  tlsServername?: string;
}

interface Connection extends TlsSettings {
  id: string;
  name: string;
  uri: string;
  /** Blocks every write on this connection, enforced here and not in the UI. */
  readOnly?: boolean;
  database?: string;
  folderId?: string;
  color?: string;
  order?: number;
  lastConnectedAt?: number;
}

interface Folder {
  id: string;
  name: string;
  color?: string;
  order?: number;
  parentId?: string;
}

const store = new Store<{ connections: Connection[]; folders: Folder[] }>({
  name: 'connections',
  defaults: { connections: [], folders: [] }
});

let mainWindow: BrowserWindow | null = null;

const isReadOnly = (connectionId: string) =>
  !!store.get('connections').find(c => c.id === connectionId)?.readOnly;

/**
 * Called first in every handler that changes data. The renderer hides the
 * destructive UI too, but that is cosmetic — this is the part a stray
 * `window.electron.invoke` cannot get around.
 */
function assertWritable(connectionId: string) {
  if (isReadOnly(connectionId)) throw new ReadOnlyError();
}


function resolveIcon(): string | undefined {
  const candidates = [
    path.join(__dirname, '../../build/icon.png'),  // dev: project/build/icon.png from dist/main
    path.join(__dirname, '../build/icon.png'),     // packaged app resources
    path.join(process.resourcesPath || '', 'build/icon.png'),
  ];
  for (const p of candidates) {
    try {
      fs.accessSync(p);
      return p;
    } catch { /* not at this path, try next candidate */ }
  }
  return undefined;
}

function createWindow() {
  const iconPath = resolveIcon();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: iconPath,
    title: 'BoxyNoSql',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });

  enableEditContextMenu(mainWindow);

  // The renderer owns the update policy (check on startup, skipped versions);
  // this only registers the IPC handlers and points them at the live window.
  initUpdater(mainWindow);
}

/**
 * Right-click menu for text fields. Electron ships no default context menu, so
 * without this there is no way to cut/copy/paste with the mouse.
 *
 * The keyboard side needs nothing here: Blink handles Ctrl+C/X/V/Z inside
 * editable fields by itself even with no application menu. Do *not* add a
 * `before-input-event` handler calling `webContents.paste()` — that fires on
 * top of Blink's own handling and pastes twice.
 *
 * Editable targets only; everywhere else the renderer draws its own context
 * menus and a native one would pop up on top of them.
 */
function enableEditContextMenu(window: BrowserWindow) {
  window.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;
    const flags = params.editFlags;
    Menu.buildFromTemplate([
      { role: 'undo', enabled: flags.canUndo },
      { role: 'redo', enabled: flags.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: flags.canCut },
      { role: 'copy', enabled: flags.canCopy },
      { role: 'paste', enabled: flags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: flags.canSelectAll },
    ]).popup({ window });
  });
}

// Hide the default File/Edit/View/Window/Help menu (not used by this app)
Menu.setApplicationMenu(null);

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });

ipcMain.handle('show-confirm', async (_, message: string) => {
  const result = await dialog.showMessageBox(mainWindow!, {
    type: 'question', buttons: ['Cancel', 'OK'], defaultId: 1, cancelId: 0, message
  });
  return result.response === 1;
});

ipcMain.handle('show-input', async (_, title: string, defaultValue = '') => {
  // Electron has no native input dialog — use a tiny BrowserWindow
  return new Promise<string | null>(resolve => {
    const win = new BrowserWindow({
      width: 420, height: 140, resizable: false, modal: true,
      parent: mainWindow!, frame: false, alwaysOnTop: true,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    const safeTitle = String(title).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!));
    const html = `<html><body style="margin:0;background:#252526;color:#ccc;font-family:sans-serif;display:flex;flex-direction:column;padding:16px;gap:10px">
      <label style="font-size:13px">${safeTitle}</label>
      <input id="v" value="${defaultValue.replace(/"/g, '&quot;')}" style="background:#3c3c3c;border:1px solid #007acc;color:#ccc;padding:6px 8px;border-radius:4px;font-size:13px;outline:none" />
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="require('electron').ipcRenderer.send('input-done',null)" style="background:#3c3c3c;border:none;color:#ccc;padding:5px 14px;border-radius:4px;cursor:pointer">Cancel</button>
        <button onclick="require('electron').ipcRenderer.send('input-done',document.getElementById('v').value)" style="background:#007acc;border:none;color:#fff;padding:5px 14px;border-radius:4px;cursor:pointer">OK</button>
      </div>
      <script>document.getElementById('v').select();document.getElementById('v').addEventListener('keydown',e=>{if(e.key==='Enter')require('electron').ipcRenderer.send('input-done',document.getElementById('v').value);if(e.key==='Escape')require('electron').ipcRenderer.send('input-done',null);});</script>
    </body></html>`;
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    let settled = false;
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('input-done', listener);
      if (!win.isDestroyed()) win.close();
      resolve(value);
    };
    const listener = (_e: any, value: string | null) => done(value);
    ipcMain.on('input-done', listener);
    win.on('closed', () => done(null));
  });
});

// ── App info ─────────────────────────────────────────────────────────────────
// Build date is taken from the compiled main bundle's mtime: it is written by
// the build that produced this app, so it survives packaging without needing a
// value injected at compile time.
ipcMain.handle('get-app-info', () => {
  let buildDate: string | null = null;
  try { buildDate = fs.statSync(__filename).mtime.toISOString(); } catch { /* ignore */ }
  const pkg = (() => {
    for (const p of [path.join(__dirname, '../../package.json'), path.join(__dirname, '../package.json')]) {
      // Dynamic path with a try/next fallback — needs require(), a static import can't do either.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      try { return require(p); } catch { /* try next */ }
    }
    return {};
  })();
  return {
    name: 'BoxyNoSql',
    version: app.getVersion(),
    description: pkg.description ?? '',
    author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name ?? '',
    homepage: pkg.homepage ?? '',
    license: pkg.license ?? '',
    buildDate,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
  };
});

// Same dev/packaged path fallback as the `package.json` lookup above —
// CHANGELOG.md sits next to it at the repo root, and gets packaged next to it
// too (see `build.files` in package.json).
ipcMain.handle('get-changelog', () => {
  for (const p of [path.join(__dirname, '../../CHANGELOG.md'), path.join(__dirname, '../CHANGELOG.md')]) {
    try { return fs.readFileSync(p, 'utf-8'); } catch { /* try next */ }
  }
  return null;
});

// ── Connection management ────────────────────────────────────────────────────
ipcMain.handle('get-connections', () => store.get('connections'));

ipcMain.handle('save-connection', (_, connection: Connection) => {
  const connections = store.get('connections');
  const idx = connections.findIndex(c => c.id === connection.id);
  if (idx >= 0) connections[idx] = connection; else connections.push(connection);
  store.set('connections', connections);
  return connections;
});

ipcMain.handle('touch-connection', (_, id: string) => {
  const connections = store.get('connections');
  const idx = connections.findIndex(c => c.id === id);
  if (idx >= 0) connections[idx] = { ...connections[idx], lastConnectedAt: Date.now() };
  store.set('connections', connections);
  return connections;
});

ipcMain.handle('delete-connection', (_, id: string) => {
  const connections = store.get('connections').filter(c => c.id !== id);
  store.set('connections', connections);
  return connections;
});

ipcMain.handle('reorder-connections', (_, connections: Connection[]) => {
  store.set('connections', connections);
  return connections;
});

// ── Folder management ────────────────────────────────────────────────────────
ipcMain.handle('get-folders', () => store.get('folders'));

ipcMain.handle('save-folder', (_, folder: Folder) => {
  const folders = store.get('folders');
  const idx = folders.findIndex(f => f.id === folder.id);
  if (idx >= 0) folders[idx] = folder; else folders.push(folder);
  store.set('folders', folders);
  return folders;
});

ipcMain.handle('delete-folder', (_, id: string) => {
  store.set('folders', store.get('folders').filter(f => f.id !== id));
  const conns = store.get('connections').map(c =>
    c.folderId === id ? { ...c, folderId: undefined } : c
  );
  store.set('connections', conns);
  return { folders: store.get('folders'), connections: store.get('connections') };
});

ipcMain.handle('reorder-folders', (_, folders: Folder[]) => {
  store.set('folders', folders);
  return folders;
});

// ── Connection management ─────────────────────────────────────────────────────
const clients: Map<string, MongoClient> = new Map();

// Turns the stored TLS settings into MongoClient options. Files are checked up
// front because the driver's own failure ("ENOENT") does not say which file.
function buildTlsOptions(s: TlsSettings | undefined): Record<string, any> {
  if (!s) return {};
  const opts: Record<string, any> = {};
  const requireFile = (p: string, label: string) => {
    const resolved = p.trim();
    if (!fs.existsSync(resolved)) throw new Error(`${label} not found: ${resolved}`);
    return resolved;
  };

  const wantsTls = s.tls || !!s.tlsCertificateKeyFile || !!s.tlsCAFile;
  if (!wantsTls) return {};
  opts.tls = true;

  if (s.tlsCertificateKeyFile) opts.tlsCertificateKeyFile = requireFile(s.tlsCertificateKeyFile, 'Client certificate');
  if (s.tlsCertificateKeyFilePassword) opts.tlsCertificateKeyFilePassword = s.tlsCertificateKeyFilePassword;
  if (s.tlsCAFile) opts.tlsCAFile = requireFile(s.tlsCAFile, 'CA file');
  if (s.tlsAllowInvalidCertificates) opts.tlsAllowInvalidCertificates = true;
  if (s.tlsAllowInvalidHostnames) opts.tlsAllowInvalidHostnames = true;
  // Node's TLS `servername` — MongoClientOptions extends tls.ConnectionOptions.
  if (s.tlsServername) opts.servername = s.tlsServername.trim();
  return opts;
}

// Native file picker for certificate paths (renderer cannot read a File's path
// since Electron 32).
ipcMain.handle('pick-certificate-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select certificate file',
    properties: ['openFile'],
    filters: [
      { name: 'Certificates', extensions: ['pem', 'crt', 'cer', 'key', 'p12', 'pfx'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
});

ipcMain.handle('test-connection', async (_, uri: string, tls?: TlsSettings) => {
  const log = (msg: string) => mainWindow?.webContents.send('test-log', msg);
  const clean = sanitizeUri(uri);
  let host = uri;
  try { host = new URL(clean).host; } catch {}

  let tlsOptions: Record<string, any>;
  try {
    tlsOptions = buildTlsOptions(tls);
  } catch (e: any) {
    log(`✕ ${e.message}`);
    return { success: false, error: e.message };
  }

  const client = new MongoClient(clean, { serverSelectionTimeoutMS: 5000, ...tlsOptions });
  try {
    log(`→ Parsing URI...`);
    if (tlsOptions.tls) {
      log(`→ TLS on${tlsOptions.tlsCertificateKeyFile ? ' · client certificate' : ''}${tlsOptions.tlsCAFile ? ' · custom CA' : ''}${tlsOptions.servername ? ` · SNI ${tlsOptions.servername}` : ''}${tlsOptions.tlsAllowInvalidCertificates ? ' · certificate validation OFF' : ''}`);
    }
    log(`→ Connecting to ${host}`);
    await client.connect();
    log(`✓ TCP connection established`);
    log(`→ Authenticating...`);
    log(`→ Sending ping to admin db...`);
    await getAdminDb(client).command({ ping: 1 });
    log(`✓ Server replied to ping`);
    await client.close();
    log(`✓ Disconnected cleanly`);
    return { success: true };
  } catch (error: any) {
    log(`✕ ${error.message}`);
    try { await client.close(); } catch {}
    return { success: false, error: error.message };
  }
});

ipcMain.handle('connect-db', async (_, connectionId: string) => {
  const connection = store.get('connections').find(c => c.id === connectionId);
  if (!connection) throw new Error('Connection not found');

  if (clients.has(connectionId)) {
    try { await clients.get(connectionId)!.close(); } catch {}
  }

  const client = new MongoClient(sanitizeUri(connection.uri), {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    ...buildTlsOptions(connection),
  });
  await client.connect();
  clients.set(connectionId, client);

  const adminDb = getAdminDb(client);
  const databases = await adminDb.command({ listDatabases: 1 });
  return { databases: databases.databases.map((d: any) => d.name) };
});

ipcMain.handle('disconnect-db', async (_, connectionId: string) => {
  const client = clients.get(connectionId);
  if (client) { await client.close(); clients.delete(connectionId); }
});

ipcMain.handle('is-connected', (_, connectionId: string) => clients.has(connectionId));

// ── Database operations ───────────────────────────────────────────────────────
ipcMain.handle('list-databases', async (_, connectionId: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const result = await getAdminDb(client).command({ listDatabases: 1 });
  return result.databases.map((d: any) => d.name);
});

ipcMain.handle('drop-database', async (_, connectionId: string, dbName: string) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  await client.db(dbName).dropDatabase();
  return { success: true };
});

// ── Collection operations ────────────────────────────────────────────────────
ipcMain.handle('get-collections', async (_, connectionId: string, dbName: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const cols = await client.db(dbName).listCollections().toArray();
  return cols.map(c => c.name).sort();
});

ipcMain.handle('create-collection', async (_, connectionId: string, dbName: string, colName: string) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  await client.db(dbName).createCollection(colName);
  return { success: true };
});

ipcMain.handle('drop-collection', async (_, connectionId: string, dbName: string, colName: string) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  await client.db(dbName).collection(colName).drop();
  return { success: true };
});

ipcMain.handle('rename-collection', async (_, connectionId: string, dbName: string, oldName: string, newName: string) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  await client.db(dbName).collection(oldName).rename(newName);
  return { success: true };
});

ipcMain.handle('duplicate-collection', async (_, connectionId: string, dbName: string, srcName: string, destName: string) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const db = client.db(dbName);
  const existing = await db.listCollections({ name: destName }, { nameOnly: true }).toArray();
  if (existing.length > 0) throw new Error(`Collection "${destName}" already exists`);
  await db.createCollection(destName);
  // Copy all documents server-side via aggregation $out.
  await db.collection(srcName).aggregate([{ $out: destName }]).toArray();
  // Recreate non-_id indexes.
  const indexes = await db.collection(srcName).indexes();
  for (const idx of indexes) {
    if (idx.name === '_id_') continue;
    const { key, name, v, ...opts } = idx as any;
    try { await db.collection(destName).createIndex(key, { name, ...opts }); } catch {}
  }
  return { success: true };
});

// Cross-connection collection copy: source and target can be different
// MongoClients (even different servers), so unlike duplicate-collection above
// this can't use a server-side $out and has to stream documents through the
// main process in batches. Shared by copy-collection and copy-database below.
async function copyCollectionData(srcColRef: any, tgtColRef: any): Promise<{ insertedCount: number; indexesCreated: number }> {
  const BATCH_SIZE = 500;
  let batch: any[] = [];
  let insertedCount = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    const result = await tgtColRef.insertMany(batch);
    insertedCount += result.insertedCount;
    batch = [];
  };
  const cursor = srcColRef.find({});
  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();
  let indexesCreated = 0;
  const indexes = await srcColRef.indexes();
  for (const idx of indexes) {
    if (idx.name === '_id_') continue;
    const { key, name, v, ...opts } = idx as any;
    try { await tgtColRef.createIndex(key, { name, ...opts }); indexesCreated++; } catch {}
  }
  return { insertedCount, indexesCreated };
}

ipcMain.handle('copy-collection', async (_, args: {
  sourceConnId: string; sourceDb: string; sourceCol: string;
  targetConnId: string; targetDb: string; targetCol: string;
}) => {
  // Reading from a read-only connection is fine; writing to one is not.
  assertWritable(args.targetConnId);
  const { sourceConnId, sourceDb, sourceCol, targetConnId, targetDb, targetCol } = args;
  const srcClient = clients.get(sourceConnId);
  const tgtClient = clients.get(targetConnId);
  if (!srcClient) throw new Error('Source connection not connected');
  if (!tgtClient) throw new Error('Target connection not connected');
  const tgtDbRef = tgtClient.db(targetDb);
  const existing = await tgtDbRef.listCollections({ name: targetCol }, { nameOnly: true }).toArray();
  if (existing.length > 0) throw new Error(`Collection "${targetCol}" already exists in "${targetDb}"`);
  await tgtDbRef.createCollection(targetCol);
  const srcColRef = srcClient.db(sourceDb).collection(sourceCol);
  const tgtColRef = tgtDbRef.collection(targetCol);
  return copyCollectionData(srcColRef, tgtColRef);
});

// Cross-connection database copy: same idea as copy-collection, but walks
// every collection of the source db into a freshly created target db.
ipcMain.handle('copy-database', async (_, args: {
  sourceConnId: string; sourceDb: string; targetConnId: string; targetDb: string;
}) => {
  assertWritable(args.targetConnId);
  const { sourceConnId, sourceDb, targetConnId, targetDb } = args;
  const srcClient = clients.get(sourceConnId);
  const tgtClient = clients.get(targetConnId);
  if (!srcClient) throw new Error('Source connection not connected');
  if (!tgtClient) throw new Error('Target connection not connected');
  const existingDbs: string[] = (await getAdminDb(tgtClient).command({ listDatabases: 1, nameOnly: true })).databases.map((d: any) => d.name);
  if (existingDbs.includes(targetDb)) throw new Error(`Database "${targetDb}" already exists`);
  const srcDbRef = srcClient.db(sourceDb);
  const tgtDbRef = tgtClient.db(targetDb);
  const cols = await srcDbRef.listCollections({}, { nameOnly: true }).toArray();
  let insertedCount = 0;
  let indexesCreated = 0;
  for (const colInfo of cols) {
    await tgtDbRef.createCollection(colInfo.name);
    const result = await copyCollectionData(srcDbRef.collection(colInfo.name), tgtDbRef.collection(colInfo.name));
    insertedCount += result.insertedCount;
    indexesCreated += result.indexesCreated;
  }
  return { collectionsCount: cols.length, insertedCount, indexesCreated };
});

/**
 * What a drop or a clear is about to destroy, for the typed confirmation.
 *
 * Counts come from `estimatedDocumentCount()` (collection metadata, O(1)) and
 * not from `countDocuments()`: this runs while the user is still deciding, on a
 * database that may hold millions of documents, and a slightly stale number is
 * worth far more than a full scan per collection.
 */
ipcMain.handle('get-drop-impact', async (_, connectionId: string, dbName: string, colName?: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const dbRef = client.db(dbName);
  if (colName) {
    return { documents: await dbRef.collection(colName).estimatedDocumentCount(), estimated: true };
  }
  const cols = await dbRef.listCollections().toArray();
  let documents = 0;
  for (const col of cols) documents += await dbRef.collection(col.name).estimatedDocumentCount();
  return { collections: cols.length, documents, estimated: true };
});

ipcMain.handle('clear-collection', async (_, connectionId: string, dbName: string, colName: string) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const result = await client.db(dbName).collection(colName).deleteMany({});
  return { deletedCount: result.deletedCount };
});

ipcMain.handle('clear-database', async (_, connectionId: string, dbName: string) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const cols = await client.db(dbName).listCollections().toArray();
  for (const col of cols) {
    await client.db(dbName).collection(col.name).deleteMany({});
  }
  return { collections: cols.length };
});

function fromExtJSON(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(fromExtJSON);
  if ('$oid' in val) { try { return new ObjectId(val.$oid); } catch { return val.$oid; } }
  if ('$date' in val) return new Date(val.$date);
  const out: any = {};
  for (const [k, v] of Object.entries(val)) out[k] = fromExtJSON(v);
  return out;
}

// ── Documents ────────────────────────────────────────────────────────────────
ipcMain.handle('get-documents', async (_, connectionId: string, dbName: string, collection: string, query: any = {}, limit = 20, skip = 0, sort: any = null, projection: any = null) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const col = client.db(dbName).collection(collection);
  const mongoQuery = fromExtJSON(query);
  // The page itself is cheap (skip+limit). The total is what costs: an unfiltered
  // countDocuments is a full scan that grows with the collection and is re-run on
  // every page change. With no filter the collection metadata already holds the
  // number, so use it and tell the renderer the figure is an estimate.
  const isUnfiltered = !mongoQuery || Object.keys(mongoQuery).length === 0;
  // Sort and projection are server-side on purpose: sorting only the current
  // page would order 20 documents out of the whole collection, and a projection
  // applied in the renderer would still ship every field over IPC.
  const cursor = col.find(mongoQuery, projection ? { projection } : {});
  if (sort && Object.keys(sort).length > 0) cursor.sort(sort);
  const [docs, total] = await Promise.all([
    cursor.skip(skip).limit(limit).toArray(),
    isUnfiltered ? col.estimatedDocumentCount() : col.countDocuments(mongoQuery),
  ]);
  return { docs: docs.map(v => serializeDoc(v)), total, estimated: isUnfiltered };
});

ipcMain.handle('update-document', async (_, connectionId: string, dbName: string, collection: string, docId: string, update: any) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  let filter: any;
  try { filter = { _id: new ObjectId(docId) }; } catch { filter = { _id: docId }; }
  const { _id: _removed, ...rest } = update;
  const updateDoc = fromExtJSON(rest);
  await client.db(dbName).collection(collection).replaceOne(filter, updateDoc);
  return { success: true };
});

ipcMain.handle('insert-documents', async (_, connectionId: string, dbName: string, collection: string, docs: any[]) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const prepared = docs.map(d => fromExtJSON(d));
  const result = await client.db(dbName).collection(collection).insertMany(prepared);
  return { insertedCount: result.insertedCount };
});

/**
 * One field, many documents. The update document is built in the renderer
 * (`utils/bulkEdit.ts`) so it can be shown before it runs; this only revives
 * the ids and the value and hands it to `updateMany`.
 */
ipcMain.handle('bulk-update-documents', async (_, connectionId: string, dbName: string, collection: string, docIds: string[], update: any) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  // Same fallback as update-document: an `_id` that is not an ObjectId is a
  // legitimate `_id`, so try both rather than dropping the document.
  const ids = docIds.map(id => { try { return new ObjectId(id); } catch { return id; } });
  const rawIds = docIds.filter(id => !/^[0-9a-f]{24}$/i.test(id));
  const filter: any = { _id: { $in: [...ids, ...rawIds] } };
  const result = await client.db(dbName).collection(collection).updateMany(filter, fromExtJSON(update));
  return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
});

ipcMain.handle('delete-document', async (_, connectionId: string, dbName: string, collection: string, docId: string) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  let filter: any;
  try { filter = { _id: new ObjectId(docId) }; } catch { filter = { _id: docId }; }
  const result = await client.db(dbName).collection(collection).deleteOne(filter);
  return { deletedCount: result.deletedCount };
});

ipcMain.handle('run-query', async (_, connectionId: string, dbName: string, collection: string, query: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const fn = new Function('db', `return (async () => { return (${query}) })()`);
  // The query terminal evals user code against a live handle, so a read-only
  // connection cannot be protected by a check up front — it gets a proxied
  // `db` whose write methods throw instead.
  const handle = client.db(dbName);
  let result = await fn(isReadOnly(connectionId) ? guardHandle(handle) : handle);
  if (result != null && typeof result.toArray === 'function') result = await result.toArray();
  if (Array.isArray(result)) return result.map(v => serializeDoc(v));
  return serializeDoc(result);
});

ipcMain.handle('run-aggregation', async (_, connectionId: string, dbName: string, collection: string, pipeline: any[]) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const prepared = fromExtJSON(pipeline);
  const docs = await client.db(dbName).collection(collection).aggregate(prepared).toArray();
  return docs.map(v => serializeDoc(v));
});

/** Stages that write. Re-running a prefix that ends in one just to count it would write again. */
const WRITE_STAGES = new Set(['$out', '$merge']);

/**
 * How many documents each stage of the pipeline leaves behind: one
 * `pipeline.slice(0, i + 1) + [{ $count }]` per stage, so an n-stage pipeline
 * costs n aggregations. That is the price of the per-stage counter in the
 * builder — it only runs on an explicit Run, never while typing.
 *
 * A stage that writes gets `null`, and so does everything after it: once the
 * prefix contains a write there is no way to count without repeating the write.
 */
ipcMain.handle('aggregation-stage-counts', async (_, connectionId: string, dbName: string, collection: string, pipeline: any[]) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const col = client.db(dbName).collection(collection);
  const prepared: any[] = fromExtJSON(pipeline);
  const counts: (number | null)[] = [];
  let poisoned = false;
  for (let i = 0; i < prepared.length; i++) {
    const stageName = Object.keys(prepared[i] ?? {})[0];
    if (poisoned || WRITE_STAGES.has(stageName)) {
      poisoned = true;
      counts.push(null);
      continue;
    }
    try {
      const res = await col.aggregate([...prepared.slice(0, i + 1), { $count: 'n' }]).toArray();
      counts.push(res[0]?.n ?? 0);
    } catch {
      // One broken stage should not cost the counts of the stages before it.
      counts.push(null);
      poisoned = true;
    }
  }
  return counts;
});

// ── Explain ──────────────────────────────────────────────────────────────────
/**
 * `executionStats` and not `queryPlanner`: the plan alone says which index was
 * chosen, but not how many documents that cost, which is the whole question.
 */
const EXPLAIN_VERBOSITY = 'executionStats';

/**
 * Explaining a pipeline runs everything before the write stage for real, and
 * MongoDB will not explain the write stage itself — so a pipeline that ends in
 * `$out`/`$merge` is refused up front rather than half-executed.
 */
function assertExplainable(pipeline: any[]) {
  const writing = pipeline.find(stage => WRITE_STAGES.has(Object.keys(stage ?? {})[0]));
  if (writing) {
    throw new Error(`Cannot explain a pipeline containing ${Object.keys(writing)[0]} — it writes, and an explain must not.`);
  }
}

// None of the three explain handlers goes through `assertWritable`: explaining
// is a read, and a read-only connection is exactly where you want to be able to
// ask why a query is slow.
ipcMain.handle('explain-find', async (_, connectionId: string, dbName: string, collection: string, filter: any = {}, sort: any = null, projection: any = null) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  // The same cursor `get-documents` builds, minus the paging: explaining a
  // different query than the one the view runs would be worse than useless.
  const cursor = client.db(dbName).collection(collection)
    .find(fromExtJSON(filter ?? {}), projection ? { projection } : {});
  if (sort && Object.keys(sort).length > 0) cursor.sort(sort);
  return serializeDoc(await cursor.explain(EXPLAIN_VERBOSITY));
});

ipcMain.handle('explain-aggregation', async (_, connectionId: string, dbName: string, collection: string, pipeline: any[]) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const prepared: any[] = fromExtJSON(pipeline);
  assertExplainable(prepared);
  return serializeDoc(await client.db(dbName).collection(collection).aggregate(prepared).explain(EXPLAIN_VERBOSITY));
});

/**
 * Explain whatever the query terminal holds. The query is evalled the way
 * `run-query` does it, but *always* against the guarded handle regardless of
 * the connection's read-only flag: an `insertOne` left in the editor must not
 * run just because Explain was the button that got clicked.
 *
 * Only a cursor can be explained. `findOne`, `countDocuments` and the write
 * helpers return a value, and there is no honest explain to show for those —
 * say so rather than invent one.
 */
ipcMain.handle('explain-query', async (_, connectionId: string, dbName: string, _collection: string, query: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const fn = new Function('db', `return (async () => { return (${query}) })()`);
  const result = await fn(guardHandle(client.db(dbName)));
  if (!result || typeof result.explain !== 'function') {
    throw new Error('Only a cursor can be explained. Use find() or aggregate(), and leave off .toArray().');
  }
  if (Array.isArray(result.pipeline)) assertExplainable(result.pipeline);
  return serializeDoc(await result.explain(EXPLAIN_VERBOSITY));
});

// ── Indexes ──────────────────────────────────────────────────────────────────
ipcMain.handle('get-indexes', async (_, connectionId: string, dbName: string, collection: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  return client.db(dbName).collection(collection).indexes();
});

ipcMain.handle('get-index-stats', async (_, connectionId: string, dbName: string, collection: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  try {
    return await client.db(dbName).collection(collection).aggregate([{ $indexStats: {} }]).toArray();
  } catch { return []; }
});

ipcMain.handle('create-index', async (_, connectionId: string, dbName: string, collection: string, keys: any, options: any = {}) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  return client.db(dbName).collection(collection).createIndex(keys, options);
});

ipcMain.handle('drop-index', async (_, connectionId: string, dbName: string, collection: string, indexName: string) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  return client.db(dbName).collection(collection).dropIndex(indexName);
});

// ── Stats / Export ────────────────────────────────────────────────────────────
ipcMain.handle('get-collection-stats', async (_, connectionId: string, dbName: string, collectionName: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  return client.db(dbName).command({ collStats: collectionName });
});

/** Save dialog + write stream. Returns null when the user cancels. */
async function askSavePath(defaultName: string, format: ExportFormat): Promise<string | null> {
  const res = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export',
    defaultPath: defaultName,
    filters: dialogFilters(format),
  });
  return res.canceled || !res.filePath ? null : res.filePath;
}

function openWriter(filePath: string) {
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
  return {
    write: (s: string) => new Promise<void>((resolve, reject) => {
      stream.write(s, err => err ? reject(err) : resolve());
    }),
    close: () => new Promise<void>(resolve => stream.end(resolve)),
  };
}

/**
 * Export the result of a find, exactly as the documents view has it: same
 * filter, same sort, same projection. The cursor is walked one document at a
 * time and written straight to disk, so the size of the collection does not
 * become the size of the heap.
 *
 * CSV takes two passes on purpose — the header has to list every field any
 * document has, and that is only known after seeing them all. Buffering them
 * instead would defeat the streaming.
 */
ipcMain.handle('export-documents', async (_, args: {
  connectionId: string; dbName: string; collection: string;
  filter?: any; sort?: any; projection?: any;
  format: ExportFormat; filtered?: boolean;
}) => {
  const client = clients.get(args.connectionId);
  if (!client) throw new Error('Not connected');
  const col = client.db(args.dbName).collection(args.collection);
  const filter = fromExtJSON(args.filter ?? {});
  const cursor = () => {
    const c = col.find(filter, args.projection ? { projection: args.projection } : {});
    if (args.sort && Object.keys(args.sort).length > 0) c.sort(args.sort);
    return c;
  };

  const filePath = await askSavePath(defaultFileName(args.collection, args.format, args.filtered), args.format);
  if (!filePath) return { canceled: true };

  let keys: string[] | undefined;
  if (args.format === 'csv') {
    const found = new Set<string>();
    for await (const doc of cursor()) collectKeys([serializeDoc(doc)], found);
    keys = [...found];
  }

  const writer = createChunkWriter(args.format, keys);
  const out = openWriter(filePath);
  let count = 0;
  try {
    await out.write(writer.head());
    for await (const doc of cursor()) {
      await out.write(writer.row(serializeDoc(doc)));
      count++;
    }
    await out.write(writer.tail());
  } finally {
    await out.close();
  }
  return { canceled: false, filePath, count };
});

/**
 * Export rows the renderer already holds — a query terminal or aggregation
 * result. They are serialized documents, not a cursor, so there is nothing to
 * stream from; they only have to be formatted and written.
 */
ipcMain.handle('export-rows', async (_, args: { rows: any[]; baseName: string; format: ExportFormat }) => {
  const filePath = await askSavePath(defaultFileName(args.baseName, args.format), args.format);
  if (!filePath) return { canceled: true };

  const rows = Array.isArray(args.rows) ? args.rows : [args.rows];
  const keys = args.format === 'csv' ? [...collectKeys(rows)] : undefined;
  const writer = createChunkWriter(args.format, keys);
  const out = openWriter(filePath);
  try {
    await out.write(writer.head());
    for (const row of rows) await out.write(writer.row(row));
    await out.write(writer.tail());
  } finally {
    await out.close();
  }
  return { canceled: false, filePath, count: rows.length };
});

// ── Import ───────────────────────────────────────────────────────────────────
ipcMain.handle('import-collection', async (_, connectionId: string, dbName: string, colName: string, docs: any[]) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const dbRef = client.db(dbName);
  try { await dbRef.createCollection(colName); } catch { /* may already exist */ }
  if (!Array.isArray(docs) || docs.length === 0) return { insertedCount: 0 };
  const prepared = docs.map(d => fromExtJSON(d));
  const result = await dbRef.collection(colName).insertMany(prepared);
  return { insertedCount: result.insertedCount };
});

ipcMain.handle('import-database', async (_, connectionId: string, dbName: string, collections: Record<string, any[]>) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const dbRef = client.db(dbName);
  let totalDocs = 0;
  let totalCols = 0;
  for (const [colName, docs] of Object.entries(collections)) {
    try { await dbRef.createCollection(colName); } catch { /* exists */ }
    totalCols++;
    if (Array.isArray(docs) && docs.length > 0) {
      const prepared = docs.map(d => fromExtJSON(d));
      const result = await dbRef.collection(colName).insertMany(prepared);
      totalDocs += result.insertedCount;
    }
  }
  return { collections: totalCols, documents: totalDocs };
});

// ── Users ─────────────────────────────────────────────────────────────────────
ipcMain.handle('list-users', async (_, connectionId: string, dbName: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const result = await client.db(dbName).command({ usersInfo: 1 });
  return result.users || [];
});

ipcMain.handle('create-user', async (_, connectionId: string, dbName: string, username: string, password: string, roles: any[]) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  await client.db(dbName).command({ createUser: username, pwd: password, roles });
  return { success: true };
});

ipcMain.handle('drop-user', async (_, connectionId: string, dbName: string, username: string) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  await client.db(dbName).command({ dropUser: username });
  return { success: true };
});

// ── Roles ─────────────────────────────────────────────────────────────────────
ipcMain.handle('list-roles', async (_, connectionId: string, dbName: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const result = await client.db(dbName).command({ rolesInfo: 1 });
  return result.roles || [];
});

ipcMain.handle('create-role', async (_, connectionId: string, dbName: string, roleName: string, privileges: any[], roles: any[]) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  await client.db(dbName).command({ createRole: roleName, privileges, roles });
  return { success: true };
});

ipcMain.handle('drop-role', async (_, connectionId: string, dbName: string, roleName: string) => {
  assertWritable(connectionId);
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  await client.db(dbName).command({ dropRole: roleName });
  return { success: true };
});
