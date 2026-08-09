import { describe, it, expect, beforeEach } from 'vitest';
import { loadSession, saveSession } from '../utils/session';

const tab = (id: string) => ({
  id, type: 'documents' as const, title: id, collection: 'col', database: 'db', connectionId: 'conn',
});

describe('loadSession', () => {
  beforeEach(() => localStorage.clear());

  it('is null when nothing was ever saved', () => {
    expect(loadSession()).toBeNull();
  });

  it('is null rather than throwing on malformed storage', () => {
    localStorage.setItem('lastSession', '{not json');
    expect(loadSession()).toBeNull();
  });

  it('round-trips the tabs and the active tab', () => {
    const tabs = [tab('t1'), tab('t2')];
    saveSession(tabs, 't2');
    expect(loadSession()).toEqual({ tabs, activeTab: 't2' });
  });

  it('round-trips no active tab', () => {
    saveSession([], null);
    expect(loadSession()).toEqual({ tabs: [], activeTab: null });
  });
});
