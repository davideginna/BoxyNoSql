import { useState, useRef, useEffect } from 'react';
import ContextMenu, { ContextMenuEntry } from './ContextMenu';
import Icon from './Icon';
import FolderEditModal from './FolderEditModal';
import ImportConnectionsModal from './ImportConnectionsModal';
import { DEFAULT_CONNECTION_COLOR } from '../utils/iconColors';
import { pickFile } from '../utils/fileImport';
import { parseStudio3TExport, ImportedConnection } from '../utils/uriImport';
import { showAlert } from '../dialog';
import { onEscape, SWALLOW_ESCAPE } from '../utils/keys';

interface Connection {
  id: string; name: string; uri: string; database?: string;
  folderId?: string; color?: string; order?: number;
}
interface Folder { id: string; name: string; color?: string; order?: number; parentId?: string; }

interface Props {
  connections: Connection[];
  folders: Folder[];
  connectedIds: Set<string>;
  connectingIds: Set<string>;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onAddConnection: () => void;
  onEditConnection: (conn: Connection) => void;
  onDeleteConnection: (id: string) => void;
  onDuplicateConnection: (conn: Connection) => void;
  onSaveConnection: (conn: Connection) => void;
  onAddFolder: (parentId?: string) => void;
  onSaveFolder: (f: Folder) => void;
  onDeleteFolder: (id: string) => void;
  onMoveConnection: (connId: string, folderId: string | undefined) => void;
  onMoveFolder: (folderId: string, newParentId: string | undefined) => void;
  onReorderFolders: (folders: Folder[]) => void;
  onImportConnections: (items: ImportedConnection[]) => Promise<void> | void;
  onClose: () => void;
  disableEsc?: boolean;
}


