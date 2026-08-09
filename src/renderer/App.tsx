import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import ConnectionModal from './components/ConnectionModal';
import ConnectionManagerModal from './components/ConnectionManagerModal';
import UsersRolesModal from './components/UsersRolesModal';
import DialogModal from './components/DialogModal';
import SettingsModal from './components/SettingsModal';
import AboutModal from './components/AboutModal';
import ShortcutsModal from './components/ShortcutsModal';
import UpdateModal from './components/UpdateModal';
import { IconSettings, loadIconSettings, saveIconSettings } from './utils/iconColors';
import { PinnedCollection, loadPinned, savePinned, togglePinned } from './utils/pinnedCollections';
import { loadSession, saveSession } from './utils/session';
import {
  UpdateStatus, getCheckOnStartup, getSkippedVersion, setSkippedVersion, shouldShow,
} from './utils/updates';
import { showConfirm, showInput, showAlert } from './dialog';
import { showToast } from './toast';
import ToastHost from './components/ToastHost';
import { copiedMessage, pasteConfirm, type TransferItem } from './utils/transfer';
import { impactLine, type DropImpact } from './utils/destructive';
import { isTypingTarget } from './utils/dom';
import CommandPalette from './components/CommandPalette';
import { folderPathLabel } from './utils/connectionPath';
import type { PaletteItem } from './utils/palette';
import { pickFile, parseDocs, parseDatabaseFile, parseCsv } from './utils/fileImport';
import ImportCsvModal from './components/ImportCsvModal';
import { ImportedConnection } from './utils/uriImport';

const CONNECTION_ERROR_RE = /not connected|ECONNREFUSED|ETIMEDOUT|server selection timed out|topology (was destroyed|is closed)|MongoServerSelectionError|MongoNetworkError|MongoNotConnectedError|MongoTopologyClosedError/i;

