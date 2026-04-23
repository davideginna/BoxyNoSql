import { useState, useEffect, useRef, useCallback } from 'react';
import ContextMenu, { ContextMenuEntry } from './ContextMenu';
import DocumentsView from './DocumentsView';
import QueryTerminal from './QueryTerminal';
import AggregationBuilder from './AggregationBuilder';
import IndexesView from './IndexesView';
import StatsView from './StatsView';

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
}

interface MainContentProps {
  tabs: Tab[];
  activeTab: string | null;
  selectedConnection: string | null;
  connections: Connection[];
  onOpenTab: (type: Tab['type'], title: string, dbName?: string, collection?: string) => void;
  onCloseTab: (tabId: string) => void;
  onSwitchTab: (tabId: string) => void;
  onChangeTabType: (tabId: string, type: Tab['type']) => void;
  activeTabData: Tab | undefined;
}

const VIEW_TYPES: { type: Tab['type']; label: string }[] = [
  { type: 'documents', label: '📄 Documents' },
  { type: 'query', label: '🔍 Query' },
  { type: 'aggregation', label: '⚙️ Aggregation' },
  { type: 'indexes', label: '📑 Indexes' },
  { type: 'stats', label: '📊 Stats' },
];

const TAB_HEIGHT = 32;
const MAX_ROWS = 3;

export default function MainContent({
  tabs, activeTab, selectedConnection, connections,
  onOpenTab: _onOpenTab, onCloseTab, onSwitchTab, onChangeTabType, activeTabData
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
    { label: '✕  Close tab', onClick: () => onCloseTab(tabId) },
    { label: '✕  Close all', onClick: closeAll },
    { label: '✕  Close others', onClick: () => closeOthers(tabId) },
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
    return (
      <div className="main-content">
        <div className="welcome-screen">
          <h1>BoxyNoSql</h1>
          <p>Select a collection from the sidebar to get started</p>
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
          const tabStyle = isActive ? {
            background: `color-mix(in srgb, ${color} 35%, var(--bg-primary))`,
            borderTopColor: color,
            color: '#fff',
          } : {
            background: `color-mix(in srgb, ${color} 12%, var(--bg-secondary))`,
            borderTopColor: 'transparent',
          };
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
              <span className="close-btn" onClick={e => { e.stopPropagation(); onCloseTab(tab.id); }}>✕</span>
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
          {VIEW_TYPES.map(({ type, label }) => (
            <button
              key={type}
              className={activeTabData.type === type ? 'active' : ''}
              onClick={() => onChangeTabType(activeTab!, type)}
            >
              {label}
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