function parseUriInfo(uri: string): { hosts: string[]; replicaSet?: string; srv: boolean } {
  try {
    const srv = uri.startsWith('mongodb+srv://');
    let rest = uri.replace(/^mongodb(\+srv)?:\/\//, '');
    const at = rest.lastIndexOf('@');
    if (at !== -1) rest = rest.slice(at + 1);
    const hostPart = rest.split(/[/?]/)[0];
    const hosts = hostPart.split(',').map(h => h.trim()).filter(Boolean);
    let replicaSet: string | undefined;
    const q = uri.split('?')[1];
    if (q) replicaSet = new URLSearchParams(q).get('replicaSet') || undefined;
    return { hosts, replicaSet, srv };
  } catch { return { hosts: [], srv: false }; }
}

export default function ConnectionManagerModal(props: Props) {
  const {
    connections, folders, connectedIds, connectingIds,
    onConnect, onDisconnect, onAddConnection, onEditConnection, onDeleteConnection, onDuplicateConnection,
    onSaveConnection, onAddFolder, onSaveFolder, onDeleteFolder,
    onMoveConnection, onMoveFolder, onReorderFolders, onImportConnections, onClose, disableEsc,
  } = props;

  // Parsed .uri file waiting for confirmation in ImportConnectionsModal.
  const [importPreview, setImportPreview] = useState<{ items: ImportedConnection[]; fileName: string } | null>(null);

  // `disableEsc` while a child modal of its own is open, `importPreview`
  // because that preview handles Escape itself.
  useEffect(
    () => onEscape(disableEsc || importPreview ? SWALLOW_ESCAPE : onClose),
    [disableEsc, importPreview, onClose],
  );

  const handlePickUriFile = async () => {
    const file = await pickFile('.uri,.txt');
    if (!file) return;
    try {
      const items = parseStudio3TExport(await file.text());
      if (items.length === 0) {
        await showAlert({ title: 'Import connections', message: 'No connection URIs found in this file.' });
        return;
      }
      setImportPreview({ items, fileName: file.name });
    } catch (e: any) {
      await showAlert({ title: 'Import failed', message: "Couldn't read the file.", detail: e.message, danger: true });
    }
  };

  // Folders start collapsed: with many imported groups an all-open tree buries
  // the connections. Folders created later (import, "New folder") still open,
  // see the effect below.
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');

  // Folders created while the modal is open (import, "New folder") start
  // expanded, otherwise their contents are invisible right after creation.
  const knownFolderIds = useRef<Set<string>>(new Set(folders.map(f => f.id)));
  useEffect(() => {
    const added = folders.filter(f => !knownFolderIds.current.has(f.id)).map(f => f.id);
    if (added.length === 0) return;
    added.forEach(id => knownFolderIds.current.add(id));
    setExpandedFolders(s => new Set([...s, ...added]));
  }, [folders]);
  const [editFolder, setEditFolder] = useState<Folder | null>(null);
  const [folderCtxMenu, setFolderCtxMenu] = useState<{ x: number; y: number; folder: Folder } | null>(null);
  const [connCtxMenu, setConnCtxMenu] = useState<{ x: number; y: number; conn: Connection } | null>(null);
  const dragItem = useRef<{ type: 'conn' | 'folder'; id: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const [width, setWidth] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('connManagerWidth') || '', 10);
    return Number.isFinite(saved) && saved >= 480 ? saved : 880;
  });
  const resizing = useRef(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      // Modal is centered: right edge sits at center + width/2, so width = 2*(cursorX - center).
      const max = Math.round(window.innerWidth * 0.96);
      const w = Math.min(Math.max((ev.clientX - window.innerWidth / 2) * 2, 480), max);
      setWidth(w);
    };
    const onUp = () => {
      resizing.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setWidth(w => { localStorage.setItem('connManagerWidth', String(w)); return w; });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const toggleFolder = (id: string) =>
    setExpandedFolders(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleDragStart = (type: 'conn' | 'folder', id: string) => { dragItem.current = { type, id }; };

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
        dragItem.current = null; setDragOver(null); return;
      }
      onMoveFolder(srcId, targetFolderId);
    }
    dragItem.current = null;
    setDragOver(null);
  };

  const getRootFolders = () => [...folders].filter(f => !f.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const getChildFolders = (parentId: string) => [...folders].filter(f => f.parentId === parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Contains-match on the connection name and on every host in its URI, so
  // "mongo02" or "10.157" find a connection whose name says nothing about it.
  const query = search.trim().toLowerCase();
  const matchesQuery = (c: Connection) => {
    if (!query) return true;
    if (c.name.toLowerCase().includes(query)) return true;
    return parseUriInfo(c.uri).hosts.some(h => h.toLowerCase().includes(query));
  };
  const matchingConns = connections.filter(matchesQuery);
  // A folder survives the filter when it, or any folder below it, holds a match.
  const folderHasMatch = (folderId: string): boolean =>
    matchingConns.some(c => c.folderId === folderId) ||
    getChildFolders(folderId).some(f => folderHasMatch(f.id));

  const rootConns = matchingConns.filter(c => !c.folderId);

  const getSiblings = (folder: Folder) =>
    [...folders].filter(f => f.parentId === folder.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const moveFolderInOrder = (folder: Folder, dir: -1 | 1) => {
    const siblings = getSiblings(folder);
    const idx = siblings.findIndex(f => f.id === folder.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const other = siblings[swapIdx];
    const aOrder = folder.order ?? idx;
    const bOrder = other.order ?? swapIdx;
    onReorderFolders(folders.map(f => {
      if (f.id === folder.id) return { ...f, order: bOrder };
      if (f.id === other.id) return { ...f, order: aOrder };
      return f;
    }));
  };

  const renderConnection = (conn: Connection) => {
    const isConnected = connectedIds.has(conn.id);
    const isConnecting = connectingIds.has(conn.id);
    const info = parseUriInfo(conn.uri);
    return (
      <div
        key={conn.id}
        className={`connection-item conn-manager-item ${isConnected ? 'connected' : ''} ${isConnecting ? 'connecting' : ''}`}
        style={isConnected ? { borderLeftColor: conn.color || 'var(--success)' } : {}}
        draggable
        tabIndex={0}
        onDragStart={() => handleDragStart('conn', conn.id)}
        onDoubleClick={() => { if (!isConnected && !isConnecting) onConnect(conn.id); }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !isConnecting) { e.preventDefault(); isConnected ? onDisconnect(conn.id) : onConnect(conn.id); }
          else if (e.altKey && (e.key === 'e' || e.key === 'E')) { e.preventDefault(); onEditConnection(conn); }
        }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setConnCtxMenu({ x: e.clientX, y: e.clientY, conn }); }}
      >
        <Icon name="plug" size={16} color={conn.color || DEFAULT_CONNECTION_COLOR} />
        <div className="conn-info">
          <div className="conn-info-top">
            <span className="name">{conn.name}</span>
            {isConnecting && <span className="conn-connecting-label"><span className="conn-spinner" />Connecting…</span>}
            {isConnected && !isConnecting && <span className="conn-connected-badge"><Icon name="check" size={11} /> connected</span>}
          </div>
          <div className="conn-meta">
            {info.srv && <span className="conn-tag conn-srv">SRV</span>}
            {info.hosts.length > 0
              ? info.hosts.map((h, i) => <span key={i} className="conn-host">{h}</span>)
              : <span className="conn-host conn-host-unknown">no host</span>}
            {info.replicaSet && <span className="conn-tag conn-rs">rs: {info.replicaSet}</span>}
          </div>
        </div>
        <div className="actions" style={{ opacity: 1 }}>
          {isConnecting ? null : isConnected ? (
            <button title="Disconnect (Enter)" className="conn-action-disconnect manager-conn-btn"
              onClick={e => { e.stopPropagation(); onDisconnect(conn.id); }}><Icon name="power" size={12} /> Disconnect</button>
          ) : (
            <button title="Connect (Enter)" className="conn-action-connect manager-conn-btn"
              onClick={e => { e.stopPropagation(); onConnect(conn.id); }}><Icon name="play" size={12} /> Connect</button>
          )}
          <button title="Edit" onClick={e => { e.stopPropagation(); onEditConnection(conn); }}><Icon name="edit" size={14} /></button>
          <button title="Clone" onClick={e => { e.stopPropagation(); onDuplicateConnection(conn); }}><Icon name="duplicate" size={14} /></button>
          <button title="Delete" onClick={e => { e.stopPropagation(); onDeleteConnection(conn.id); }}><Icon name="trash" size={14} /></button>
        </div>
      </div>
    );
  };

  const renderFolder = (folder: Folder): React.ReactNode => {
    if (query && !folderHasMatch(folder.id)) return null;
    // While searching the tree is expanded regardless: a match hidden inside a
    // collapsed folder would look like no result at all.
    const isOpen = query ? true : expandedFolders.has(folder.id);
    const childFolders = getChildFolders(folder.id);
    const folderConns = matchingConns.filter(c => c.folderId === folder.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const siblings = getSiblings(folder);
    const sibIdx = siblings.findIndex(f => f.id === folder.id);
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
          <span className="tree-chevron"><Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} /></span>
          <Icon name={isOpen ? 'folderOpen' : 'folder'} size={15} color={folder.color || undefined} />
          <span className="folder-name">{folder.name}</span>
          <div className="actions" onClick={e => e.stopPropagation()}>
            <button title="Edit folder" onClick={() => setEditFolder(folder)}><Icon name="edit" size={13} /></button>
            <button title="Move up" disabled={sibIdx <= 0} onClick={() => moveFolderInOrder(folder, -1)}><Icon name="arrowUp" size={13} /></button>
            <button title="Move down" disabled={sibIdx >= siblings.length - 1} onClick={() => moveFolderInOrder(folder, 1)}><Icon name="arrowDown" size={13} /></button>
            <button title="New subfolder" onClick={() => onAddFolder(folder.id)}><Icon name="folder" size={13} /></button>
            <button title="Delete folder" onClick={() => onDeleteFolder(folder.id)}><Icon name="trash" size={13} /></button>
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

  const folderCtxItems: ContextMenuEntry[] = folderCtxMenu ? [
    { label: 'New subfolder', icon: 'folder', onClick: () => { onAddFolder(folderCtxMenu.folder.id); setFolderCtxMenu(null); } },
    { separator: true },
    { label: 'Edit (name & color)', icon: 'edit', onClick: () => { setEditFolder(folderCtxMenu.folder); setFolderCtxMenu(null); } },
    { separator: true },
    { label: 'Delete folder', icon: 'trash', onClick: () => { onDeleteFolder(folderCtxMenu.folder.id); setFolderCtxMenu(null); } },
  ] : [];

  const connCtxItems: ContextMenuEntry[] = connCtxMenu ? [
    { label: 'Connect', icon: 'play', disabled: connectedIds.has(connCtxMenu.conn.id) || connectingIds.has(connCtxMenu.conn.id), onClick: () => { onConnect(connCtxMenu.conn.id); setConnCtxMenu(null); } },
    { label: 'Disconnect', icon: 'power', disabled: !connectedIds.has(connCtxMenu.conn.id), onClick: () => { onDisconnect(connCtxMenu.conn.id); setConnCtxMenu(null); } },
    { separator: true },
    { label: 'Edit', icon: 'edit', shortcut: 'Alt+E', onClick: () => { onEditConnection(connCtxMenu.conn); setConnCtxMenu(null); } },
    { label: 'Clone', icon: 'duplicate', onClick: () => { onDuplicateConnection(connCtxMenu.conn); setConnCtxMenu(null); } },
    { separator: true },
    { label: 'Delete', icon: 'trash', onClick: () => { onDeleteConnection(connCtxMenu.conn.id); setConnCtxMenu(null); } },
  ] : [];

  // No backdrop-click dismissal here or in the modals opened from this one: a
  // stray click outside must not throw away a half-filled form or an import
  // selection. Close via the footer/X button or Esc.
  return (
    <div className="modal-overlay" style={{ zIndex: 1500 }}>
      <div className="modal conn-manager-modal" style={{ width }}>
        <div className="conn-manager-resize" onMouseDown={startResize} title="Drag to resize" />
        <div className="modal-header">
          <h3>Connections</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="secondary" title="Import connections from a Studio 3T .uri export" onClick={handlePickUriFile}>
              <Icon name="import" size={14} /> Import
            </button>
            <button className="secondary" title="New folder" onClick={() => onAddFolder()}><Icon name="folder" size={14} /> Folder</button>
            <button title="New connection" onClick={onAddConnection}><Icon name="plug" size={14} /> Connection</button>
            <button className="icon-btn" title="Close" onClick={onClose}><Icon name="close" size={15} /></button>
          </div>
        </div>

        <div className="conn-search-bar">
          <input
            className="db-search-input"
            placeholder="Search by name or host…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape' && search) { e.stopPropagation(); setSearch(''); } }}
          />
          {search && (
            <>
              <span className="conn-search-count">{matchingConns.length} of {connections.length}</span>
              <button className="icon-btn db-search-clear" title="Clear search" onClick={() => setSearch('')}>
                <Icon name="close" size={12} />
              </button>
            </>
          )}
        </div>

        <div
          className="modal-body conn-manager-body"
          onDragOver={e => { e.preventDefault(); setDragOver('root'); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={() => handleDrop(undefined)}
        >
          {query && matchingConns.length === 0 ? (
            <div className="conn-manager-empty">No connection matches “{search}”.</div>
          ) : connections.length === 0 && folders.length === 0 ? (
            <div className="conn-manager-empty">
              No saved connections yet.
              <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
                <button onClick={onAddConnection}><Icon name="plug" size={14} /> New connection</button>
                <button className="secondary" onClick={handlePickUriFile}><Icon name="import" size={14} /> Import .uri file</button>
              </div>
            </div>
          ) : (
            <>
              {getRootFolders().map(renderFolder)}
              <div className={`root-drop-area ${dragOver === 'root' ? 'drag-target' : ''}`}>
                {rootConns.map(renderConnection)}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
      </div>

      {folderCtxMenu && (
        <ContextMenu x={folderCtxMenu.x} y={folderCtxMenu.y} items={folderCtxItems} onClose={() => setFolderCtxMenu(null)} />
      )}
      {connCtxMenu && (
        <ContextMenu x={connCtxMenu.x} y={connCtxMenu.y} items={connCtxItems} onClose={() => setConnCtxMenu(null)} />
      )}
      {importPreview && (
        <ImportConnectionsModal
          items={importPreview.items}
          fileName={importPreview.fileName}
          existingUris={new Set(connections.map(c => c.uri))}
          onImport={async items => { await onImportConnections(items); setImportPreview(null); }}
          onClose={() => setImportPreview(null)}
        />
      )}
      {editFolder && (
        <FolderEditModal
          folder={editFolder}
          connectionCount={connections.filter(c => c.folderId === editFolder.id).length}
          onSave={(f, applyToConns) => {
            onSaveFolder(f);
            if (applyToConns && f.color) {
              connections.filter(c => c.folderId === f.id).forEach(c => onSaveConnection({ ...c, color: f.color }));
            }
          }}
          onClose={() => setEditFolder(null)}
        />
      )}
    </div>
  );
}
