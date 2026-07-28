import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import ConnectionModal from './components/ConnectionModal';
import ConnectionManagerModal from './components/ConnectionManagerModal';
import UsersRolesModal from './components/UsersRolesModal';
import DialogModal from './components/DialogModal';
import SettingsModal from './components/SettingsModal';
import AboutModal from './components/AboutModal';
import UpdateModal from './components/UpdateModal';
import { IconSettings, loadIconSettings, saveIconSettings } from './utils/iconColors';
import {
  UpdateStatus, getCheckOnStartup, getSkippedVersion, setSkippedVersion, shouldShow,
} from './utils/updates';
import { showConfirm, showInput, showAlert } from './dialog';
import { isTypingTarget } from './utils/dom';
import { pickFile, parseDocs, parseDatabaseFile } from './utils/fileImport';
import { ImportedConnection } from './utils/uriImport';

const inv = (ch: string, ...a: any[]) => (window as any).electron.invoke(ch, ...a);

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
interface Folder { id: string; name: string; color?: string; order?: number; parentId?: string; }
interface Tab {
  id: string;
  type: 'documents' | 'query' | 'aggregation' | 'indexes' | 'stats';
  title: string; collection?: string; database?: string; connectionId?: string;
}

const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 600;

function friendlyConnError(raw: string): { message: string; detail: string } {
  const detail = raw.replace(/^Error invoking remote method '[^']+':\s*/, '');
  const lc = detail.toLowerCase();
  let message: string;
  if (lc.includes('timed out') || lc.includes('etimedout') || lc.includes('serverselection')) {
    message = "Couldn't reach the server in time. Make sure MongoDB is running and that you're on the right network (Docker up? VPN connected? Internet on?).";
  } else if (lc.includes('econnrefused')) {
    message = 'Connection refused. Nothing is listening on that host/port — is MongoDB actually running there?';
  } else if (lc.includes('enotfound') || lc.includes('getaddrinfo')) {
    message = "Host not found. Double-check the hostname in the connection URI.";
  } else if (lc.includes('authentication failed') || lc.includes('auth') || lc.includes('not authorized')) {
    message = 'Authentication failed. Check the username and password.';
  } else if (lc.includes('self signed certificate') || lc.includes('self-signed certificate')) {
    message = "The server's TLS certificate is not signed by a CA your machine trusts. Point the connection at the CA file (Edit → TLS / certificates), or tick \"Accept invalid / self-signed certificates\" if you accept the risk.";
  } else if (lc.includes('certificate') || lc.includes('tls') || lc.includes('ssl')) {
    message = 'TLS handshake failed. Check the client certificate, its password, the CA file and the SNI name in the TLS section.';
  } else if (lc.includes('econnreset') || lc.includes('socket')) {
    message = 'The connection dropped. The server may be unreachable or behind a firewall/VPN.';
  } else {
    message = "Couldn't connect to the database.";
  }
  return { message, detail };
}

