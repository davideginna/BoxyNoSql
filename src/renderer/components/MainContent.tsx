import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import ContextMenu, { ContextMenuEntry } from './ContextMenu';
import Icon, { IconName } from './Icon';
import DocumentsView from './DocumentsView';
import QueryTerminal from './QueryTerminal';
import AggregationBuilder from './AggregationBuilder';
import IndexesView from './IndexesView';
import StatsView from './StatsView';
import { DEFAULT_CONNECTION_COLOR } from '../utils/iconColors';

interface Tab {
  id: string;
  type: 'documents' | 'query' | 'aggregation' | 'indexes' | 'stats';
  title: string;
  collection?: string;
  database?: string;
  connectionId?: string;
}

interface Connection {
  id: string; name: string; uri: string;
  folderId?: string; color?: string; order?: number;
  lastConnectedAt?: number;
}

interface Folder { id: string; name: string; color?: string; }

interface MainContentProps {
  tabs: Tab[];
  activeTab: string | null;
  selectedConnection: string | null;
  connections: Connection[];
  folders: Folder[];
  onOpenTab: (type: Tab['type'], title: string, dbName?: string, collection?: string) => void;
  onCloseTab: (tabId: string) => void;
  onSwitchTab: (tabId: string) => void;
  onChangeTabType: (tabId: string, type: Tab['type']) => void;
  activeTabData: Tab | undefined;
  onAddConnection: () => void;
  onQuickConnect: () => void;
  onOpenConnections: () => void;
  onConnect: (id: string) => void;
  hasConnectedConnections: boolean;
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

const VIEW_TYPES: { type: Tab['type']; label: string; icon: IconName }[] = [
  { type: 'documents', label: 'Documents', icon: 'doc' },
  { type: 'query', label: 'Query', icon: 'search' },
  { type: 'aggregation', label: 'Aggregation', icon: 'gear' },
  { type: 'indexes', label: 'Indexes', icon: 'tabs' },
  { type: 'stats', label: 'Stats', icon: 'stats' },
];

const TAB_HEIGHT = 32;
const MAX_ROWS = 3;

export default function MainContent({
  tabs, activeTab, selectedConnection, connections, folders,
  onOpenTab: _onOpenTab, onCloseTab, onSwitchTab, onChangeTabType, activeTabData,
  onAddConnection, onQuickConnect, onOpenConnections, onConnect, hasConnectedConnections,
}: MainContentProps) {
  // Per-tab result buffers keyed by tabId so they survive tab switching
  const [aggregationResults, setAggregationResults] = useState<Record<string, any[]>>({});
  const [queryResults, setQueryResults] = useState<Record<string, any[]>>({});
  const [statsMap, setStatsMap] = useState<Record<string, any>>({});
  // Track which (tabId, viewType) pairs have ever been mounted — keep them mounted
  const [mountedViews, setMountedViews] = useState<Record<string, Set<string>>>({});
  const [tabsOverflow, setTabsOverflow] = useState(false);
  const [tabCtxMenu, setTabCtxMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Mark active (tabId, type) as mounted
  useEffect(() => {
    if (!activeTabData) return;
    setMountedViews(prev => {
      const existing = prev[activeTabData.id] || new Set<string>();
      if (existing.has(activeTabData.type)) return prev;
      const next = new Set(existing); next.add(activeTabData.type);
      return { ...prev, [activeTabData.id]: next };
    });
  }, [activeTab, activeTabData?.type]);

  // GC mountedViews when tabs close
  useEffect(() => {
    const alive = new Set(tabs.map(t => t.id));
    setMountedViews(prev => {
      const kept: Record<string, Set<string>> = {};
      let changed = false;
      for (const [k, v] of Object.entries(prev)) {
        if (alive.has(k)) kept[k] = v; else changed = true;
      }
      return changed ? kept : prev;
    });
    setQueryResults(prev => {
      const kept: Record<string, any[]> = {};
      for (const [k, v] of Object.entries(prev)) if (alive.has(k)) kept[k] = v;
      return kept;
    });
    setAggregationResults(prev => {
      const kept: Record<string, any[]> = {};
      for (const [k, v] of Object.entries(prev)) if (alive.has(k)) kept[k] = v;
      return kept;
    });
    setStatsMap(prev => {
      const kept: Record<string, any> = {};
      for (const [k, v] of Object.entries(prev)) if (alive.has(k)) kept[k] = v;
      return kept;
    });
  }, [tabs]);

  const closeAll = useCallback(() => {
    tabs.forEach(t => onCloseTab(t.id));
  }, [tabs, onCloseTab]);

  const closeOthers = useCallback((tabId: string) => {
    tabs.filter(t => t.id !== tabId).forEach(t => onCloseTab(t.id));
  }, [tabs, onCloseTab]);

  const buildTabCtxItems = useCallback((tabId: string): ContextMenuEntry[] => [
    { label: 'Close tab', icon: 'close', shortcut: 'Ctrl+W', onClick: () => onCloseTab(tabId) },
    { label: 'Close all', icon: 'close', onClick: closeAll },
    { label: 'Close others', icon: 'close', onClick: () => closeOthers(tabId) },
  ], [onCloseTab, closeAll, closeOthers]);

  const connColorMap: Record<string, string> = {};
  connections.forEach(c => { if (c.color) connColorMap[c.id] = c.color; });

  const loadData = async () => {
    if (!activeTabData || !selectedConnection) return;
    const { id, type, database, collection } = activeTabData;
    if (!database || !collection) return;
    try {
      if (type === 'stats') {
        const s = await (window as any).electron.invoke('get-collection-stats', selectedConnection, database, collection);
        setStatsMap(prev => ({ ...prev, [id]: s }));
      }
    } catch (err) { console.error('Error loading data:', err); }
  };

  useEffect(() => { loadData(); }, [activeTab, selectedConnection, activeTabData?.type]);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    setTabsOverflow(el.scrollHeight > MAX_ROWS * TAB_HEIGHT + 2);
  }, [tabs.length]);

