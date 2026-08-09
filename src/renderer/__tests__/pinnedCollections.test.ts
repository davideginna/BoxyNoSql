import { describe, it, expect, beforeEach } from 'vitest';
import { loadPinned, savePinned, isPinned, togglePinned, PinnedCollection } from '../utils/pinnedCollections';

const pin = (connectionId: string, db: string, col: string): PinnedCollection => ({ connectionId, db, col });

describe('loadPinned', () => {
  beforeEach(() => localStorage.clear());

  it('is empty when nothing was ever saved', () => {
    expect(loadPinned()).toEqual([]);
  });

  it('is empty rather than throwing on malformed storage', () => {
    localStorage.setItem('pinnedCollections', '{not json');
    expect(loadPinned()).toEqual([]);
  });

  it('round-trips whatever was saved', () => {
    const pins = [pin('a', 'db1', 'col1'), pin('b', 'db2', 'col2')];
    savePinned(pins);
    expect(loadPinned()).toEqual(pins);
  });
});

describe('isPinned', () => {
  const pins = [pin('a', 'db1', 'col1')];

  it('matches on connection, database and collection together', () => {
    expect(isPinned(pins, 'a', 'db1', 'col1')).toBe(true);
  });

  it('does not match a same-named collection under a different connection or database', () => {
    expect(isPinned(pins, 'b', 'db1', 'col1')).toBe(false);
    expect(isPinned(pins, 'a', 'db2', 'col1')).toBe(false);
    expect(isPinned(pins, 'a', 'db1', 'col2')).toBe(false);
  });
});

describe('togglePinned', () => {
  it('pins a collection that was not pinned', () => {
    const next = togglePinned([], 'a', 'db1', 'col1');
    expect(next).toEqual([pin('a', 'db1', 'col1')]);
  });

  it('unpins a collection that was already pinned, leaving the rest untouched', () => {
    const pins = [pin('a', 'db1', 'col1'), pin('a', 'db1', 'col2')];
    const next = togglePinned(pins, 'a', 'db1', 'col1');
    expect(next).toEqual([pin('a', 'db1', 'col2')]);
  });

  it('does not mutate the array passed in', () => {
    const pins = [pin('a', 'db1', 'col1')];
    togglePinned(pins, 'a', 'db1', 'col2');
    expect(pins).toEqual([pin('a', 'db1', 'col1')]);
  });
});