function App() {
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    () => Number(localStorage.getItem('sidebarWidth')) || 280
  );
  const startX = useRef(0);
  const startW = useRef(0);

  const currentWidth = useRef(sidebarWidth);
  currentWidth.current = sidebarWidth;

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    startW.current = currentWidth.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW.current + ev.clientX - startX.current));
      setSidebarWidth(w);
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('sidebarWidth', String(currentWidth.current));
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [connectingIds, setConnectingIds] = useState<Set<string>>(new Set());
  const [databases, setDatabases] = useState<string[]>([]);
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set());
  const [collapsedConns, setCollapsedConns] = useState<Set<string>>(new Set());
  const [collections, setCollections] = useState<Record<string, string[]>>({});
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showConnModal, setShowConnModal] = useState(false);
  const [showConnManager, setShowConnManager] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [iconSettings, setIconSettings] = useState<IconSettings>(() => loadIconSettings());
  const [editingConn, setEditingConn] = useState<Connection | null>(null);
  const [usersRolesDb, setUsersRolesDb] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light' | 'hc' | 'solarized'>(
    () => (localStorage.getItem('theme') as any) || 'dark'
  );

  useEffect(() => {
    document.body.className = `theme-${theme}`;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    Promise.all([inv('get-connections'), inv('get-folders')]).then(([conns, fols]) => {
      setConnections(conns);
      setFolders(fols);
    });
  }, []);

  // ── Updates ──────────────────────────────────────────────────────────────────
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    inv('get-app-info').then((i: any) => setAppVersion(i?.version ?? '')).catch(() => {});

    const off = (window as any).electron.on('update:status', (status: UpdateStatus) => {
      if (shouldShow(status, getSkippedVersion())) setUpdateStatus(status);
      else setUpdateStatus(null);
    });

    // Delayed so the first check never competes with loading the tree.
    let timer: number | undefined;
    if (getCheckOnStartup()) {
      timer = window.setTimeout(() => inv('update:check', false).catch(() => {}), 3000);
    }
    return () => { off?.(); if (timer) clearTimeout(timer); };
  }, []);

  const checkForUpdates = useCallback(() => {
    // A manual check reconsiders a version the user skipped earlier.
    setSkippedVersion(null);
    inv('update:check', true).catch(() => {});
  }, []);

  // ── Tree refresh ─────────────────────────────────────────────────────────────
  // Re-reads the tree from the server, so collections another client created or
  // dropped show up without reconnecting. Databases that vanished are evicted
  // from the caches; every expanded database is re-listed.
  // (Defined here rather than with the other database handlers below because the
  // shortcut effect depends on it.)
  const handleRefreshTree = useCallback(async () => {
    const connId = selectedConnection;
    if (!connId || !connectedIds.has(connId)) return;
    setRefreshing(true);
    try {
      const dbs: string[] = await inv('list-databases', connId);
      const live = new Set(dbs);
      const expanded = [...expandedDbs].filter(db => live.has(db));
      const loaded = await Promise.all(expanded.map(async db =>
        [db, await inv('get-collections', connId, db)] as [string, string[]]
      ));
      setDatabases(dbs);
      setExpandedDbs(new Set(expanded));
      setCollections(prev => {
        const next: Record<string, string[]> = {};
        Object.entries(prev).forEach(([db, cols]) => { if (live.has(db)) next[db] = cols; });
        loaded.forEach(([db, cols]) => { next[db] = cols; });
        return next;
      });
    } catch (e: any) {
      showAlert({ title: 'Refresh failed', message: e?.message || String(e), danger: true });
    } finally {
      setRefreshing(false);
    }
  }, [selectedConnection, connectedIds, expandedDbs]);

  const handleRefreshDb = useCallback(async (dbName: string) => {
    if (!selectedConnection) return;
    try {
      const cols = await inv('get-collections', selectedConnection, dbName);
      setCollections(prev => ({ ...prev, [dbName]: cols }));
      setExpandedDbs(prev => new Set([...prev, dbName]));
    } catch (e: any) {
      showAlert({ title: 'Refresh failed', message: e?.message || String(e), danger: true });
    }
  }, [selectedConnection]);

  // Global keyboard shortcuts. Skipped while a modal is open (they own Escape) or
  // while typing in a field.
  const anyModalOpen = showConnModal || showConnManager || showSettings || showAbout || !!usersRolesDb || !!updateStatus;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (anyModalOpen) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'F5' || (mod && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault(); handleRefreshTree(); return;
      }
      if (!mod) return;
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); setShowConnManager(true); }
      else if (e.key === ',') { e.preventDefault(); setShowSettings(true); }
      else if (e.key === 'w' || e.key === 'W') { if (activeTab) { e.preventDefault(); closeTab(activeTab); } }
      else if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (tabs[idx]) { e.preventDefault(); setActiveTab(tabs[idx].id); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anyModalOpen, activeTab, tabs, handleRefreshTree]);

  // ── Connections ──────────────────────────────────────────────────────────────
  const handleSaveConnection = async (conn: Connection) => {
    const updated = await inv('save-connection', conn);
    setConnections(updated);
    setShowConnModal(false);
  };

  const handleDeleteConnection = async (id: string) => {
    if (!await showConfirm({ message: 'Delete this connection?', danger: true, confirmText: 'Delete' })) return;
    const remaining = await inv('delete-connection', id);
    setConnections(remaining);
    if (selectedConnection === id) {
      setSelectedConnection(null); setDatabases([]); setCollections({});
    }
    setConnectedIds(s => { const n = new Set(s); n.delete(id); return n; });
  };

  // Clicking the connection that is already open collapses its tree instead of
  // doing nothing. Collapse is tracked separately from selection because open
  // tabs keep loading through `selectedConnection` — clearing it would break them.
  const handleSelectConnection = async (id: string) => {
    if (id === selectedConnection) {
      setCollapsedConns(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
      return;
    }
    setCollapsedConns(s => { if (!s.has(id)) return s; const n = new Set(s); n.delete(id); return n; });
    setSelectedConnection(id);
    if (connectedIds.has(id)) {
      setCollections({});
      setExpandedDbs(new Set());
      try { setDatabases(await inv('list-databases', id)); }
      catch { setDatabases([]); }
    }
  };

  const handleConnect = async (connectionId: string) => {
    if (connectingIds.has(connectionId)) return;
    setConnectingIds(s => new Set([...s, connectionId]));
    try {
      const result = await inv('connect-db', connectionId);
      setSelectedConnection(connectionId);
      setConnectedIds(s => new Set([...s, connectionId]));
      setDatabases(result.databases);
      setCollections({});
      setExpandedDbs(new Set());
      setShowConnManager(false);
    } catch (e: any) {
      const conn = connections.find(c => c.id === connectionId);
      const { message, detail } = friendlyConnError(e?.message || String(e));
      showAlert({ title: `Can't connect to ${conn?.name || 'server'}`, message, detail, danger: true });
    }
    finally { setConnectingIds(s => { const n = new Set(s); n.delete(connectionId); return n; }); }
  };

  const handleDisconnect = async (connectionId: string) => {
    await inv('disconnect-db', connectionId);
    setConnectedIds(s => { const n = new Set(s); n.delete(connectionId); return n; });
    if (selectedConnection === connectionId) {
      setSelectedConnection(null); setDatabases([]); setCollections({}); setExpandedDbs(new Set());
    }
    setTabs(prev => {
      const remaining = prev.filter(t => t.connectionId !== connectionId);
      setActiveTab(a => remaining.some(t => t.id === a) ? a : (remaining.length > 0 ? remaining[remaining.length - 1].id : null));
      return remaining;
    });
  };

  // ── Folders ──────────────────────────────────────────────────────────────────
  const handleAddFolder = async (parentId?: string) => {
    const name = await showInput({ message: 'Folder name:', placeholder: 'New Folder' });
    if (!name?.trim()) return;
    const folder: Folder = { id: Date.now().toString(), name: name.trim(), order: folders.length, parentId };
    const updated = await inv('save-folder', folder);
    setFolders(updated);
  };

  const handleMoveFolder = async (folderId: string, newParentId: string | undefined) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    const updated = await inv('save-folder', { ...folder, parentId: newParentId });
    setFolders(updated);
  };

  const handleSaveFolder = async (folder: Folder) => {
    const updated = await inv('save-folder', folder);
    setFolders(updated);
  };

  const handleDeleteFolder = async (id: string) => {
    if (!await showConfirm({ message: 'Delete folder? Connections will be moved to root.' })) return;
    const result = await inv('delete-folder', id);
    setFolders(result.folders);
    setConnections(result.connections);
  };

  const handleMoveConnection = async (connId: string, folderId: string | undefined) => {
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;
    const updated = await inv('save-connection', { ...conn, folderId });
    setConnections(updated);
  };

  const handleReorderFolders = async (fols: Folder[]) => {
    const updated = await inv('reorder-folders', fols);
    setFolders(updated);
  };

  // Bulk import from a Studio 3T .uri export: recreates the `3t.group` folder
  // path (reusing folders that already exist) before saving each connection.
  const handleImportConnections = async (items: ImportedConnection[]) => {
    if (items.length === 0) return;
    let nextFolders = folders;
    let nextConnections = connections;
    const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const resolveFolderPath = async (path: string[]): Promise<string | undefined> => {
      let parentId: string | undefined;
      for (const name of path) {
        const existing = nextFolders.find(
          f => f.parentId === parentId && f.name.toLowerCase() === name.toLowerCase()
        );
        if (existing) { parentId = existing.id; continue; }
        const folder: Folder = {
          id: newId(),
          name,
          order: nextFolders.filter(f => f.parentId === parentId).length,
          parentId,
        };
        nextFolders = await inv('save-folder', folder);
        parentId = folder.id;
      }
      return parentId;
    };

    let failed = 0;
    for (const item of items) {
      try {
        const folderId = await resolveFolderPath(item.folderPath);
        const conn: Connection = {
          id: newId(),
          name: item.name,
          uri: item.uri,
          database: item.database,
          folderId,
          color: item.color,
          order: nextConnections.filter(c => c.folderId === folderId).length,
          tls: item.tls,
          tlsCertificateKeyFile: item.tlsCertificateKeyFile,
          tlsServername: item.tlsServername,
        };
        nextConnections = await inv('save-connection', conn);
      } catch { failed++; }
    }

    setFolders(nextFolders);
    setConnections(nextConnections);

    const ok = items.length - failed;
    await showAlert({
      title: 'Import connections',
      message: `Imported ${ok} connection${ok !== 1 ? 's' : ''}.`,
      detail: failed > 0 ? `${failed} could not be saved.` : undefined,
    });
  };

  // ── Databases ────────────────────────────────────────────────────────────────
  const refreshDatabases = async (connId: string) => {
    const dbs = await inv('list-databases', connId);
    setDatabases(dbs);
  };

  const handleExpandDb = async (dbName: string) => {
    const newExpanded = new Set(expandedDbs);
    if (newExpanded.has(dbName)) {
      newExpanded.delete(dbName);
    } else {
      newExpanded.add(dbName);
      if (!collections[dbName]) {
        const cols = await inv('get-collections', selectedConnection, dbName);
        setCollections(prev => ({ ...prev, [dbName]: cols }));
      }
    }
    setExpandedDbs(newExpanded);
  };

  const handleExpandAll = async () => {
    const toLoad = databases.filter(db => !collections[db]);
    const loaded = await Promise.all(toLoad.map(async db => {
      const cols = await inv('get-collections', selectedConnection, db);
      return [db, cols] as [string, string[]];
    }));
    const newCols = { ...collections };
    loaded.forEach(([db, cols]) => { newCols[db] = cols; });
    setCollections(newCols);
    setExpandedDbs(new Set(databases));
  };

  const handleCollapseAll = () => setExpandedDbs(new Set());

  const handleCreateDatabase = async () => {
    const dbName = await showInput({ title: 'Create Database', message: 'Database name:' });
    if (!dbName?.trim()) return;
    const colName = await showInput({ title: 'Create Database', message: 'Initial collection name (required):' });
    if (!colName?.trim()) return;
    try {
      await inv('create-collection', selectedConnection, dbName.trim(), colName.trim());
      await refreshDatabases(selectedConnection!);
      setCollections(prev => ({ ...prev, [dbName.trim()]: [colName.trim()] }));
      setExpandedDbs(prev => new Set([...prev, dbName.trim()]));
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const handleDropDatabase = async (dbName: string) => {
    if (!await showConfirm({ title: 'Drop Database', message: `Drop database "${dbName}"? ALL data will be permanently deleted.`, danger: true, confirmText: 'Drop' })) return;
    try {
      await inv('drop-database', selectedConnection, dbName);
      await refreshDatabases(selectedConnection!);
      setCollections(prev => { const n = { ...prev }; delete n[dbName]; return n; });
      setExpandedDbs(prev => { const n = new Set(prev); n.delete(dbName); return n; });
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const handleClearDatabase = async (dbName: string) => {
    if (!await showConfirm({ title: 'Clear Database', message: `Delete ALL documents in every collection in "${dbName}"? This cannot be undone.`, danger: true, confirmText: 'Clear' })) return;
    try {
      await inv('clear-database', selectedConnection, dbName);
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  // ── Collections ───────────────────────────────────────────────────────────────
  const refreshCollections = async (dbName: string) => {
    const cols = await inv('get-collections', selectedConnection, dbName);
    setCollections(prev => ({ ...prev, [dbName]: cols }));
  };

  const handleCreateCollection = async (dbName: string) => {
    const name = await showInput({ title: 'New Collection', message: `Collection name in "${dbName}":` });
    if (!name?.trim()) return;
    try {
      await inv('create-collection', selectedConnection, dbName, name.trim());
      await refreshCollections(dbName);
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const handleDropCollection = async (dbName: string, colName: string) => {
    if (!await showConfirm({ title: 'Drop Collection', message: `Drop collection "${colName}"? This cannot be undone.`, danger: true, confirmText: 'Drop' })) return;
    try {
      await inv('drop-collection', selectedConnection, dbName, colName);
      await refreshCollections(dbName);
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const handleRenameCollection = async (dbName: string, colName: string) => {
    const newName = await showInput({ title: 'Rename Collection', message: 'New name:', defaultValue: colName });
    if (!newName?.trim() || newName.trim() === colName) return;
    try {
      await inv('rename-collection', selectedConnection, dbName, colName, newName.trim());
      await refreshCollections(dbName);
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const handleDuplicateCollection = async (dbName: string, colName: string) => {
    const newName = await showInput({ title: 'Duplicate Collection', message: `Copy "${colName}" to:`, defaultValue: `${colName}_copy` });
    if (!newName?.trim() || newName.trim() === colName) return;
    try {
      await inv('duplicate-collection', selectedConnection, dbName, colName, newName.trim());
      await refreshCollections(dbName);
    } catch (e: any) { showAlert({ title: 'Duplicate failed', message: e.message, danger: true }); }
  };

  const handleCopyCollectionName = async (_dbName: string, colName: string) => {
    try { await navigator.clipboard.writeText(colName); } catch {}
  };

  // ── Import ───────────────────────────────────────────────────────────────────
  const handleImportDocuments = async (dbName: string, colName: string) => {
    if (!selectedConnection) return;
    const file = await pickFile('.json,.ndjson,.jsonl');
    if (!file) return;
    try {
      const text = await file.text();
      const docs = parseDocs(text);
      if (docs.length === 0) { alert('No documents found in file'); return; }
      const result = await inv('insert-documents', selectedConnection, dbName, colName, docs);
      alert(`Imported ${result.insertedCount} document${result.insertedCount !== 1 ? 's' : ''} into ${dbName}.${colName}`);
    } catch (e: any) { alert('Import failed: ' + e.message); }
  };

  const handleImportCollection = async (dbName: string) => {
    if (!selectedConnection) return;
    const file = await pickFile('.json,.ndjson,.jsonl');
    if (!file) return;
    const suggested = file.name.replace(/\.(json|ndjson|jsonl)$/i, '');
    const colName = await showInput({ title: 'Import Collection', message: 'Collection name:', defaultValue: suggested });
    if (!colName?.trim()) return;
    try {
      const text = await file.text();
      const docs = parseDocs(text);
      const result = await inv('import-collection', selectedConnection, dbName, colName.trim(), docs);
      await refreshCollections(dbName);
      alert(`Imported ${result.insertedCount} document${result.insertedCount !== 1 ? 's' : ''} into ${dbName}.${colName.trim()}`);
    } catch (e: any) { alert('Import failed: ' + e.message); }
  };

  const handleImportDatabase = async () => {
    if (!selectedConnection) return;
    const file = await pickFile('.json');
    if (!file) return;
    const suggested = file.name.replace(/\.json$/i, '');
    const dbName = await showInput({ title: 'Import Database', message: 'Database name:', defaultValue: suggested });
    if (!dbName?.trim()) return;
    try {
      const text = await file.text();
      const collections = parseDatabaseFile(text);
      const result = await inv('import-database', selectedConnection, dbName.trim(), collections);
      await refreshDatabases(selectedConnection);
      alert(`Imported ${result.documents} documents across ${result.collections} collections into "${dbName.trim()}"`);
    } catch (e: any) { alert('Import failed: ' + e.message); }
  };

  const handleClearCollection = async (dbName: string, colName: string) => {
    if (!await showConfirm({ title: 'Clear Collection', message: `Delete ALL documents in "${colName}"? This cannot be undone.`, danger: true, confirmText: 'Clear' })) return;
    try {
      await inv('clear-collection', selectedConnection, dbName, colName);
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const handleSelectCollection = (dbName: string, collection: string) => {
    setSelectedCollection(collection);
    openTab('documents', collection, dbName, collection);
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  const openTab = (type: Tab['type'], title: string, dbName?: string, collection?: string) => {
    const tabId = `${type}-${dbName}-${collection}-${Date.now()}`;
    const newTab: Tab = { id: tabId, type, title, database: dbName, collection, connectionId: selectedConnection! };
    setTabs(prev => [...prev, newTab]);
    setActiveTab(tabId);
  };

  const changeTabType = (tabId: string, type: Tab['type']) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, type } : t));
  };

  const closeTab = (tabId: string) => {
    setTabs(prev => {
      const n = prev.filter(t => t.id !== tabId);
      if (activeTab === tabId) setActiveTab(n.length > 0 ? n[n.length - 1].id : null);
      return n;
    });
  };

  return (
    <div className="app-container">
      {updateStatus && (
        <UpdateModal
          status={updateStatus}
          currentVersion={appVersion}
          onDownload={() => inv('update:download')}
          onInstall={() => inv('update:install')}
          onOpenDownloadPage={() => { inv('update:open-download'); setUpdateStatus(null); }}
          onSkip={v => { setSkippedVersion(v); setUpdateStatus(null); }}
          onClose={() => setUpdateStatus(null)}
        />
      )}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} onCheckUpdates={checkForUpdates} />}
      <DialogModal />
      <Sidebar
        style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
        connections={connections}
        selectedConnection={selectedConnection}
        collapsedConns={collapsedConns}
        connectedIds={connectedIds}
        connectingIds={connectingIds}
        databases={databases}
        expandedDbs={expandedDbs}
        collections={collections}
        selectedCollection={selectedCollection}
        theme={theme}
        iconSettings={iconSettings}
        onOpenManager={() => setShowConnManager(true)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAbout={() => setShowAbout(true)}
        onSelectConnection={handleSelectConnection}
        onDisconnect={handleDisconnect}
        onExpandDb={handleExpandDb}
        onSelectCollection={handleSelectCollection}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        onRefreshTree={handleRefreshTree}
        onRefreshDb={handleRefreshDb}
        refreshing={refreshing}
        onCreateDatabase={handleCreateDatabase}
        onCreateCollection={handleCreateCollection}
        onDropCollection={handleDropCollection}
        onRenameCollection={handleRenameCollection}
        onDuplicateCollection={handleDuplicateCollection}
        onCopyCollectionName={handleCopyCollectionName}
        onClearCollection={handleClearCollection}
        onDropDatabase={handleDropDatabase}
        onClearDatabase={handleClearDatabase}
        onManageUsers={db => setUsersRolesDb(db)}
        onImportDocuments={handleImportDocuments}
        onImportCollection={handleImportCollection}
        onImportDatabase={handleImportDatabase}
        onThemeChange={setTheme}
      />
      <div className="sidebar-resize-handle" onMouseDown={onResizeStart} />
      <MainContent
        tabs={tabs}
        activeTab={activeTab}
        selectedConnection={selectedConnection}
        connections={connections}
        onOpenTab={openTab}
        onCloseTab={closeTab}
        onSwitchTab={setActiveTab}
        onChangeTabType={changeTabType}
        activeTabData={tabs.find(t => t.id === activeTab)}
      />
      {showConnManager && (
        <ConnectionManagerModal
          connections={connections}
          folders={folders}
          connectedIds={connectedIds}
          connectingIds={connectingIds}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onAddConnection={() => { setEditingConn(null); setShowConnModal(true); }}
          onEditConnection={c => { setEditingConn(c); setShowConnModal(true); }}
          onDeleteConnection={handleDeleteConnection}
          onSaveConnection={handleSaveConnection}
          onAddFolder={handleAddFolder}
          onSaveFolder={handleSaveFolder}
          onDeleteFolder={handleDeleteFolder}
          onMoveConnection={handleMoveConnection}
          onMoveFolder={handleMoveFolder}
          onReorderFolders={handleReorderFolders}
          onImportConnections={handleImportConnections}
          disableEsc={showConnModal}
          onClose={() => setShowConnManager(false)}
        />
      )}
      {showConnModal && (
        <ConnectionModal
          connection={editingConn}
          onSave={handleSaveConnection}
          onClose={() => setShowConnModal(false)}
        />
      )}
      {showSettings && (
        <SettingsModal
          settings={iconSettings}
          onChange={s => { setIconSettings(s); saveIconSettings(s); }}
          onClose={() => setShowSettings(false)}
        />
      )}
      {usersRolesDb && selectedConnection && (
        <UsersRolesModal
          connectionId={selectedConnection}
          database={usersRolesDb}
          onClose={() => setUsersRolesDb(null)}
        />
      )}
    </div>
  );
}

export default App;
