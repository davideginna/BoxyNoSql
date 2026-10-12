import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from '../components/Sidebar';
import { DEFAULT_ICON_SETTINGS } from '../utils/iconColors';

const CONN = { id: 'c1', name: 'local', uri: 'mongodb://localhost:27017' };

const CALLBACKS = [
  'onOpenManager',
  'onOpenSettings',
  'onOpenAbout',
  'onOpenShortcuts',
  'onSelectConnection',
  'onDisconnect',
  'onExpandDb',
  'onSelectCollection',
  'onExpandAll',
  'onLoadAllCollections',
  'onCollapseAll',
  'onRefreshTree',
  'onRefreshDb',
  'onCreateDatabase',
  'onCreateCollection',
  'onDropCollection',
  'onRenameCollection',
  'onDuplicateCollection',
  'onCopyCollectionName',
  'onClearCollection',
  'onDropDatabase',
  'onClearDatabase',
  'onManageUsers',
  'onImportDocuments',
  'onImportCollection',
  'onImportDatabase',
  'onImportCsvDocuments',
  'onImportCsvCollection',
  'onTogglePin',
  'onCopyCollection',
  'onPasteCollection',
  'onCopyDatabase',
  'onPasteDatabase',
  'onThemeChange',
];

// Every on* callback is a spy; only the data props matter here.
function renderSidebar(collections: Record<string, string[]>, overrides: Record<string, any> = {}) {
  const data: Record<string, any> = {
    connections: [CONN], folders: [], selectedConnection: 'c1',
    collapsedConns: new Set(), connectedIds: new Set(['c1']), connectingIds: new Set(),
    databases: { c1: ['shop', 'logs', 'admin'] },
    expandedDbs: { c1: new Set() },
    collections: { c1: collections },
    selectedCollection: null, theme: 'dark', iconSettings: DEFAULT_ICON_SETTINGS,
    refreshing: false, pinnedCollections: [], collectionClipboard: null, databaseClipboard: null,
    connectionHealth: {},
    ...overrides,
  };
  const props: Record<string, any> = { ...Object.fromEntries(CALLBACKS.map(n => [n, vi.fn()])), ...data };
  render(<Sidebar {...(props as any)} />);
  return props;
}

const search = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText('Search databases and collections…'), { target: { value } });

describe('Sidebar — collection search', () => {
  it('asks for every collection list as soon as a term is typed, not before', () => {
    const props = renderSidebar({});
    expect(props.onLoadAllCollections).not.toHaveBeenCalled();
    search('ord');
    expect(props.onLoadAllCollections).toHaveBeenCalledWith('c1');
  });

  it('does not fetch on a blank term (clearing the box)', () => {
    const props = renderSidebar({});
    search('   ');
    expect(props.onLoadAllCollections).not.toHaveBeenCalled();
  });

  it('opens a collapsed database that holds a matching collection, showing only the matches', () => {
    renderSidebar({ shop: ['orders', 'customers'], logs: ['events'] });
    expect(screen.queryByText('orders')).toBeNull(); // collapsed

    search('ORD');
    expect(screen.getByText('shop')).toBeInTheDocument();
    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(screen.queryByText('customers')).toBeNull();
    // No database name nor collection in them matches.
    expect(screen.queryByText('logs')).toBeNull();
    expect(screen.queryByText('admin')).toBeNull();
  });

  it('still matches a database by its own name, without opening it', () => {
    renderSidebar({ shop: ['orders'], logs: ['events'] });
    search('log');
    expect(screen.getByText('logs')).toBeInTheDocument();
    expect(screen.queryByText('events')).toBeNull();
    expect(screen.queryByText('shop')).toBeNull();
  });
});
