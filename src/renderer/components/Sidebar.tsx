import { useState } from 'react';
import ContextMenu, { ContextMenuEntry } from './ContextMenu';
import logoUrl from '../../assets/img/logo.svg?url';
import { IconSettings, resolveIconColor, DEFAULT_CONNECTION_COLOR } from '../utils/iconColors';
import Icon from './Icon';

interface Connection {
  id: string; name: string; uri: string; database?: string;
  folderId?: string; color?: string; order?: number;
  iconDbColor?: string; iconColColor?: string;
}

interface SidebarProps {
  connections: Connection[];
  selectedConnection: string | null;
  /** Connected connections whose database tree the user folded away. */
  collapsedConns: Set<string>;
  connectedIds: Set<string>;
  connectingIds: Set<string>;
  databases: string[];
  expandedDbs: Set<string>;
  collections: Record<string, string[]>;
  selectedCollection: string | null;
  theme: 'dark' | 'light' | 'hc' | 'solarized';
  iconSettings: IconSettings;
  onOpenManager: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onSelectConnection: (id: string) => void;
  onDisconnect: (id: string) => void;
  onExpandDb: (db: string) => void;
  onSelectCollection: (db: string, col: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onCreateDatabase: () => void;
  onCreateCollection: (db: string) => void;
  onDropCollection: (db: string, col: string) => void;
  onRenameCollection: (db: string, col: string) => void;
  onDuplicateCollection: (db: string, col: string) => void;
  onCopyCollectionName: (db: string, col: string) => void;
  onClearCollection: (db: string, col: string) => void;
  onDropDatabase: (db: string) => void;
  onClearDatabase: (db: string) => void;
  onManageUsers: (db: string) => void;
  onImportDocuments: (db: string, col: string) => void;
  onImportCollection: (db: string) => void;
  onImportDatabase: () => void;
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
    connections, selectedConnection, collapsedConns, connectedIds, connectingIds,
    databases, expandedDbs, collections, selectedCollection,
    theme, iconSettings, onOpenManager, onOpenSettings, onOpenAbout,
    onSelectConnection, onDisconnect, onExpandDb, onSelectCollection,
    onExpandAll, onCollapseAll, onCreateDatabase, onCreateCollection, onDropCollection,
    onRenameCollection, onDuplicateCollection, onCopyCollectionName,
    onClearCollection, onDropDatabase, onClearDatabase,
    onManageUsers, onImportDocuments, onImportCollection, onImportDatabase,
    onThemeChange, style,
  } = props;

  const [dbSearch, setDbSearch] = useState<Record<string, string>>({});
  const [dbCtxMenu, setDbCtxMenu] = useState<{ x: number; y: number; db: string } | null>(null);
  const [colCtxMenu, setColCtxMenu] = useState<{ x: number; y: number; db: string; col: string } | null>(null);

  const connectedConns = connections.filter(c => connectedIds.has(c.id) || connectingIds.has(c.id));

