import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import Store from 'electron-store';
import { MongoClient, Db, ObjectId } from 'mongodb';

declare const __dirname: string;

function getAdminDb(client: MongoClient): Db {
  return client.db('admin') as Db;
}

function serializeDoc(val: any, seen = new Set<any>()): any {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  if (val._bsontype) return val.toString();
  if (val instanceof Date) return val.toISOString();
  if (Buffer.isBuffer(val)) return val.toString('hex');
  if (seen.has(val)) return '[Circular]';
  seen.add(val);
  if (Array.isArray(val)) return val.map(v => serializeDoc(v, new Set()));
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) out[k] = serializeDoc(v, seen);
  return out;
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

interface Connection {
  id: string;
  name: string;
  uri: string;
  database?: string;
  folderId?: string;
  color?: string;
  order?: number;
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
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
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

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
    const html = `<html><body style="margin:0;background:#252526;color:#ccc;font-family:sans-serif;display:flex;flex-direction:column;padding:16px;gap:10px">
      <label style="font-size:13px">${title}</label>
      <input id="v" value="${defaultValue.replace(/"/g, '&quot;')}" style="background:#3c3c3c;border:1px solid #007acc;color:#ccc;padding:6px 8px;border-radius:4px;font-size:13px;outline:none" />
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="require('electron').ipcRenderer.send('input-done',null)" style="background:#3c3c3c;border:none;color:#ccc;padding:5px 14px;border-radius:4px;cursor:pointer">Cancel</button>
        <button onclick="require('electron').ipcRenderer.send('input-done',document.getElementById('v').value)" style="background:#007acc;border:none;color:#fff;padding:5px 14px;border-radius:4px;cursor:pointer">OK</button>
      </div>
      <script>document.getElementById('v').select();document.getElementById('v').addEventListener('keydown',e=>{if(e.key==='Enter')require('electron').ipcRenderer.send('input-done',document.getElementById('v').value);if(e.key==='Escape')require('electron').ipcRenderer.send('input-done',null);});</script>
    </body></html>`;
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    ipcMain.once('input-done', (_, value: string | null) => {
      win.close();
      resolve(value);
    });
    win.on('closed', () => resolve(null));
  });
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

ipcMain.handle('test-connection', async (_, uri: string) => {
  const log = (msg: string) => mainWindow?.webContents.send('test-log', msg);
  const clean = sanitizeUri(uri);
  let host = uri;
  try { host = new URL(clean).host; } catch {}

  const client = new MongoClient(clean, { serverSelectionTimeoutMS: 5000 });
  try {
    log(`→ Parsing URI...`);
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

  const client = new MongoClient(sanitizeUri(connection.uri));
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
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  await client.db(dbName).createCollection(colName);
  return { success: true };
});

ipcMain.handle('drop-collection', async (_, connectionId: string, dbName: string, colName: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  await client.db(dbName).collection(colName).drop();
  return { success: true };
});

ipcMain.handle('rename-collection', async (_, connectionId: string, dbName: string, oldName: string, newName: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  await client.db(dbName).collection(oldName).rename(newName);
  return { success: true };
});

ipcMain.handle('clear-collection', async (_, connectionId: string, dbName: string, colName: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const result = await client.db(dbName).collection(colName).deleteMany({});
  return { deletedCount: result.deletedCount };
});

ipcMain.handle('clear-database', async (_, connectionId: string, dbName: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const cols = await client.db(dbName).listCollections().toArray();
  for (const col of cols) {
    await client.db(dbName).collection(col.name).deleteMany({});
  }
  return { collections: cols.length };
});

// ── Documents ────────────────────────────────────────────────────────────────
ipcMain.handle('get-documents', async (_, connectionId: string, dbName: string, collection: string, query: any = {}, limit = 20, skip = 0) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const col = client.db(dbName).collection(collection);
  const [docs, total] = await Promise.all([
    col.find(query).skip(skip).limit(limit).toArray(),
    col.countDocuments(query),
  ]);
  return { docs: docs.map(v => serializeDoc(v)), total };
});

ipcMain.handle('update-document', async (_, connectionId: string, dbName: string, collection: string, docId: string, update: any) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  let filter: any;
  try { filter = { _id: new ObjectId(docId) }; } catch { filter = { _id: docId }; }
  const { _id: _removed, ...updateDoc } = update;
  await client.db(dbName).collection(collection).replaceOne(filter, updateDoc);
  return { success: true };
});

ipcMain.handle('insert-documents', async (_, connectionId: string, dbName: string, collection: string, docs: any[]) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const result = await client.db(dbName).collection(collection).insertMany(docs);
  return { insertedCount: result.insertedCount };
});

ipcMain.handle('delete-document', async (_, connectionId: string, dbName: string, collection: string, docId: string) => {
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
  let result = await fn(client.db(dbName));
  if (result != null && typeof result.toArray === 'function') result = await result.toArray();
  if (Array.isArray(result)) return result.map(v => serializeDoc(v));
  return serializeDoc(result);
});

ipcMain.handle('run-aggregation', async (_, connectionId: string, dbName: string, collection: string, pipeline: any[]) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const docs = await client.db(dbName).collection(collection).aggregate(pipeline).toArray();
  return docs.map(v => serializeDoc(v));
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
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  return client.db(dbName).collection(collection).createIndex(keys, options);
});

ipcMain.handle('drop-index', async (_, connectionId: string, dbName: string, collection: string, indexName: string) => {
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

ipcMain.handle('export-collection', async (_, connectionId: string, dbName: string, collection: string, format: 'json' | 'csv') => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const docs = await client.db(dbName).collection(collection).find({}).toArray();
  if (format === 'json') return JSON.stringify(docs.map(v => serializeDoc(v)), null, 2);
  if (docs.length === 0) return '';
  const keys = Object.keys(docs[0]);
  return [keys.join(','), ...docs.map(doc => keys.map(k => JSON.stringify((doc as any)[k])).join(','))].join('\n');
});

// ── Users ─────────────────────────────────────────────────────────────────────
ipcMain.handle('list-users', async (_, connectionId: string, dbName: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  const result = await client.db(dbName).command({ usersInfo: 1 });
  return result.users || [];
});

ipcMain.handle('create-user', async (_, connectionId: string, dbName: string, username: string, password: string, roles: any[]) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  await client.db(dbName).command({ createUser: username, pwd: password, roles });
  return { success: true };
});

ipcMain.handle('drop-user', async (_, connectionId: string, dbName: string, username: string) => {
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
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  await client.db(dbName).command({ createRole: roleName, privileges, roles });
  return { success: true };
});

ipcMain.handle('drop-role', async (_, connectionId: string, dbName: string, roleName: string) => {
  const client = clients.get(connectionId);
  if (!client) throw new Error('Not connected');
  await client.db(dbName).command({ dropRole: roleName });
  return { success: true };
});