interface Connection {
  id: string; name: string; uri: string; database?: string;
  /** Every write is refused, in the main process — see `readOnlyGuard.ts`. */
  readOnly?: boolean;
  folderId?: string; color?: string; order?: number;
  iconDbColor?: string; iconColColor?: string;
  tls?: boolean;
  tlsCertificateKeyFile?: string;
  tlsCertificateKeyFilePassword?: string;
  tlsCAFile?: string;
  tlsAllowInvalidCertificates?: boolean;
  tlsServername?: string;
  lastConnectedAt?: number;
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
  const [connectionHealth, setConnectionHealth] = useState<Record<string, 'reconnecting' | 'down'>>({});
  const [databases, setDatabases] = useState<Record<string, string[]>>({});
  const [expandedDbs, setExpandedDbs] = useState<Record<string, Set<string>>>({});
  const [collapsedConns, setCollapsedConns] = useState<Set<string>>(new Set());
  const [collections, setCollections] = useState<Record<string, Record<string, string[]>>>({});
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showConnModal, setShowConnModal] = useState(false);
  const [showConnManager, setShowConnManager] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [csvImport, setCsvImport] = useState<{
    connId: string; dbName: string; colName?: string; headers: string[]; rows: string[][]; fileName: string;
  } | null>(null);
  const [iconSettings, setIconSettings] = useState<IconSettings>(() => loadIconSettings());
  const [pinnedCollections, setPinnedCollections] = useState<PinnedCollection[]>(() => loadPinned());
  const [collectionClipboard, setCollectionClipboard] = useState<{ connectionId: string; db: string; col: string } | null>(null);
  const [databaseClipboard, setDatabaseClipboard] = useState<{ connectionId: string; db: string } | null>(null);
  const [editingConn, setEditingConn] = useState<Connection | null>(null);
  const [usersRoles, setUsersRoles] = useState<{ connId: string; db: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light' | 'hc' | 'solarized'>(
    () => (localStorage.getItem('theme') as any) || 'dark'
  );

  useEffect(() => {
    document.body.className = `theme-${theme}`;
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Central IPC call point: on a connection-loss-shaped error for a call whose
  // first arg is a connectionId, silently reconnects once and retries the call
  // before giving up — so a dropped server surfaces as its real error (or none
  // at all) instead of always "Not connected" on the next click.
  const clearHealth = (id: string) => setConnectionHealth(h => {
    if (!(id in h)) return h;
    const next = { ...h };
    delete next[id];
    return next;
  });

  const inv = useCallback(async (ch: string, ...a: any[]) => {
    const electron = (window as any).electron;
    const id = a[0];
    try {
      const result = await electron.invoke(ch, ...a);
      if (typeof id === 'string') clearHealth(id);
      return result;
    } catch (e: any) {
      if (typeof id !== 'string' || !CONNECTION_ERROR_RE.test(e?.message || '')) throw e;
      setConnectionHealth(h => ({ ...h, [id]: 'reconnecting' }));
      try {
        await electron.invoke('connect-db', id);
        clearHealth(id);
        return await electron.invoke(ch, ...a);
      } catch {
        setConnectionHealth(h => ({ ...h, [id]: 'down' }));
        throw e;
      }
    }
  }, []);

  const sessionRestoredRef = useRef(false);

  useEffect(() => {
    Promise.all([inv('get-connections'), inv('get-folders')]).then(async ([conns, fols]: [Connection[], Folder[]]) => {
      setConnections(conns);
      setFolders(fols);
      try {
        const session = loadSession();
        if (!session || session.tabs.length === 0) return;
        const validIds = new Set(conns.map(c => c.id));
        const neededIds = [...new Set(
          session.tabs.map(t => t.connectionId).filter((id): id is string => !!id && validIds.has(id))
        )];
        const connectedNow = new Set<string>();
        for (const id of neededIds) {
          try {
            const result = await inv('connect-db', id);
            setSelectedConnection(id);
            setConnectedIds(s => new Set([...s, id]));
            setDatabases(prev => ({ ...prev, [id]: result.databases }));
            setConnections(await inv('touch-connection', id));
            connectedNow.add(id);
          } catch { /* server unreachable at startup — skip its tabs silently */ }
        }
        const restoredTabs = session.tabs.filter(t => t.connectionId && connectedNow.has(t.connectionId));
        if (restoredTabs.length > 0) {
          setTabs(restoredTabs);
          setActiveTab(
            session.activeTab && restoredTabs.some(t => t.id === session.activeTab)
              ? session.activeTab
              : restoredTabs[restoredTabs.length - 1].id
          );
        }
      } finally {
        sessionRestoredRef.current = true;
      }
    });
  }, []);

  // Skipped until the startup restore above has run once, so it never overwrites
  // the saved session with the transient empty tabs/activeTab of the first render.
  useEffect(() => {
    if (!sessionRestoredRef.current) return;
    saveSession(tabs, activeTab);
  }, [tabs, activeTab]);

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
  const handleRefreshTree = useCallback(async (connIdArg?: string) => {
    const connId = connIdArg || selectedConnection;
    if (!connId || !connectedIds.has(connId)) return;
    setRefreshing(true);
    try {
      const dbs: string[] = await inv('list-databases', connId);
      const live = new Set(dbs);
      const expanded = [...(expandedDbs[connId] || new Set<string>())].filter(db => live.has(db));
      const loaded = await Promise.all(expanded.map(async db =>
        [db, await inv('get-collections', connId, db)] as [string, string[]]
      ));
      setDatabases(prev => ({ ...prev, [connId]: dbs }));
      setExpandedDbs(prev => ({ ...prev, [connId]: new Set(expanded) }));
      setCollections(prev => {
        const next: Record<string, string[]> = {};
        Object.entries(prev[connId] || {}).forEach(([db, cols]) => { if (live.has(db)) next[db] = cols; });
        loaded.forEach(([db, cols]) => { next[db] = cols; });
        return { ...prev, [connId]: next };
      });
    } catch (e: any) {
      showAlert({ title: 'Refresh failed', message: e?.message || String(e), danger: true });
    } finally {
      setRefreshing(false);
    }
  }, [selectedConnection, connectedIds, expandedDbs]);

  const handleRefreshDb = useCallback(async (connId: string, dbName: string) => {
    try {
      const cols = await inv('get-collections', connId, dbName);
      setCollections(prev => ({ ...prev, [connId]: { ...(prev[connId] || {}), [dbName]: cols } }));
      setExpandedDbs(prev => ({ ...prev, [connId]: new Set([...(prev[connId] || new Set<string>()), dbName]) }));
    } catch (e: any) {
      showAlert({ title: 'Refresh failed', message: e?.message || String(e), danger: true });
    }
  }, []);

  // Global keyboard shortcuts. Skipped while a modal is open (they own Escape) or
  // while typing in a field.
  const [showPalette, setShowPalette] = useState(false);
  const anyModalOpen = showConnModal || showConnManager || showSettings || showAbout || showShortcuts || !!usersRoles || !!updateStatus || !!csvImport;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); setShowShortcuts(true); return; }
      // Ctrl+P opens from anywhere, typing included: jumping somewhere else is
      // exactly what you do while your hands are in a field.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault(); setShowPalette(v => !v); return;
      }
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

  /**
   * Everything the palette can jump to. Collections come from what the tree has
   * already listed — filling the list would otherwise mean listing every
   * database of every connection on each keystroke.
   */
  const paletteItems = (): PaletteItem[] => {
    const items: PaletteItem[] = [];
    for (const conn of connections) {
      const path = folderPathLabel(conn.folderId, folders);
      const connected = connectedIds.has(conn.id);
      items.push({
        id: `conn:${conn.id}`,
        kind: 'connection',
        label: conn.name,
        sublabel: [path, connected ? 'connected' : 'not connected'].filter(Boolean).join(' · '),
        keywords: conn.uri,
        run: () => { if (connected) setSelectedConnection(conn.id); else handleConnect(conn.id); },
      });
      for (const db of databases[conn.id] || []) {
        items.push({
          id: `db:${conn.id}:${db}`,
          kind: 'database',
          label: db,
          sublabel: conn.name,
          run: () => { setSelectedConnection(conn.id); handleExpandDb(conn.id, db); },
        });
        for (const col of collections[conn.id]?.[db] || []) {
          items.push({
            id: `col:${conn.id}:${db}:${col}`,
            kind: 'collection',
            label: col,
            sublabel: `${conn.name} / ${db}`,
            run: () => handleSelectCollection(conn.id, db, col),
          });
        }
      }
    }
    const action = (id: string, label: string, keywords: string, run: () => void): PaletteItem =>
      ({ id: `action:${id}`, kind: 'action', label, keywords, run });
    items.push(
      action('new-connection', 'New connection', 'add server create', () => { setEditingConn(null); setShowConnModal(true); }),
      action('manage-connections', 'Manage connections', 'ctrl+m servers folders', () => setShowConnManager(true)),
      action('refresh', 'Refresh tree', 'f5 reload databases collections', () => handleRefreshTree()),
      action('settings', 'Appearance settings', 'ctrl+, icons colors theme', () => setShowSettings(true)),
      action('shortcuts', 'Keyboard shortcuts', 'f1 keys cheat sheet', () => setShowShortcuts(true)),
      action('about', 'About BoxyNoSql', 'version update', () => setShowAbout(true)),
      action('theme-dark', 'Theme: dark', 'appearance', () => setTheme('dark')),
      action('theme-light', 'Theme: light', 'appearance', () => setTheme('light')),
      action('theme-hc', 'Theme: high contrast', 'appearance accessibility', () => setTheme('hc')),
      action('theme-solarized', 'Theme: solarized', 'appearance', () => setTheme('solarized')),
    );
    return items;
  };

  // ── Connections ──────────────────────────────────────────────────────────────
  const handleSaveConnection = async (conn: Connection) => {
    const updated = await inv('save-connection', conn);
    setConnections(updated);
    setShowConnModal(false);
  };

  const handleDuplicateConnection = async (conn: Connection) => {
    const updated = await inv('save-connection', { ...conn, id: Date.now().toString(), name: `${conn.name} (copy)` });
    setConnections(updated);
  };

  const handleDeleteConnection = async (id: string) => {
    if (!await showConfirm({ message: 'Delete this connection?', danger: true, confirmText: 'Delete' })) return;
    const remaining = await inv('delete-connection', id);
    setConnections(remaining);
    if (selectedConnection === id) setSelectedConnection(null);
    setDatabases(prev => { const n = { ...prev }; delete n[id]; return n; });
    setCollections(prev => { const n = { ...prev }; delete n[id]; return n; });
    setExpandedDbs(prev => { const n = { ...prev }; delete n[id]; return n; });
    setConnectedIds(s => { const n = new Set(s); n.delete(id); return n; });
    setPinnedCollections(prev => {
      const next = prev.filter(p => p.connectionId !== id);
      savePinned(next);
      return next;
    });
  };

  // Clicking the connection that is already open collapses its tree instead of
  // doing nothing. Collapse is tracked separately from selection (per-connection,
  // independent of which one is "selected") because open tabs keep loading
  // through `selectedConnection` — clearing it would break them — and every
  // connected connection's tree stays visible/expanded on its own regardless of
  // which one is selected.
  const handleSelectConnection = (id: string) => {
    if (id === selectedConnection) {
      setCollapsedConns(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
      return;
    }
    setCollapsedConns(s => { if (!s.has(id)) return s; const n = new Set(s); n.delete(id); return n; });
    setSelectedConnection(id);
  };

  const handleConnect = async (connectionId: string) => {
    if (connectingIds.has(connectionId)) return;
    setConnectingIds(s => new Set([...s, connectionId]));
    try {
      const result = await inv('connect-db', connectionId);
      setSelectedConnection(connectionId);
      setConnectedIds(s => new Set([...s, connectionId]));
      setDatabases(prev => ({ ...prev, [connectionId]: result.databases }));
      setCollections(prev => ({ ...prev, [connectionId]: {} }));
      setExpandedDbs(prev => ({ ...prev, [connectionId]: new Set() }));
      setShowConnManager(false);
      setConnections(await inv('touch-connection', connectionId));
    } catch (e: any) {
      const conn = connections.find(c => c.id === connectionId);
      const { message, detail } = friendlyConnError(e?.message || String(e));
      showAlert({ title: `Can't connect to ${conn?.name || 'server'}`, message, detail, danger: true });
    }
    finally { setConnectingIds(s => { const n = new Set(s); n.delete(connectionId); return n; }); }
  };

  const handleQuickConnect = async () => {
    const id = Date.now().toString();
    const conn: Connection = { id, name: 'Local', uri: 'mongodb://localhost:27017', order: connections.length };
    const updated = await inv('save-connection', conn);
    setConnections(updated);
    await handleConnect(id);
  };

  const handleDisconnect = async (connectionId: string) => {
    await inv('disconnect-db', connectionId);
    setConnectedIds(s => { const n = new Set(s); n.delete(connectionId); return n; });
    setDatabases(prev => { const n = { ...prev }; delete n[connectionId]; return n; });
    setCollections(prev => { const n = { ...prev }; delete n[connectionId]; return n; });
    setExpandedDbs(prev => { const n = { ...prev }; delete n[connectionId]; return n; });
    if (selectedConnection === connectionId) setSelectedConnection(null);
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
    setDatabases(prev => ({ ...prev, [connId]: dbs }));
  };

  const handleExpandDb = async (connId: string, dbName: string) => {
    const newExpanded = new Set(expandedDbs[connId] || []);
    if (newExpanded.has(dbName)) {
      newExpanded.delete(dbName);
    } else {
      newExpanded.add(dbName);
      if (!(collections[connId] || {})[dbName]) {
        const cols = await inv('get-collections', connId, dbName);
        setCollections(prev => ({ ...prev, [connId]: { ...(prev[connId] || {}), [dbName]: cols } }));
      }
    }
    setExpandedDbs(prev => ({ ...prev, [connId]: newExpanded }));
  };

  const handleExpandAll = async (connId: string) => {
    const dbs = databases[connId] || [];
    const connCols = collections[connId] || {};
    const toLoad = dbs.filter(db => !connCols[db]);
    const loaded = await Promise.all(toLoad.map(async db => {
      const cols = await inv('get-collections', connId, db);
      return [db, cols] as [string, string[]];
    }));
    const newCols = { ...connCols };
    loaded.forEach(([db, cols]) => { newCols[db] = cols; });
    setCollections(prev => ({ ...prev, [connId]: newCols }));
    setExpandedDbs(prev => ({ ...prev, [connId]: new Set(dbs) }));
  };

  const handleCollapseAll = (connId: string) => setExpandedDbs(prev => ({ ...prev, [connId]: new Set() }));

  const handleCreateDatabase = async (connId: string) => {
    const dbName = await showInput({ title: 'Create Database', message: 'Database name:' });
    if (!dbName?.trim()) return;
    const colName = await showInput({ title: 'Create Database', message: 'Initial collection name (required):' });
    if (!colName?.trim()) return;
    try {
      await inv('create-collection', connId, dbName.trim(), colName.trim());
      await refreshDatabases(connId);
      setCollections(prev => ({ ...prev, [connId]: { ...(prev[connId] || {}), [dbName.trim()]: [colName.trim()] } }));
      setExpandedDbs(prev => ({ ...prev, [connId]: new Set([...(prev[connId] || []), dbName.trim()]) }));
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  /**
   * Counts for the typed confirmation. A failure here must not block the
   * dialog — the confirmation still works, it just cannot say how much is
   * about to go.
   */
  const dropImpact = async (connId: string, dbName: string, colName?: string): Promise<string> => {
    try {
      return impactLine(await inv('get-drop-impact', connId, dbName, colName) as DropImpact);
    } catch { return ''; }
  };

  const handleDropDatabase = async (connId: string, dbName: string) => {
    if (!await showConfirm({
      title: 'Drop Database',
      message: `Drop database "${dbName}"? ALL data will be permanently deleted.`,
      danger: true, confirmText: 'Drop',
      requireTyped: dbName,
      impact: await dropImpact(connId, dbName),
    })) return;
    try {
      await inv('drop-database', connId, dbName);
      await refreshDatabases(connId);
      setCollections(prev => { const forConn = { ...(prev[connId] || {}) }; delete forConn[dbName]; return { ...prev, [connId]: forConn }; });
      setExpandedDbs(prev => { const forConn = new Set(prev[connId] || []); forConn.delete(dbName); return { ...prev, [connId]: forConn }; });
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const handleClearDatabase = async (connId: string, dbName: string) => {
    if (!await showConfirm({
      title: 'Clear Database',
      message: `Delete ALL documents in every collection in "${dbName}"? The collections stay, their contents do not. This cannot be undone.`,
      danger: true, confirmText: 'Clear',
      requireTyped: dbName,
      impact: await dropImpact(connId, dbName),
    })) return;
    try {
      await inv('clear-database', connId, dbName);
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  // ── Collections ───────────────────────────────────────────────────────────────
  const refreshCollections = async (connId: string, dbName: string) => {
    const cols = await inv('get-collections', connId, dbName);
    setCollections(prev => ({ ...prev, [connId]: { ...(prev[connId] || {}), [dbName]: cols } }));
  };

  const handleCreateCollection = async (connId: string, dbName: string) => {
    const name = await showInput({ title: 'New Collection', message: `Collection name in "${dbName}":` });
    if (!name?.trim()) return;
    try {
      await inv('create-collection', connId, dbName, name.trim());
      await refreshCollections(connId, dbName);
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const handleDropCollection = async (connId: string, dbName: string, colName: string) => {
    if (!await showConfirm({
      title: 'Drop Collection',
      message: `Drop collection "${colName}"? This cannot be undone.`,
      danger: true, confirmText: 'Drop',
      requireTyped: colName,
      impact: await dropImpact(connId, dbName, colName),
    })) return;
    try {
      await inv('drop-collection', connId, dbName, colName);
      await refreshCollections(connId, dbName);
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const handleRenameCollection = async (connId: string, dbName: string, colName: string) => {
    const newName = await showInput({ title: 'Rename Collection', message: 'New name:', defaultValue: colName });
    if (!newName?.trim() || newName.trim() === colName) return;
    try {
      await inv('rename-collection', connId, dbName, colName, newName.trim());
      await refreshCollections(connId, dbName);
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const handleDuplicateCollection = async (connId: string, dbName: string, colName: string) => {
    const newName = await showInput({ title: 'Duplicate Collection', message: `Copy "${colName}" to:`, defaultValue: `${colName}_copy` });
    if (!newName?.trim() || newName.trim() === colName) return;
    try {
      await inv('duplicate-collection', connId, dbName, colName, newName.trim());
      await refreshCollections(connId, dbName);
    } catch (e: any) { showAlert({ title: 'Duplicate failed', message: e.message, danger: true }); }
  };

  const connName = (id: string) => connections.find(c => c.id === id)?.name || id;

  const handleCopyCollection = (connId: string, dbName: string, colName: string) => {
    setCollectionClipboard({ connectionId: connId, db: dbName, col: colName });
    showToast(copiedMessage({ kind: 'collection', connectionName: connName(connId), db: dbName, col: colName }));
  };

  // Cross-connection collection copy (data + indexes), the counterpart to
  // handleCopyCollection above. A name clash in the target db always prompts
  // for a rename — it never silently overwrites or merges into what's there.
  const handlePasteCollection = async (connId: string, dbName: string) => {
    if (!collectionClipboard) return;
    const { connectionId: sourceConnId, db: sourceDb, col: sourceCol } = collectionClipboard;
    const item: TransferItem = { kind: 'collection', connectionName: connName(sourceConnId), db: sourceDb, col: sourceCol };
    // Ask before writing anything, naming both ends: source and target can be
    // different servers, and that is exactly how the wrong one gets written to.
    if (!await showConfirm({
      ...pasteConfirm(item, { connectionName: connName(connId), db: dbName }),
      confirmText: 'Copy',
    })) return;
    let targetCol = sourceCol;
    try {
      const existingCols: string[] = await inv('get-collections', connId, dbName);
      if (existingCols.includes(targetCol)) {
        let attempt = `${sourceCol} - copy`;
        for (;;) {
          const name = await showInput({
            title: 'Collection already exists',
            message: `"${sourceCol}" already exists in "${dbName}". Enter a name for the copy:`,
            defaultValue: attempt,
          });
          if (!name?.trim()) return;
          const trimmed = name.trim();
          if (existingCols.includes(trimmed)) {
            attempt = trimmed;
            await showAlert(`"${trimmed}" also already exists — choose another name.`);
            continue;
          }
          targetCol = trimmed;
          break;
        }
      }
      const result = await inv('copy-collection', {
        sourceConnId, sourceDb, sourceCol,
        targetConnId: connId, targetDb: dbName, targetCol,
      });
      // Refresh the target connection, not just this database: the copy can
      // land on a connection whose tree is stale or not listed at all.
      await handleRefreshTree(connId);
      showAlert({
        title: 'Collection copied',
        message: `Copied ${result.insertedCount} document${result.insertedCount !== 1 ? 's' : ''} to "${dbName}.${targetCol}"` +
          (result.indexesCreated ? ` (${result.indexesCreated} index${result.indexesCreated !== 1 ? 'es' : ''} recreated).` : '.'),
      });
    } catch (e: any) {
      showAlert({ title: 'Copy failed', message: e.message, danger: true });
    }
  };

  const handleCopyDatabase = (connId: string, dbName: string) => {
    setDatabaseClipboard({ connectionId: connId, db: dbName });
    showToast(copiedMessage({ kind: 'database', connectionName: connName(connId), db: dbName }));
  };

  // Cross-connection database copy (every collection's data + indexes), the
  // counterpart to handleCopyDatabase above. Same rename-on-conflict flow as
  // handlePasteCollection — a name clash on the target connection always
  // prompts for a new name, never silently overwrites.
  const handlePasteDatabase = async (targetConnId: string) => {
    if (!databaseClipboard) return;
    const { connectionId: sourceConnId, db: sourceDb } = databaseClipboard;
    const item: TransferItem = { kind: 'database', connectionName: connName(sourceConnId), db: sourceDb };
    if (!await showConfirm({
      ...pasteConfirm(item, { connectionName: connName(targetConnId) }),
      confirmText: 'Copy',
    })) return;
    let targetDb = sourceDb;
    try {
      const existingDbs: string[] = await inv('list-databases', targetConnId);
      if (existingDbs.includes(targetDb)) {
        // Unlike a collection name, a database name can't contain a space or
        // any of /\."$*<>:| — so the rename default (and every retry) uses an
        // underscore, and a bad name is caught here instead of round-tripping
        // to a MongoServerError.
        let attempt = `${sourceDb}_copy`;
        for (;;) {
          const name = await showInput({
            title: 'Database already exists',
            message: `"${sourceDb}" already exists on this connection. Enter a name for the copy:`,
            defaultValue: attempt,
          });
          if (!name?.trim()) return;
          const trimmed = name.trim();
          if (/[/\\. "$*<>:|?]/.test(trimmed)) {
            attempt = trimmed;
            await showAlert('Database names can\'t contain spaces or any of / \\ . " $ * < > : | ?');
            continue;
          }
          if (existingDbs.includes(trimmed)) {
            attempt = trimmed;
            await showAlert(`"${trimmed}" also already exists — choose another name.`);
            continue;
          }
          targetDb = trimmed;
          break;
        }
      }
      const result = await inv('copy-database', { sourceConnId, sourceDb, targetConnId, targetDb });
      await handleRefreshTree(targetConnId);
      showAlert({
        title: 'Database copied',
        message: `Copied ${result.collectionsCount} collection${result.collectionsCount !== 1 ? 's' : ''} ` +
          `(${result.insertedCount} document${result.insertedCount !== 1 ? 's' : ''}) to "${targetDb}"` +
          (result.indexesCreated ? ` — ${result.indexesCreated} index${result.indexesCreated !== 1 ? 'es' : ''} recreated.` : '.'),
      });
    } catch (e: any) {
      showAlert({ title: 'Copy failed', message: e.message, danger: true });
    }
  };

  const handleTogglePin = (connId: string, dbName: string, colName: string) => {
    setPinnedCollections(prev => {
      const next = togglePinned(prev, connId, dbName, colName);
      savePinned(next);
      return next;
    });
  };

  const handleCopyCollectionName = async (_dbName: string, colName: string) => {
    try { await navigator.clipboard.writeText(colName); } catch {}
  };

  // ── Import ───────────────────────────────────────────────────────────────────
  const handleImportDocuments = async (connId: string, dbName: string, colName: string) => {
    const file = await pickFile('.json,.ndjson,.jsonl');
    if (!file) return;
    try {
      const text = await file.text();
      const docs = parseDocs(text);
      if (docs.length === 0) { alert('No documents found in file'); return; }
      const result = await inv('insert-documents', connId, dbName, colName, docs);
      alert(`Imported ${result.insertedCount} document${result.insertedCount !== 1 ? 's' : ''} into ${dbName}.${colName}`);
    } catch (e: any) { alert('Import failed: ' + e.message); }
  };

  const handleImportCollection = async (connId: string, dbName: string) => {
    const file = await pickFile('.json,.ndjson,.jsonl');
    if (!file) return;
    const suggested = file.name.replace(/\.(json|ndjson|jsonl)$/i, '');
    const colName = await showInput({ title: 'Import Collection', message: 'Collection name:', defaultValue: suggested });
    if (!colName?.trim()) return;
    try {
      const text = await file.text();
      const docs = parseDocs(text);
      const result = await inv('import-collection', connId, dbName, colName.trim(), docs);
      await refreshCollections(connId, dbName);
      alert(`Imported ${result.insertedCount} document${result.insertedCount !== 1 ? 's' : ''} into ${dbName}.${colName.trim()}`);
    } catch (e: any) { alert('Import failed: ' + e.message); }
  };

  const handleImportDatabase = async (connId: string) => {
    const file = await pickFile('.json');
    if (!file) return;
    const suggested = file.name.replace(/\.json$/i, '');
    const dbName = await showInput({ title: 'Import Database', message: 'Database name:', defaultValue: suggested });
    if (!dbName?.trim()) return;
    try {
      const text = await file.text();
      const collections = parseDatabaseFile(text);
      const result = await inv('import-database', connId, dbName.trim(), collections);
      await refreshDatabases(connId);
      alert(`Imported ${result.documents} documents across ${result.collections} collections into "${dbName.trim()}"`);
    } catch (e: any) { alert('Import failed: ' + e.message); }
  };

  const handleImportCsvDocuments = async (connId: string, dbName: string, colName: string) => {
    const file = await pickFile('.csv,.tsv');
    if (!file) return;
    try {
      const text = await file.text();
      const { headers, rows } = parseCsv(text);
      setCsvImport({ connId, dbName, colName, headers, rows, fileName: file.name });
    } catch (e: any) { showAlert({ title: 'Import failed', message: e.message, danger: true }); }
  };

  const handleImportCsvCollection = async (connId: string, dbName: string) => {
    const file = await pickFile('.csv,.tsv');
    if (!file) return;
    try {
      const text = await file.text();
      const { headers, rows } = parseCsv(text);
      setCsvImport({ connId, dbName, headers, rows, fileName: file.name });
    } catch (e: any) { showAlert({ title: 'Import failed', message: e.message, danger: true }); }
  };

  const handleCsvImportConfirm = async (docs: any[], colName: string) => {
    if (!csvImport) return;
    try {
      if (csvImport.colName) {
        const result = await inv('insert-documents', csvImport.connId, csvImport.dbName, colName, docs);
        showAlert({ title: 'Import complete', message: `Imported ${result.insertedCount} document${result.insertedCount !== 1 ? 's' : ''} into ${csvImport.dbName}.${colName}` });
      } else {
        const result = await inv('import-collection', csvImport.connId, csvImport.dbName, colName, docs);
        await refreshCollections(csvImport.connId, csvImport.dbName);
        showAlert({ title: 'Import complete', message: `Imported ${result.insertedCount} document${result.insertedCount !== 1 ? 's' : ''} into ${csvImport.dbName}.${colName}` });
      }
    } catch (e: any) {
      showAlert({ title: 'Import failed', message: e.message, danger: true });
    } finally {
      setCsvImport(null);
    }
  };

  const handleClearCollection = async (connId: string, dbName: string, colName: string) => {
    if (!await showConfirm({
      title: 'Clear Collection',
      message: `Delete ALL documents in "${colName}"? The collection stays, its contents do not. This cannot be undone.`,
      danger: true, confirmText: 'Clear',
      requireTyped: colName,
      impact: await dropImpact(connId, dbName, colName),
    })) return;
    try {
      await inv('clear-collection', connId, dbName, colName);
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const handleSelectCollection = (connId: string, dbName: string, collection: string) => {
    setSelectedCollection(collection);
    openTab('documents', collection, dbName, collection, connId);
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  const openTab = (type: Tab['type'], title: string, dbName?: string, collection?: string, connId?: string) => {
    const tabId = `${type}-${dbName}-${collection}-${Date.now()}`;
    const newTab: Tab = { id: tabId, type, title, database: dbName, collection, connectionId: connId ?? selectedConnection! };
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
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {csvImport && (
        <ImportCsvModal
          fileName={csvImport.fileName}
          headers={csvImport.headers}
          rows={csvImport.rows}
          defaultColName={csvImport.colName}
          onImport={handleCsvImportConfirm}
          onClose={() => setCsvImport(null)}
        />
      )}
      <DialogModal />
      <ToastHost />
      {showPalette && <CommandPalette items={paletteItems()} onClose={() => setShowPalette(false)} />}
      <Sidebar
        style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
        connections={connections}
        folders={folders}
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
        onOpenShortcuts={() => setShowShortcuts(true)}
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
        pinnedCollections={pinnedCollections}
        onTogglePin={handleTogglePin}
        collectionClipboard={collectionClipboard}
        onCopyCollection={handleCopyCollection}
        onPasteCollection={handlePasteCollection}
        databaseClipboard={databaseClipboard}
        onCopyDatabase={handleCopyDatabase}
        onPasteDatabase={handlePasteDatabase}
        connectionHealth={connectionHealth}
        onClearCollection={handleClearCollection}
        onDropDatabase={handleDropDatabase}
        onClearDatabase={handleClearDatabase}
        onManageUsers={(connId, db) => setUsersRoles({ connId, db })}
        onImportDocuments={handleImportDocuments}
        onImportCollection={handleImportCollection}
        onImportDatabase={handleImportDatabase}
        onImportCsvDocuments={handleImportCsvDocuments}
        onImportCsvCollection={handleImportCsvCollection}
        onThemeChange={setTheme}
      />
      <div className="sidebar-resize-handle" onMouseDown={onResizeStart} />
      <MainContent
        tabs={tabs}
        activeTab={activeTab}
        selectedConnection={selectedConnection}
        connections={connections}
        folders={folders}
        onOpenTab={openTab}
        onCloseTab={closeTab}
        onSwitchTab={setActiveTab}
        onChangeTabType={changeTabType}
        activeTabData={tabs.find(t => t.id === activeTab)}
        onAddConnection={() => { setEditingConn(null); setShowConnModal(true); }}
        onQuickConnect={handleQuickConnect}
        onOpenConnections={() => setShowConnManager(true)}
        onConnect={handleConnect}
        hasConnectedConnections={connectedIds.size > 0}
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
          onDuplicateConnection={handleDuplicateConnection}
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
      {usersRoles && (
        <UsersRolesModal
          connectionId={usersRoles.connId}
          database={usersRoles.db}
          onClose={() => setUsersRoles(null)}
        />
      )}
    </div>
  );
}

export default App;
