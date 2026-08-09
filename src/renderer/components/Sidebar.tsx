import { useState } from 'react';
import ContextMenu, { ContextMenuEntry } from './ContextMenu';
import logoUrl from '../../assets/img/logo.svg?url';
import { IconSettings, resolveIconColor, DEFAULT_CONNECTION_COLOR } from '../utils/iconColors';
import Icon from './Icon';
import { PinnedCollection, isPinned } from '../utils/pinnedCollections';
import { folderPathLabel, serverLabel, nodeTooltip, type Folder } from '../utils/connectionPath';

interface Connection {
  id: string; name: string; uri: string; database?: string;
  /** Every write is refused, in the main process — see `readOnlyGuard.ts`. */
  readOnly?: boolean;
  folderId?: string; color?: string; order?: number;
  iconDbColor?: string; iconColColor?: string;
}

interface SidebarProps {
  connections: Connection[];
  /** Only used to spell out where a connection lives, in the label and the tooltips. */
  folders: Folder[];
  selectedConnection: string | null;
  /** Connected connections whose database tree the user folded away. Governs
   *  show/hide independently of `selectedConnection`, so any number of
   *  connections can show their expanded tree at once. */
  collapsedConns: Set<string>;
  connectedIds: Set<string>;
  connectingIds: Set<string>;
  databases: Record<string, string[]>;
  expandedDbs: Record<string, Set<string>>;
  collections: Record<string, Record<string, string[]>>;
  selectedCollection: string | null;
  theme: 'dark' | 'light' | 'hc' | 'solarized';
  iconSettings: IconSettings;
  onOpenManager: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onOpenShortcuts: () => void;
  onSelectConnection: (id: string) => void;
  onDisconnect: (id: string) => void;
  onExpandDb: (connId: string, db: string) => void;
  onSelectCollection: (connId: string, db: string, col: string) => void;
  onExpandAll: (connId: string) => void;
  onCollapseAll: (connId: string) => void;
  /** Re-reads databases + the collections of every expanded database. */
  onRefreshTree: (connId?: string) => void;
  onRefreshDb: (connId: string, db: string) => void;
  refreshing: boolean;
  onCreateDatabase: (connId: string) => void;
  onCreateCollection: (connId: string, db: string) => void;
  onDropCollection: (connId: string, db: string, col: string) => void;
  onRenameCollection: (connId: string, db: string, col: string) => void;
  onDuplicateCollection: (connId: string, db: string, col: string) => void;
  onCopyCollectionName: (db: string, col: string) => void;
  onClearCollection: (connId: string, db: string, col: string) => void;
  onDropDatabase: (connId: string, db: string) => void;
  onClearDatabase: (connId: string, db: string) => void;
  onManageUsers: (connId: string, db: string) => void;
  onImportDocuments: (connId: string, db: string, col: string) => void;
  onImportCollection: (connId: string, db: string) => void;
  onImportDatabase: (connId: string) => void;
  onImportCsvDocuments: (connId: string, db: string, col: string) => void;
  onImportCsvCollection: (connId: string, db: string) => void;
  pinnedCollections: PinnedCollection[];
  onTogglePin: (connId: string, db: string, col: string) => void;
  collectionClipboard: { connectionId: string; db: string; col: string } | null;
  onCopyCollection: (connId: string, db: string, col: string) => void;
  onPasteCollection: (connId: string, db: string) => void;
  databaseClipboard: { connectionId: string; db: string } | null;
  onCopyDatabase: (connId: string, db: string) => void;
  onPasteDatabase: (connId: string) => void;
  connectionHealth: Record<string, 'reconnecting' | 'down'>;
  onThemeChange: (t: 'dark' | 'light' | 'hc' | 'solarized') => void;
  style?: React.CSSProperties;
}

function DbIcon({ color }: { color?: string }) {
  return <Icon name="database" size={14} color={color} />;
}

function ColIcon({ color }: { color?: string }) {
  return <Icon name="collection" size={13} color={color} />;
}

