import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import ConnectionModal from './components/ConnectionModal';
import UsersRolesModal from './components/UsersRolesModal';
import DialogModal from './components/DialogModal';
import { showConfirm, showInput } from './dialog';

const inv = (ch: string, ...a: any[]) => (window as any).electron.invoke(ch, ...a);

interface Connection {
  id: string; name: string; uri: string; database?: string;
  folderId?: string; color?: string; order?: number;
}
interface Folder { id: string; name: string; color?: string; order?: number; parentId?: string; }
interface Tab {
  id: string;
  type: 'documents' | 'query' | 'aggregation' | 'indexes' | 'stats';
  title: string; collection?: string; database?: string; connectionId?: string;
}

const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 600;

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
  const [databases, setDatabases] = useState<string[]>([]);
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set());
  const [collections, setCollections] = useState<Record<string, string[]>>({});
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showConnModal, setShowConnModal] = useState(false);
  const [editingConn, setEditingConn] = useState<Connection | null>(null);
  const [usersRolesDb, setUsersRolesDb] = useState<string | null>(null);
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

  const handleSelectConnection = (id: string) => {
    setSelectedConnection(id);
  };

  const handleConnect = async (connectionId: string) => {
    try {
      const result = await inv('connect-db', connectionId);
      setSelectedConnection(connectionId);
      setConnectedIds(s => new Set([...s, connectionId]));
      setDatabases(result.databases);
      setCollections({});
      setExpandedDbs(new Set());
    } catch (e: any) { alert('Connection failed: ' + e.message); }
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

  const handleReorderConnections = async (conns: Connection[]) => {
    const updated = await inv('reorder-connections', conns);
    setConnections(updated);
  };

  const handleReorderFolders = async (fols: Folder[]) => {
    const updated = await inv('reorder-folders', fols);
    setFolders(updated);
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
      <DialogModal />
      <Sidebar
        style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
        connections={connections}
        folders={folders}
        selectedConnection={selectedConnection}
        connectedIds={connectedIds}
        databases={databases}
        expandedDbs={expandedDbs}
        collections={collections}
        selectedCollection={selectedCollection}
        theme={theme}
        onAddConnection={() => { setEditingConn(null); setShowConnModal(true); }}
        onEditConnection={c => { setEditingConn(c); setShowConnModal(true); }}
        onDeleteConnection={handleDeleteConnection}
        onSelectConnection={handleSelectConnection}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onExpandDb={handleExpandDb}
        onSelectCollection={handleSelectCollection}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        onCreateDatabase={handleCreateDatabase}
        onCreateCollection={handleCreateCollection}
        onDropCollection={handleDropCollection}
        onRenameCollection={handleRenameCollection}
        onClearCollection={handleClearCollection}
        onDropDatabase={handleDropDatabase}
        onClearDatabase={handleClearDatabase}
        onManageUsers={db => setUsersRolesDb(db)}
        onAddFolder={handleAddFolder}
        onSaveFolder={handleSaveFolder}
        onDeleteFolder={handleDeleteFolder}
        onMoveConnection={handleMoveConnection}
        onMoveFolder={handleMoveFolder}
        onReorderConnections={handleReorderConnections}
        onReorderFolders={handleReorderFolders}
        onThemeChange={setTheme}
        onSaveConnection={handleSaveConnection}
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
      {showConnModal && (
        <ConnectionModal
          connection={editingConn}
          onSave={handleSaveConnection}
          onClose={() => setShowConnModal(false)}
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
