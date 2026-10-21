import { describe, it, expect, beforeEach } from 'vitest';
import { loadSession, saveSession, sessionConnectionIds, loadRestoreSession, saveRestoreSession } from '../utils/session';

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
    expect(loadSession()).toEqual({ tabs, activeTab: 't2', connectionIds: [] });
  });

  it('round-trips no active tab', () => {
    saveSession([], null);
    expect(loadSession()).toEqual({ tabs: [], activeTab: null, connectionIds: [] });
  });
});

describe('restoreSession setting', () => {
  beforeEach(() => localStorage.clear());

  it('is on by default', () => {
    expect(loadRestoreSession()).toBe(true);
  });

  it('round-trips off and on', () => {
    saveRestoreSession(false);
    expect(loadRestoreSession()).toBe(false);
    saveRestoreSession(true);
    expect(loadRestoreSession()).toBe(true);
  });
});

describe('sessionConnectionIds', () => {
  beforeEach(() => localStorage.clear());

  it('keeps a connection that had no open tab', () => {
    saveSession([], null, ['a', 'b']);
    expect(sessionConnectionIds(loadSession()!)).toEqual(['a', 'b']);
  });

  it('merges the saved connections with those the tabs need, without duplicates', () => {
    saveSession([tab('t1')], 't1', ['a', 'conn']);
    expect(sessionConnectionIds(loadSession()!)).toEqual(['a', 'conn']);
  });

  it('falls back to the tabs for a snapshot saved before connectionIds existed', () => {
    localStorage.setItem('lastSession', JSON.stringify({ tabs: [tab('t1')], activeTab: 't1' }));
    expect(sessionConnectionIds(loadSession()!)).toEqual(['conn']);
  });
});
