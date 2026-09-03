import { describe, it, expect, beforeEach } from 'vitest';
import { loadHiddenRecents, saveHiddenRecents, isHiddenRecent, hideRecent } from '../utils/recentConnections';

describe('loadHiddenRecents', () => {
  beforeEach(() => localStorage.clear());

  it('is empty when nothing was ever saved', () => {
    expect(loadHiddenRecents()).toEqual({});
  });

  it('is empty rather than throwing on malformed storage', () => {
    localStorage.setItem('hiddenRecents', '{not json');
    expect(loadHiddenRecents()).toEqual({});
  });

  it('round-trips whatever was saved', () => {
    const hidden = { a: 100, b: 200 };
    saveHiddenRecents(hidden);
    expect(loadHiddenRecents()).toEqual(hidden);
  });
});

describe('hideRecent', () => {
  it('records the connection at its current lastConnectedAt', () => {
    expect(hideRecent({}, 'a', 100)).toEqual({ a: 100 });
  });

  it('leaves other entries untouched', () => {
    expect(hideRecent({ b: 50 }, 'a', 100)).toEqual({ a: 100, b: 50 });
  });

  it('does not mutate the object passed in', () => {
    const hidden = { a: 50 };
    hideRecent(hidden, 'a', 100);
    expect(hidden).toEqual({ a: 50 });
  });
});

describe('isHiddenRecent', () => {
  it('is false for a connection never hidden', () => {
    expect(isHiddenRecent({}, 'a', 100)).toBe(false);
  });

  it('is true while lastConnectedAt has not moved past the hidden mark', () => {
    expect(isHiddenRecent({ a: 100 }, 'a', 100)).toBe(true);
  });

  it('reappears once a later connect bumps lastConnectedAt past the hidden mark', () => {
    expect(isHiddenRecent({ a: 100 }, 'a', 200)).toBe(false);
  });

  it('is false when lastConnectedAt is missing — nothing to compare the mark to', () => {
    expect(isHiddenRecent({ a: 100 }, 'a', undefined)).toBe(false);
  });
});