  if (!activeTabData) {
    const isFirstRun = connections.length === 0;
    const recent = connections
      .filter(c => c.lastConnectedAt)
      .sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      .slice(0, 10);
    return (
      <div className="main-content">
        <div className="welcome-screen">
          <h1>BoxyNoSql</h1>
          {isFirstRun ? (
            <>
              <p>Connect to a MongoDB server to get started</p>
              <div className="welcome-actions">
                <button onClick={onAddConnection}><Icon name="plug" size={14} /> Add a connection</button>
                <button className="secondary" onClick={onQuickConnect}>
                  <Icon name="play" size={14} /> Quick connect: mongodb://localhost:27017
                </button>
              </div>
            </>
          ) : !hasConnectedConnections ? (
            recent.length > 0 ? (
              <>
                <p>Not connected to any server — pick a recent connection</p>
                <div className="welcome-recent">
                  {recent.map(c => {
                    const folder = c.folderId ? folders.find(f => f.id === c.folderId) : undefined;
                    const connColor = c.color || DEFAULT_CONNECTION_COLOR;
                    return (
                      <button
                        key={c.id}
                        className="welcome-recent-item"
                        style={{ '--recent-border': connColor } as CSSProperties}
                        onClick={() => onConnect(c.id)}
                      >
                        <Icon name="plug" size={14} color={connColor} />
                        <span className="welcome-recent-name">{c.name}</span>
                        {folder && (
                          <span className="welcome-recent-folder" style={{ color: folder.color || undefined }}>
                            <Icon name="folder" size={11} color={folder.color || undefined} /> {folder.name}
                          </span>
                        )}
                        <span className="welcome-recent-time">{formatRelativeTime(c.lastConnectedAt!)}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="welcome-actions">
                  <button className="secondary" onClick={onOpenConnections}><Icon name="plug" size={14} /> Open connections</button>
                </div>
              </>
            ) : (
              <>
                <p>Not connected to any server</p>
                <div className="welcome-actions">
                  <button onClick={onOpenConnections}><Icon name="plug" size={14} /> Open connections</button>
                </div>
              </>
            )
          ) : (
            <p>Select a collection from the sidebar to get started</p>
          )}
        </div>
      </div>
    );
  }

  const hasCollection = !!(activeTabData.collection && activeTabData.database);

  const renderPane = (tab: Tab, viewType: Tab['type']) => {
    const { connectionId, database, collection, id } = tab;
    const connId = connectionId || selectedConnection || '';
    if (!database || !collection) return null;
    switch (viewType) {
      case 'documents':
        return <DocumentsView connectionId={connId} database={database} collection={collection} />;
      case 'query':
        return <QueryTerminal
          connectionId={connId} database={database} collection={collection}
          result={queryResults[id] || []}
          setResult={r => setQueryResults(prev => ({ ...prev, [id]: r }))}
        />;
      case 'aggregation':
        return <AggregationBuilder
          connectionId={connId} database={database} collection={collection}
          result={aggregationResults[id] || []}
          setResult={r => setAggregationResults(prev => ({ ...prev, [id]: r }))}
        />;
      case 'indexes':
        return <IndexesView connectionId={connId} database={database} collection={collection} />;
      case 'stats':
        return <StatsView stats={statsMap[id]} />;
      default:
        return null;
    }
  };

  return (
    <div className="main-content">
      <div
        ref={tabsRef}
        className="tabs-header"
        style={{ maxHeight: MAX_ROWS * TAB_HEIGHT, overflow: 'hidden' }}
      >
        {tabs.map(tab => {
          const color = tab.connectionId ? (connColorMap[tab.connectionId] || 'var(--accent)') : 'var(--accent)';
          const isActive = activeTab === tab.id;
          // Only the raw connection colour crosses into CSS. Every mix, the
          // label colour and the hover state are theme-aware rules in
          // index.css (── Tabs ──) — an inline `background` here would beat
          // `.tab:hover`, and an inline `color` would hide the fact that the
          // catch-all `button:not(…)` rule was overriding `.tab`'s own.
          const tabStyle = { '--tab-tint': color } as CSSProperties;
          return (
            <button
              key={tab.id}
              className={`tab ${isActive ? 'active' : ''}`}
              style={tabStyle}
              onClick={() => onSwitchTab(tab.id)}
              onContextMenu={e => { e.preventDefault(); onSwitchTab(tab.id); setTabCtxMenu({ x: e.clientX, y: e.clientY, tabId: tab.id }); }}
              onAuxClick={e => { if (e.button === 1) { e.preventDefault(); onCloseTab(tab.id); } }}
            >
              <span className="tab-title">{tab.title}</span>
              <span className="close-btn" onClick={e => { e.stopPropagation(); onCloseTab(tab.id); }}><Icon name="close" size={12} /></span>
            </button>
          );
        })}
      </div>
      {tabsOverflow && (
        <div className="tabs-overflow-msg">
          Max tab rows reached — close some tabs to open more
        </div>
      )}
      {hasCollection && (
        <div className="view-switcher">
          {VIEW_TYPES.map(({ type, label, icon }) => (
            <button
              key={type}
              className={activeTabData.type === type ? 'active' : ''}
              onClick={() => onChangeTabType(activeTab!, type)}
            >
              <Icon name={icon} size={13} /> {label}
            </button>
          ))}
        </div>
      )}
      <div className="tab-content" style={{ position: 'relative' }}>
        {tabs.map(tab => {
          const mountedTypes = mountedViews[tab.id] || new Set<string>([tab.type]);
          const tabActive = tab.id === activeTab;
          return (
            <div
              key={tab.id}
              style={{
                display: tabActive ? 'flex' : 'none',
                flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden',
              }}
            >
              {Array.from(mountedTypes).map(viewType => {
                const viewActive = tabActive && viewType === tab.type;
                return (
                  <div
                    key={viewType}
                    style={{
                      display: viewActive ? 'flex' : 'none',
                      flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden',
                    }}
                  >
                    {renderPane(tab, viewType as Tab['type'])}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {tabCtxMenu && (
        <ContextMenu
          x={tabCtxMenu.x}
          y={tabCtxMenu.y}
          items={buildTabCtxItems(tabCtxMenu.tabId)}
          onClose={() => setTabCtxMenu(null)}
        />
      )}
    </div>
  );
}
