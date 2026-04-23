import { useState, useRef } from 'react';
import ContextMenu, { ContextMenuEntry } from './ContextMenu';
import logoUrl from '../../assets/img/logo.svg?url';

const COLORS = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db',
                 '#9b59b6','#e91e63','#795548','#607d8b','#00bcd4','#8bc34a'];

interface Connection {
  id: string; name: string; uri: string; database?: string;
  folderId?: string; color?: string; order?: number;
}
interface Folder { id: string; name: string; color?: string; order?: number; parentId?: string; }

interface SidebarProps {
  connections: Connection[];
  folders: Folder[];
  selectedConnection: string | null;
  connectedIds: Set<string>;
  databases: string[];
  expandedDbs: Set<string>;
  collections: Record<string, string[]>;
  selectedCollection: string | null;
  theme: 'dark' | 'light' | 'hc';
  onAddConnection: () => void;
  onEditConnection: (conn: Connection) => void;
  onDeleteConnection: (id: string) => void;
  onSelectConnection: (id: string) => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onExpandDb: (db: string) => void;
  onSelectCollection: (db: string, col: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onCreateDatabase: () => void;
  onCreateCollection: (db: string) => void;
  onDropCollection: (db: string, col: string) => void;
  onRenameCollection: (db: string, col: string) => void;
  onClearCollection: (db: string, col: string) => void;
  onDropDatabase: (db: string) => void;
  onClearDatabase: (db: string) => void;
  onManageUsers: (db: string) => void;
  onAddFolder: (parentId?: string) => void;
  onSaveFolder: (f: Folder) => void;
  onDeleteFolder: (id: string) => void;
  onMoveConnection: (connId: string, folderId: string | undefined) => void;
  onMoveFolder: (folderId: string, newParentId: string | undefined) => void;
  onReorderConnections: (conns: Connection[]) => void;
  onReorderFolders: (folders: Folder[]) => void;
  onThemeChange: (t: 'dark' | 'light' | 'hc') => void;
  onSaveConnection: (conn: Connection) => void;
  style?: React.CSSProperties;
}

function ColorPicker({ value, onChange }: { value?: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        className="color-dot"
        style={{ background: value || 'var(--text-secondary)', cursor: 'pointer' }}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
      />
      {open && (
        <div className="color-picker-popup" onClick={e => e.stopPropagation()}>
          {COLORS.map(c => (
            <div
              key={c}
              className={`color-swatch${value === c ? ' selected' : ''}`}
              style={{ background: c }}
              onClick={() => { onChange(c); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DbIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <ellipse cx="7" cy="3.5" rx="4.5" ry="1.8" stroke="var(--icon-db)" strokeWidth="1.2"/>
      <path d="M2.5 3.5v7c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8v-7" stroke="var(--icon-db)" strokeWidth="1.2" fill="none"/>
      <path d="M2.5 6.8c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8" stroke="var(--icon-db)" strokeWidth="1.2" fill="none"/>
    </svg>
  );
}

function ColIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1.5" y="2.5" width="11" height="9" rx="1" stroke="var(--icon-col)" strokeWidth="1.2"/>
      <line x1="1.5" y1="5.5" x2="12.5" y2="5.5" stroke="var(--icon-col)" strokeWidth="1"/>
      <line x1="1.5" y1="8.5" x2="12.5" y2="8.5" stroke="var(--icon-col)" strokeWidth="1"/>
      <line x1="4.5" y1="5.5" x2="4.5" y2="11.5" stroke="var(--icon-col)" strokeWidth="1"/>
    </svg>
  );
}

function FolderIcon({ color, open }: { color?: string; open: boolean }) {
  const c = color || 'var(--text-secondary)';
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      {open
        ? <path d="M1 4h12v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4zm0 0V3a1 1 0 011-1h3l1.5 2H1z" fill={c} opacity="0.9"/>
        : <path d="M1 3a1 1 0 011-1h3l1.5 2H13a1 1 0 011 1v6a1 1 0 01-1 1H2a1 1 0 01-1-1V3z" fill={c} opacity="0.9"/>
      }
    </svg>
  );
}

function IconConnect() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="12" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="6.5" y1="8" x2="9.5" y2="8" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  );
}

function IconDisconnect() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="12" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="6.5" y1="6.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="9.5" y1="6.5" x2="6.5" y2="9.5" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  );
}

function IconDelete() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

export default function Sidebar(props: SidebarProps) {
  const {
    connections, folders, selectedConnection, connectedIds,
    databases, expandedDbs, collections, selectedCollection,
    theme, onAddConnection, onEditConnection, onDeleteConnection,
    onSelectConnection, onConnect, onDisconnect, onExpandDb, onSelectCollection,
    onExpandAll, onCollapseAll, onCreateDatabase, onCreateCollection, onDropCollection,
    onRenameCollection, onClearCollection, onDropDatabase, onClearDatabase,
    onManageUsers, onAddFolder, onSaveFolder,
    onDeleteFolder, onMoveConnection, onMoveFolder,
    onThemeChange, onSaveConnection,
    style
  } = props;

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [dbSearch, setDbSearch] = useState<Record<string, string>>({});
  const [dbCtxMenu, setDbCtxMenu] = useState<{ x: number; y: number; db: string } | null>(null);
  const [colCtxMenu, setColCtxMenu] = useState<{ x: number; y: number; db: string; col: string } | null>(null);
  const [folderCtxMenu, setFolderCtxMenu] = useState<{ x: number; y: number; folder: Folder } | null>(null);
  const [connCtxMenu, setConnCtxMenu] = useState<{ x: number; y: number; conn: Connection } | null>(null);
  const [bgCtxMenu, setBgCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const dragItem = useRef<{ type: 'conn' | 'folder'; id: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const toggleFolder = (id: string) => {
    setExpandedFolders(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const handleDragStart = (type: 'conn' | 'folder', id: string) => {
    dragItem.current = { type, id };
  };

  const isFolderDescendant = (folderId: string, ancestorId: string): boolean => {
    let current = folders.find(f => f.id === folderId);
    while (current) {
      if (current.id === ancestorId) return true;
      current = folders.find(f => f.id === current!.parentId);
    }
    return false;
  };

  const handleDrop = (targetFolderId: string | undefined) => {
    if (!dragItem.current) return;
    if (dragItem.current.type === 'conn') {
      onMoveConnection(dragItem.current.id, targetFolderId);
    } else if (dragItem.current.type === 'folder') {
      const srcId = dragItem.current.id;
      if (targetFolderId && (srcId === targetFolderId || isFolderDescendant(targetFolderId, srcId))) {
        dragItem.current = null;
        setDragOver(null);
        return;
      }
      onMoveFolder(srcId, targetFolderId);
    }
    dragItem.current = null;
    setDragOver(null);
  };

  const getRootFolders = () => {
    return [...folders].filter(f => !f.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  };

  const getChildFolders = (parentId: string) => {
    return [...folders].filter(f => f.parentId === parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  };

  const rootConns = connections.filter(c => !c.folderId);

  const renderDbTree = (connId: string, color = 'var(--success)') => {
    const isActive = selectedConnection === connId;
    if (!isActive) return null;
    const search = (dbSearch[connId] || '').toLowerCase();
    const filteredDbs = search
      ? databases.filter(db => db.toLowerCase().includes(search))
      : databases;
    return (
      <div className="conn-db-tree" style={{ borderLeftColor: color }}>
        <div className="db-tree-toolbar">
          <button onClick={onExpandAll} title="Expand all">↕ All</button>
          <button onClick={onCollapseAll} title="Collapse all">↑ Collapse</button>
          <button onClick={onCreateDatabase} title="Create database" style={{ marginLeft: 'auto' }}>🗄 + DB</button>
        </div>
        <div className="db-search-wrap">
          <input
            className="db-search-input"
            placeholder="Search databases…"
            value={dbSearch[connId] || ''}
            onChange={e => setDbSearch(prev => ({ ...prev, [connId]: e.target.value }))}
          />
          {dbSearch[connId] && (
            <button
              className="db-search-clear"
              onClick={() => setDbSearch(prev => ({ ...prev, [connId]: '' }))}
            >
              <IconDelete />
            </button>
          )}
        </div>
        {filteredDbs.map(db => (
          <div key={db}>
            <div
              className="tree-node-header"
              onClick={() => onExpandDb(db)}
              onContextMenu={e => { e.preventDefault(); setDbCtxMenu({ x: e.clientX, y: e.clientY, db }); }}
            >
              <span className="tree-chevron">{expandedDbs.has(db) ? '▾' : '▸'}</span>
              <DbIcon />
              <span className="label">{db}</span>
              <div className="tree-node-actions" onClick={e => e.stopPropagation()}>
                <button title="New collection" onClick={() => onCreateCollection(db)}>➕</button>
                <button title="Manage users" onClick={() => onManageUsers(db)}>👤</button>
                <button title="Drop database" onClick={() => onDropDatabase(db)}>🗑</button>
              </div>
            </div>
            {expandedDbs.has(db) && collections[db] && (
              <div className="tree-node-children">
                {[...collections[db]].sort().map(col => (
                  <div
                    key={col}
                    className={`collection-item ${selectedCollection === col ? 'active' : ''}`}
                    onClick={() => onSelectCollection(db, col)}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setColCtxMenu({ x: e.clientX, y: e.clientY, db, col }); }}
                  >
                    <ColIcon />
                    <span className="label">{col}</span>
                    <div className="col-actions" onClick={e => e.stopPropagation()}>
                      <button title="Drop collection" onClick={() => onDropCollection(db, col)}>🗑</button>
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

  const renderConnection = (conn: Connection) => {
    const isSelected = selectedConnection === conn.id;
    const isConnected = connectedIds.has(conn.id);
    const connColor = conn.color || 'var(--success)';
    return (
      <div key={conn.id}>
        <div
          className={`connection-item ${isSelected ? 'active' : ''} ${isConnected ? 'connected' : ''}`}
          style={isConnected ? { borderLeftColor: connColor } : {}}
          draggable
          onDragStart={() => handleDragStart('conn', conn.id)}
          onClick={() => onSelectConnection(conn.id)}
          onDoubleClick={() => { if (!isConnected) onConnect(conn.id); }}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setConnCtxMenu({ x: e.clientX, y: e.clientY, conn }); }}
        >
          <ColorPicker value={conn.color} onChange={c => onSaveConnection({ ...conn, color: c })} />
          <span className="name">{conn.name}</span>
          <div className="actions">
            {isConnected ? (
              <button
                title="Disconnect"
                onClick={e => { e.stopPropagation(); onDisconnect(conn.id); }}
                className="conn-action-disconnect"
              >
                <IconDisconnect />
              </button>
            ) : (
              <button
                title="Connect"
                onClick={e => { e.stopPropagation(); onConnect(conn.id); }}
                className="conn-action-connect"
              >
                <IconConnect />
              </button>
            )}
            <button title="Edit" onClick={e => { e.stopPropagation(); onEditConnection(conn); }}>
              <IconEdit />
            </button>
            <button title="Delete" onClick={e => { e.stopPropagation(); onDeleteConnection(conn.id); }}>
              <IconDelete />
            </button>
          </div>
        </div>
        {isConnected && renderDbTree(conn.id, connColor)}
      </div>
    );
  };

  const renderFolder = (folder: Folder): React.ReactNode => {
    const isOpen = expandedFolders.has(folder.id);
    const isEditing = editingFolder === folder.id;
    const childFolders = getChildFolders(folder.id);
    const folderConns = connections
      .filter(c => c.folderId === folder.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return (
      <div
        key={folder.id}
        className={`folder-item${dragOver === folder.id ? ' drag-target' : ''}`}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(folder.id); }}
        onDragLeave={e => { e.stopPropagation(); setDragOver(null); }}
        onDrop={e => { e.stopPropagation(); handleDrop(folder.id); }}
      >
        <div
          className="folder-header"
          draggable
          onDragStart={() => handleDragStart('folder', folder.id)}
          onClick={() => toggleFolder(folder.id)}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setFolderCtxMenu({ x: e.clientX, y: e.clientY, folder }); }}
        >
          <span className="tree-chevron">{isOpen ? '▾' : '▸'}</span>
          <ColorPicker value={folder.color} onChange={c => onSaveFolder({ ...folder, color: c })} />
          <FolderIcon color={folder.color} open={isOpen} />
          {isEditing ? (
            <input
              className="folder-name-input"
              value={folderName}
              autoFocus
              onClick={e => e.stopPropagation()}
              onChange={e => setFolderName(e.target.value)}
              onBlur={() => { onSaveFolder({ ...folder, name: folderName }); setEditingFolder(null); }}
              onKeyDown={e => {
                if (e.key === 'Enter') { onSaveFolder({ ...folder, name: folderName }); setEditingFolder(null); }
                if (e.key === 'Escape') { setEditingFolder(null); }
              }}
            />
          ) : (
            <span className="folder-name">{folder.name}</span>
          )}
          <div className="actions" onClick={e => e.stopPropagation()}>
            <button title="Delete folder" onClick={() => onDeleteFolder(folder.id)}>🗑</button>
          </div>
        </div>
        {isOpen && (
          <div className="folder-children">
            {childFolders.map(renderFolder)}
            {folderConns.map(renderConnection)}
          </div>
        )}
      </div>
    );
  };

  const dbCtxItems: ContextMenuEntry[] = dbCtxMenu ? [
    { label: '➕  New collection', onClick: () => { onCreateCollection(dbCtxMenu.db); setDbCtxMenu(null); } },
    { separator: true },
    { label: '🧹  Clear database', onClick: () => { onClearDatabase(dbCtxMenu.db); setDbCtxMenu(null); } },
    { label: '🗑  Drop database', onClick: () => { onDropDatabase(dbCtxMenu.db); setDbCtxMenu(null); } },
  ] : [];

  const colCtxItems: ContextMenuEntry[] = colCtxMenu ? [
    { label: '📂  Open', onClick: () => { onSelectCollection(colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { separator: true },
    { label: '✏️  Rename', onClick: () => { onRenameCollection(colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { separator: true },
    { label: '🧹  Clear collection', onClick: () => { onClearCollection(colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
    { label: '🗑  Drop collection', onClick: () => { onDropCollection(colCtxMenu.db, colCtxMenu.col); setColCtxMenu(null); } },
  ] : [];

  const folderCtxItems: ContextMenuEntry[] = folderCtxMenu ? [
    { label: '📂  New subfolder', onClick: () => { onAddFolder(folderCtxMenu.folder.id); setFolderCtxMenu(null); } },
    { separator: true },
    { label: '✏️  Rename', onClick: () => { setFolderName(folderCtxMenu.folder.name); setEditingFolder(folderCtxMenu.folder.id); setFolderCtxMenu(null); } },
    { separator: true },
    { label: '🗑  Delete folder', onClick: () => { onDeleteFolder(folderCtxMenu.folder.id); setFolderCtxMenu(null); } },
  ] : [];

  const connCtxItems: ContextMenuEntry[] = connCtxMenu ? [
    { label: '🔌  Connect', disabled: connectedIds.has(connCtxMenu.conn.id), onClick: () => { onConnect(connCtxMenu.conn.id); setConnCtxMenu(null); } },
    { label: '🔌  Disconnect', disabled: !connectedIds.has(connCtxMenu.conn.id), onClick: () => { onDisconnect(connCtxMenu.conn.id); setConnCtxMenu(null); } },
    { separator: true },
    { label: '✏️  Edit', onClick: () => { onEditConnection(connCtxMenu.conn); setConnCtxMenu(null); } },
    { separator: true },
    { label: '🗑  Delete', onClick: () => { onDeleteConnection(connCtxMenu.conn.id); setConnCtxMenu(null); } },
  ] : [];

  return (
    <div className="sidebar" style={style}>
      <div className="sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src={logoUrl} alt="logo" style={{ width: 20, height: 20, flexShrink: 0 }} />
          <span>CONNECTIONS</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="icon-btn add-btn" title="New folder" onClick={() => onAddFolder()}>📁</button>
          <button className="icon-btn add-btn" title="New connection" onClick={onAddConnection}>🔌 +</button>
        </div>
      </div>

      <div
        className="sidebar-scroll"
        onDragOver={e => { e.preventDefault(); setDragOver('root'); }}
        onDragLeave={() => setDragOver(null)}
        onDrop={() => handleDrop(undefined)}
        onContextMenu={e => { e.preventDefault(); setBgCtxMenu({ x: e.clientX, y: e.clientY }); }}
      >
        {/* Folders (recursive) */}
        {getRootFolders().map(renderFolder)}

        {/* Root connections */}
        <div className={`root-drop-area ${dragOver === 'root' ? 'drag-target' : ''}`}>
          {rootConns.map(renderConnection)}
        </div>
      </div>

      {/* Theme selector */}
      <div className="sidebar-footer">
        <button className={theme === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')} title="Dark">🌙</button>
        <button className={theme === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')} title="Light">☀️</button>
        <button className={theme === 'hc' ? 'active' : ''} onClick={() => onThemeChange('hc')} title="High contrast">⚡</button>
      </div>

      {dbCtxMenu && (
        <ContextMenu
          x={dbCtxMenu.x} y={dbCtxMenu.y}
          items={dbCtxItems}
          onClose={() => setDbCtxMenu(null)}
        />
      )}
      {colCtxMenu && (
        <ContextMenu
          x={colCtxMenu.x} y={colCtxMenu.y}
          items={colCtxItems}
          onClose={() => setColCtxMenu(null)}
        />
      )}
      {folderCtxMenu && (
        <ContextMenu
          x={folderCtxMenu.x} y={folderCtxMenu.y}
          items={folderCtxItems}
          onClose={() => setFolderCtxMenu(null)}
        />
      )}
      {connCtxMenu && (
        <ContextMenu
          x={connCtxMenu.x} y={connCtxMenu.y}
          items={connCtxItems}
          onClose={() => setConnCtxMenu(null)}
        />
      )}
      {bgCtxMenu && (
        <ContextMenu
          x={bgCtxMenu.x} y={bgCtxMenu.y}
          items={[
            { label: '📁  New folder', onClick: () => { onAddFolder(); setBgCtxMenu(null); } },
            { label: '🔌  New connection', onClick: () => { onAddConnection(); setBgCtxMenu(null); } },
          ]}
          onClose={() => setBgCtxMenu(null)}
        />
      )}
    </div>
  );
}