  const renderDbTree = (conn: Connection, color = 'var(--success)') => {
    const connId = conn.id;
    const dbIconColor = resolveIconColor('db', conn, iconSettings);
    const colIconColor = resolveIconColor('col', conn, iconSettings);
    const search = (dbSearch[connId] || '').toLowerCase();
    const filteredDbs = search ? databases.filter(db => db.toLowerCase().includes(search)) : databases;
    return (
      <div className="conn-db-tree" style={{ borderLeftColor: color }}>
        <div className="db-tree-toolbar">
          <button onClick={onExpandAll} title="Expand all"><Icon name="expandAll" size={13} /> All</button>
          <button onClick={onCollapseAll} title="Collapse all"><Icon name="collapseAll" size={13} /> Collapse</button>
          <button onClick={onImportDatabase} title="Import database from JSON" style={{ marginLeft: 'auto' }}><Icon name="import" size={13} /> Import</button>
          <button onClick={onCreateDatabase} title="Create database"><Icon name="database" size={13} /> + DB</button>
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
        {filteredDbs.map(db => (
          <div key={db}>
            <div
              className="tree-node-header"
              onClick={() => onExpandDb(db)}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setDbCtxMenu({ x: e.clientX, y: e.clientY, db }); }}
            >
              <span className="tree-chevron"><Icon name={expandedDbs.has(db) ? 'chevronDown' : 'chevronRight'} size={12} /></span>
              <DbIcon color={dbIconColor} />
              <span className="label">{db}</span>
              <div className="tree-node-actions" onClick={e => e.stopPropagation()}>
                <button title="New collection" onClick={() => onCreateCollection(db)}><Icon name="plus" size={13} /></button>
                <button title="Manage users" onClick={() => onManageUsers(db)}><Icon name="user" size={13} /></button>
                <button title="Drop database" onClick={() => onDropDatabase(db)}><Icon name="trash" size={13} /></button>
              </div>
            </div>
            {expandedDbs.has(db) && collections[db] && (
              <div className="tree-node-children">
                {[...collections[db]].sort().map(col => (
                  <div
                    key={col}
                    tabIndex={0}
                    className={`collection-item ${selectedCollection === col ? 'active' : ''}`}
                    onClick={() => onSelectCollection(db, col)}
                    onKeyDown={e => {
                      const mod = e.ctrlKey || e.metaKey;
                      if (e.key === 'Enter') { e.preventDefault(); onSelectCollection(db, col); }
                      else if (e.key === 'F2') { e.preventDefault(); onRenameCollection(db, col); }
                      else if (e.key === 'Delete') { e.preventDefault(); onDropCollection(db, col); }
                      else if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); onDuplicateCollection(db, col); }
                      else if (mod && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); onCopyCollectionName(db, col); }
                    }}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setColCtxMenu({ x: e.clientX, y: e.clientY, db, col }); }}
                  >
                    <ColIcon color={colIconColor} />
                    <span className="label">{col}</span>
                    <div className="col-actions" onClick={e => e.stopPropagation()}>
                      <button title="Drop collection" onClick={() => onDropCollection(db, col)}><Icon name="trash" size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderConnectedConn = (conn: Connection) => {
    const isSelected = selectedConnection === conn.id;
    const isOpen = isSelected && !collapsedConns.has(conn.id);
    const isConnecting = connectingIds.has(conn.id);
    const connColor = conn.color || DEFAULT_CONNECTION_COLOR;
    return (
      <div key={conn.id}>
        <div
          className={`connection-item connected ${isSelected ? 'active' : ''} ${isConnecting ? 'connecting' : ''}`}
          style={{ borderLeftColor: connColor }}
          onClick={() => onSelectConnection(conn.id)}
        >
          <span className="tree-chevron"><Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} /></span>
          <span className="conn-dot" style={{ background: connColor }} />
          <span className="name">{conn.name}</span>
          {isConnecting && <span className="conn-connecting-label"><span className="conn-spinner" />Connecting…</span>}
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

  const dbCtxItems: ContextMenuEntry[] = dbCtxMenu ? [
    { label: 'New collection', icon: 'plus', onClick: () => { onCreateCollection(dbCtxMenu.db); setDbCtxMenu(null); } },
    { label: 'Import collection…', icon: 'import', onClick: () => { onImportCollection(dbCtxMenu.db); setDbCtxMenu(null); } },
    { separator: true },
    { label: 'Clear database', icon: 'clear', onClick: () => { onClearDatabase(dbCtxMenu.db); setDbCtxMenu(null); } },
    { label: 'Drop database', icon: 'trash', onClick: () => { onDropDatabase(dbCtxMenu.db); setDbCtxMenu(null); } },
  ] : [];

  const colCtxItems: ContextMenuEntry[] = colCtxMenu ? [
    { label: 'Open', icon: 'doc', onClick: () => { onSelectCollection(colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { separator: true },
    { label: 'Copy name', icon: 'copy', shortcut: 'Ctrl+C', onClick: () => { onCopyCollectionName(colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { label: 'Duplicate', icon: 'duplicate', shortcut: 'Ctrl+D', onClick: () => { onDuplicateCollection(colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { label: 'Rename', icon: 'edit', shortcut: 'F2', onClick: () => { onRenameCollection(colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { label: 'Import documents…', icon: 'import', onClick: () => { onImportDocuments(colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { separator: true },
    { label: 'Clear collection', icon: 'clear', onClick: () => { onClearCollection(colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { label: 'Drop collection', icon: 'trash', shortcut: 'Del', onClick: () => { onDropCollection(colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
  ] : [];

  return (
    <div className="sidebar" style={style}>
      <div className="sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src={logoUrl} alt="logo" style={{ width: 20, height: 20, flexShrink: 0 }} />
          <span>DATABASES</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="icon-btn add-btn" title="Manage connections" onClick={onOpenManager}><Icon name="plug" size={13} /> Manage</button>
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
        <button onClick={onOpenAbout} title="About BoxyNoSql" style={{ marginLeft: 'auto' }}><Icon name="info" size={15} /></button>
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
