import { describe, it, expect } from 'vitest';
import { fuzzyScore, scoreItem, filterItems, moveSelection, type PaletteItem } from '../utils/palette';

const item = (label: string, extra: Partial<PaletteItem> = {}): PaletteItem =>
  ({ id: label, kind: 'collection', label, run: () => {}, ...extra });

describe('fuzzyScore', () => {
  it('matches a subsequence, not just a substring', () => {
    expect(fuzzyScore('usr', 'users')).toBeGreaterThanOrEqual(0);
    expect(fuzzyScore('tdbusr', 'testdb.users')).toBeGreaterThanOrEqual(0);
  });

  it('rejects what is not there', () => {
    expect(fuzzyScore('xyz', 'users')).toBe(-1);
    expect(fuzzyScore('usersx', 'users')).toBe(-1);
  });

  it('ignores case', () => {
    expect(fuzzyScore('US', 'users')).toBeGreaterThanOrEqual(0);
  });

  it('matches everything when the query is empty', () => {
    expect(fuzzyScore('', 'whatever')).toBe(0);
    expect(fuzzyScore('   ', 'whatever')).toBe(0);
  });

  it('prefers a run of consecutive characters', () => {
    expect(fuzzyScore('use', 'users')).toBeGreaterThan(fuzzyScore('use', 'u_s_e_x'));
  });

  it('prefers a hit at a word start', () => {
    expect(fuzzyScore('u', 'users')).toBeGreaterThan(fuzzyScore('u', 'bucket'));
    expect(fuzzyScore('u', 'test.users')).toBeGreaterThan(fuzzyScore('u', 'bucket'));
  });

  it('prefers the shorter of two equally good texts', () => {
    expect(fuzzyScore('users', 'users')).toBeGreaterThan(fuzzyScore('users', 'users_audit_log'));
  });

  it('treats a space as a separator between terms', () => {
    expect(fuzzyScore('te us', 'testdb.users')).toBeGreaterThanOrEqual(0);
  });
});

describe('scoreItem', () => {
  it('finds the item through its sublabel', () => {
    expect(scoreItem('prod', item('users', { sublabel: 'prod / testdb' }))).toBeGreaterThanOrEqual(0);
  });

  it('finds it through keywords that are never shown', () => {
    expect(scoreItem('theme', item('Appearance', { keywords: 'theme colors icons' }))).toBeGreaterThanOrEqual(0);
  });

  it('ranks a label hit above a sublabel hit', () => {
    const inLabel = item('prod-users');
    const inSublabel = item('users', { sublabel: 'prod / testdb' });
    expect(scoreItem('prod', inLabel)).toBeGreaterThan(scoreItem('prod', inSublabel));
  });

  it('matches a query spanning sublabel and label', () => {
    expect(scoreItem('testdb users', item('users', { sublabel: 'prod / testdb' }))).toBeGreaterThanOrEqual(0);
  });
});

describe('filterItems', () => {
  const items = [item('orders'), item('users'), item('users_audit'), item('logs')];

  it('keeps the caller order when nothing is typed', () => {
    expect(filterItems(items, '').map(i => i.label)).toEqual(['orders', 'users', 'users_audit', 'logs']);
  });

  it('drops what does not match', () => {
    expect(filterItems(items, 'user').map(i => i.label)).toEqual(['users', 'users_audit']);
  });

  it('puts the best match first', () => {
    expect(filterItems(items, 'users')[0].label).toBe('users');
  });

  it('breaks ties by the original order, so the list does not jitter', () => {
    const tied = [item('aaa'), item('aab')];
    expect(filterItems(tied, 'aa').map(i => i.label)).toEqual(['aaa', 'aab']);
  });

  it('caps how much it returns', () => {
    const many = Array.from({ length: 100 }, (_, i) => item(`col${i}`));
    expect(filterItems(many, 'col', 10)).toHaveLength(10);
    expect(filterItems(many, '', 10)).toHaveLength(10);
  });
});

describe('moveSelection', () => {
  it('moves within the list', () => {
    expect(moveSelection(0, 1, 3)).toBe(1);
    expect(moveSelection(2, -1, 3)).toBe(1);
  });

  it('wraps at both ends', () => {
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(moveSelection(0, -1, 3)).toBe(2);
  });

  it('stays at 0 for an empty list', () => {
    expect(moveSelection(0, 1, 0)).toBe(0);
  });
});