export default function Sidebar(props: SidebarProps) {
  const {
    connections, folders, selectedConnection, collapsedConns, connectedIds, connectingIds,
    databases, expandedDbs, collections, selectedCollection,
    theme, iconSettings, onOpenManager, onOpenSettings, onOpenAbout, onOpenShortcuts,
    onSelectConnection, onDisconnect, onExpandDb, onSelectCollection,
    onExpandAll, onCollapseAll, onRefreshTree, onRefreshDb, refreshing,
    onCreateDatabase, onCreateCollection, onDropCollection,
    onRenameCollection, onDuplicateCollection, onCopyCollectionName,
    onClearCollection, onDropDatabase, onClearDatabase,
    onManageUsers, onImportDocuments, onImportCollection, onImportDatabase,
    onImportCsvDocuments, onImportCsvCollection, pinnedCollections, onTogglePin,
    collectionClipboard, onCopyCollection, onPasteCollection,
    databaseClipboard, onCopyDatabase, onPasteDatabase,
    connectionHealth, onThemeChange, style,
  } = props;

  const [dbSearch, setDbSearch] = useState<Record<string, string>>({});
  const [dbCtxMenu, setDbCtxMenu] = useState<{ x: number; y: number; connId: string; db: string } | null>(null);
  const [colCtxMenu, setColCtxMenu] = useState<{ x: number; y: number; connId: string; db: string; col: string } | null>(null);

  const connectedConns = connections.filter(c => connectedIds.has(c.id) || connectingIds.has(c.id));

  const renderDbTree = (conn: Connection, color = 'var(--success)') => {
    const connId = conn.id;
    // Two connections can hold a database of the same name, and the tree shows
    // that name alone — the tooltip is what says which server it belongs to.
    const where = { connection: conn.name, folder: folderPathLabel(conn.folderId, folders), server: serverLabel(conn.uri) };
    const dbIconColor = resolveIconColor('db', conn, iconSettings);
    const colIconColor = resolveIconColor('col', conn, iconSettings);
    const search = (dbSearch[connId] || '').toLowerCase();
    const connDatabases = databases[connId] || [];
    const connExpandedDbs = expandedDbs[connId] || new Set<string>();
    const connCollections = collections[connId] || {};
    // A search term matches either a database name or a collection name. A db
    // that only matched through one of its collections is shown with just
    // those collections (auto-expanded, without touching the real expand/
    // collapse state) — a db matched by its own name still shows everything.
    const dbNameMatches = (db: string) => !search || db.toLowerCase().includes(search);
    const matchingCols = (db: string) => (connCollections[db] || []).filter(c => c.toLowerCase().includes(search));
    const filteredDbs = search
      ? connDatabases.filter(db => dbNameMatches(db) || matchingCols(db).length > 0)
      : connDatabases;
    return (
      <div className="conn-db-tree" style={{ borderLeftColor: color }}>
        <div className="db-tree-toolbar">
          <button onClick={() => onRefreshTree(connId)} disabled={refreshing}
            title="Refresh databases and collections (F5)">
            <Icon name="refresh" size={13} className={refreshing ? 'spin' : undefined} /> Refresh
          </button>
          <button onClick={() => onExpandAll(connId)} title="Expand all"><Icon name="expandAll" size={13} /> All</button>
          <button onClick={() => onCollapseAll(connId)} title="Collapse all"><Icon name="collapseAll" size={13} /> Collapse</button>
          <button onClick={() => onImportDatabase(connId)} title="Import database from JSON" style={{ marginLeft: 'auto' }}><Icon name="import" size={13} /> Import</button>
          <button onClick={() => onCreateDatabase(connId)} title="Create database"><Icon name="database" size={13} /> + DB</button>
        </div>
        <div className="db-search-wrap">
          <input
            className="db-search-input"
            placeholder="Search databases…"
            value={dbSearch[connId] || ''}
            onChange={e => setDbSearch(prev => ({ ...prev, [connId]: e.target.value }))}
          />
          {dbSearch[connId] && (
            <button className="icon-btn db-search-clear" onClick={() => setDbSearch(prev => ({ ...prev, [connId]: '' }))}><Icon name="close" size={12} /></button>
          )}
        </div>
        {pinnedCollections.some(p => p.connectionId === connId) && (
          <div className="pinned-section">
            {pinnedCollections.filter(p => p.connectionId === connId).map(p => (
              <div
                key={`${p.db}.${p.col}`}
                tabIndex={0}
                className={`collection-item pinned-item ${selectedCollection === p.col ? 'active' : ''}`}
                onClick={() => onSelectCollection(connId, p.db, p.col)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSelectCollection(connId, p.db, p.col); } }}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setColCtxMenu({ x: e.clientX, y: e.clientY, connId, db: p.db, col: p.col }); }}
                title={nodeTooltip({ ...where, database: p.db, collection: p.col })}
              >
                <Icon name="pin" size={12} color={colIconColor} />
                <span className="label">{p.db}.{p.col}</span>
                <div className="col-actions" onClick={e => e.stopPropagation()}>
                  <button title="Unpin" onClick={() => onTogglePin(connId, p.db, p.col)}><Icon name="close" size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
        {filteredDbs.map(db => {
          const forcedOpen = !!search && !dbNameMatches(db) && matchingCols(db).length > 0;
          const isOpen = connExpandedDbs.has(db) || forcedOpen;
          const colsToShow = search && !dbNameMatches(db) ? matchingCols(db) : (connCollections[db] || []);
          return (
          <div key={db}>
            <div
              tabIndex={0}
              className="tree-node-header"
              onClick={() => onExpandDb(connId, db)}
              onKeyDown={e => {
                const mod = e.ctrlKey || e.metaKey;
                if (e.key === 'Enter') { e.preventDefault(); onExpandDb(connId, db); }
                else if (mod && e.shiftKey && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); onPasteCollection(connId, db); }
                else if (mod && !e.shiftKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); onCopyDatabase(connId, db); }
              }}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setDbCtxMenu({ x: e.clientX, y: e.clientY, connId, db }); }}
              title={nodeTooltip({ ...where, database: db })}
            >
              <span className="tree-chevron"><Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} /></span>
              <DbIcon color={dbIconColor} />
              <span className="label">{db}</span>
              <div className="tree-node-actions" onClick={e => e.stopPropagation()}>
                <button title="New collection" onClick={() => onCreateCollection(connId, db)}><Icon name="plus" size={13} /></button>
                <button title="Manage users" onClick={() => onManageUsers(connId, db)}><Icon name="user" size={13} /></button>
                <button title="Drop database" onClick={() => onDropDatabase(connId, db)}><Icon name="trash" size={13} /></button>
              </div>
            </div>
            {isOpen && connCollections[db] && (
              <div className="tree-node-children">
                {[...colsToShow].sort().map(col => (
                  <div
                    key={col}
                    tabIndex={0}
                    className={`collection-item ${selectedCollection === col ? 'active' : ''}`}
                    onClick={() => onSelectCollection(connId, db, col)}
                    onKeyDown={e => {
                      const mod = e.ctrlKey || e.metaKey;
                      if (e.key === 'Enter') { e.preventDefault(); onSelectCollection(connId, db, col); }
                      else if (e.key === 'F2') { e.preventDefault(); onRenameCollection(connId, db, col); }
                      else if (e.key === 'Delete') { e.preventDefault(); onDropCollection(connId, db, col); }
                      else if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); onDuplicateCollection(connId, db, col); }
                      else if (mod && e.shiftKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); onCopyCollection(connId, db, col); }
                      else if (mod && !e.shiftKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); onCopyCollectionName(db, col); }
                    }}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setColCtxMenu({ x: e.clientX, y: e.clientY, connId, db, col }); }}
                    title={nodeTooltip({ ...where, database: db, collection: col })}
                  >
                    <ColIcon color={colIconColor} />
                    <span className="label">{col}</span>
                    <div className="col-actions" onClick={e => e.stopPropagation()}>
                      <button title="Drop collection" onClick={() => onDropCollection(connId, db, col)}><Icon name="trash" size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })}
      </div>
    );
  };

  const renderConnectedConn = (conn: Connection) => {
    const isSelected = selectedConnection === conn.id;
    const isOpen = !collapsedConns.has(conn.id);
    const isConnecting = connectingIds.has(conn.id);
    const health = connectionHealth[conn.id];
    const connColor = conn.color || DEFAULT_CONNECTION_COLOR;
    const connFolder = folderPathLabel(conn.folderId, folders);
    return (
      <div key={conn.id}>
        <div
          tabIndex={0}
          className={`connection-item connected ${isSelected ? 'active' : ''} ${isConnecting ? 'connecting' : ''} ${health ? `health-${health}` : ''}`}
          style={{ borderLeftColor: health === 'down' ? 'var(--error)' : connColor }}
          title={nodeTooltip({ connection: conn.name, folder: connFolder, server: serverLabel(conn.uri) })}
          onClick={() => onSelectConnection(conn.id)}
          onKeyDown={e => {
            const mod = e.ctrlKey || e.metaKey;
            if (e.key === 'Enter') { e.preventDefault(); onSelectConnection(conn.id); }
            else if (mod && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); onPasteDatabase(conn.id); }
          }}
        >
          <span className="tree-chevron"><Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} /></span>
          <span className="conn-dot" style={{ background: connColor }} />
          <span className="name">{conn.name}</span>
          {/* Same idea as the recent-connections cards on the welcome screen:
              the folder path is what tells two same-named connections apart at
              a glance, the tooltip carries the server. */}
          {connFolder && <span className="conn-path" title={connFolder}><Icon name="folder" size={10} /> {connFolder}</span>}
          {conn.readOnly && (
            <span className="conn-readonly-badge" title="Read-only connection — every write is refused">RO</span>
          )}
          {isConnecting && <span className="conn-connecting-label"><span className="conn-spinner" />Connecting…</span>}
          {!isConnecting && health === 'reconnecting' && (
            <span className="conn-connecting-label"><span className="conn-spinner" />Reconnecting…</span>
          )}
          {!isConnecting && health === 'down' && (
            <span className="conn-health-down" title="Server unreachable">Connection lost</span>
          )}
          <div className="actions">
            {!isConnecting && (
              <button title="Disconnect" className="conn-action-disconnect sidebar-disconnect-btn"
                onClick={e => { e.stopPropagation(); onDisconnect(conn.id); }}><Icon name="power" size={12} /> Disconnect</button>
            )}
          </div>
        </div>
        {isOpen && !isConnecting && renderDbTree(conn, connColor)}
      </div>
    );
  };

  // A read-only connection keeps the menu entries visible but disabled: hiding
  // them would make the tree look different for no stated reason.
  const isConnReadOnly = (connId: string) => !!connections.find(c => c.id === connId)?.readOnly;

  const dbCtxItems: ContextMenuEntry[] = dbCtxMenu ? [
    { label: 'Refresh collections', icon: 'refresh', onClick: () => { onRefreshDb(dbCtxMenu.connId, dbCtxMenu.db); setDbCtxMenu(null); } },
    { label: 'New collection', icon: 'plus', disabled: isConnReadOnly(dbCtxMenu.connId), onClick: () => { onCreateCollection(dbCtxMenu.connId, dbCtxMenu.db); setDbCtxMenu(null); } },
    { label: 'Import collection…', icon: 'import', disabled: isConnReadOnly(dbCtxMenu.connId), onClick: () => { onImportCollection(dbCtxMenu.connId, dbCtxMenu.db); setDbCtxMenu(null); } },
    { label: 'Import collection from CSV/TSV…', icon: 'import', disabled: isConnReadOnly(dbCtxMenu.connId), onClick: () => { onImportCsvCollection(dbCtxMenu.connId, dbCtxMenu.db); setDbCtxMenu(null); } },
    { separator: true },
    {
      label: collectionClipboard ? `Paste collection "${collectionClipboard.col}"` : 'Paste collection',
      icon: 'download',
      shortcut: 'Ctrl+Shift+V',
      disabled: !collectionClipboard || isConnReadOnly(dbCtxMenu.connId),
      onClick: () => { onPasteCollection(dbCtxMenu.connId, dbCtxMenu.db); setDbCtxMenu(null); },
    },
    { label: 'Copy database', icon: 'duplicate', shortcut: 'Ctrl+C', onClick: () => { onCopyDatabase(dbCtxMenu.connId, dbCtxMenu.db); setDbCtxMenu(null); } },
    {
      label: databaseClipboard ? `Paste database "${databaseClipboard.db}"` : 'Paste database',
      icon: 'download',
      shortcut: 'Ctrl+V',
      disabled: !databaseClipboard || isConnReadOnly(dbCtxMenu.connId),
      onClick: () => { onPasteDatabase(dbCtxMenu.connId); setDbCtxMenu(null); },
    },
    { separator: true },
    { label: 'Clear database', icon: 'clear', disabled: isConnReadOnly(dbCtxMenu.connId), onClick: () => { onClearDatabase(dbCtxMenu.connId, dbCtxMenu.db); setDbCtxMenu(null); } },
    { label: 'Drop database', icon: 'trash', disabled: isConnReadOnly(dbCtxMenu.connId), onClick: () => { onDropDatabase(dbCtxMenu.connId, dbCtxMenu.db); setDbCtxMenu(null); } },
  ] : [];

  const colCtxItems: ContextMenuEntry[] = colCtxMenu ? [
    { label: 'Open', icon: 'doc', onClick: () => { onSelectCollection(colCtxMenu.connId, colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    {
      label: isPinned(pinnedCollections, colCtxMenu.connId, colCtxMenu.db, colCtxMenu.col) ? 'Unpin' : 'Pin',
      icon: 'pin',
      onClick: () => { onTogglePin(colCtxMenu.connId, colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); },
    },
    { separator: true },
    { label: 'Copy name', icon: 'copy', shortcut: 'Ctrl+C', onClick: () => { onCopyCollectionName(colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { label: 'Copy collection', icon: 'duplicate', shortcut: 'Ctrl+Shift+C', onClick: () => { onCopyCollection(colCtxMenu.connId, colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { label: 'Duplicate', icon: 'duplicate', shortcut: 'Ctrl+D', disabled: isConnReadOnly(colCtxMenu.connId), onClick: () => { onDuplicateCollection(colCtxMenu.connId, colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { label: 'Rename', icon: 'edit', shortcut: 'F2', disabled: isConnReadOnly(colCtxMenu.connId), onClick: () => { onRenameCollection(colCtxMenu.connId, colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { label: 'Import documents…', icon: 'import', disabled: isConnReadOnly(colCtxMenu.connId), onClick: () => { onImportDocuments(colCtxMenu.connId, colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { label: 'Import CSV/TSV…', icon: 'import', disabled: isConnReadOnly(colCtxMenu.connId), onClick: () => { onImportCsvDocuments(colCtxMenu.connId, colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { separator: true },
    { label: 'Clear collection', icon: 'clear', disabled: isConnReadOnly(colCtxMenu.connId), onClick: () => { onClearCollection(colCtxMenu.connId, colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { label: 'Drop collection', icon: 'trash', shortcut: 'Del', disabled: isConnReadOnly(colCtxMenu.connId), onClick: () => { onDropCollection(colCtxMenu.connId, colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
  ] : [];

  return (
    <div className="sidebar" style={style}>
      <div className="sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src={logoUrl} alt="logo" style={{ width: 20, height: 20, flexShrink: 0 }} />
          <span>DATABASES</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button title="Manage connections" onClick={onOpenManager}><Icon name="plug" size={13} /> Manage</button>
        </div>
      </div>

      <div className="sidebar-scroll">
        {connectedConns.length === 0 ? (
          <div className="sidebar-empty">
            <p>Not connected.</p>
            <button onClick={onOpenManager}><Icon name="plug" size={14} /> Open connections</button>
          </div>
        ) : (
          connectedConns.map(renderConnectedConn)
        )}
      </div>

      <div className="sidebar-footer">
        <button className={theme === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')} title="Dark"><Icon name="moon" size={15} /></button>
        <button className={theme === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')} title="Light"><Icon name="sun" size={15} /></button>
        <button className={theme === 'hc' ? 'active' : ''} onClick={() => onThemeChange('hc')} title="High contrast"><Icon name="bolt" size={15} /></button>
        <button className={theme === 'solarized' ? 'active' : ''} onClick={() => onThemeChange('solarized')} title="Solarized"><Icon name="wave" size={15} /></button>
        <button onClick={onOpenShortcuts} title="Keyboard shortcuts (F1)" style={{ marginLeft: 'auto' }}><Icon name="keyboard" size={15} /></button>
        <button onClick={onOpenAbout} title="About BoxyNoSql"><Icon name="info" size={15} /></button>
        <button onClick={onOpenSettings} title="Appearance settings"><Icon name="gear" size={15} /></button>
      </div>

      {dbCtxMenu && (
        <ContextMenu x={dbCtxMenu.x} y={dbCtxMenu.y} items={dbCtxItems} onClose={() => setDbCtxMenu(null)} />
      )}
      {colCtxMenu && (
        <ContextMenu x={colCtxMenu.x} y={colCtxMenu.y} items={colCtxItems} onClose={() => setColCtxMenu(null)} />
      )}
    </div>
  );
}
