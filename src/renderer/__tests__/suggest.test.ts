import { describe, it, expect } from 'vitest';
import { filterSuggestions, moveHighlight } from '../utils/suggest';

describe('filterSuggestions', () => {
  const items = ['read', 'readWrite', 'dbAdmin', 'readAnyDatabase', 'userAdmin'];
  it('keeps everything for empty text', () => {
    expect(filterSuggestions(items, '  ')).toEqual(items);
  });
  it('puts prefix matches first, then substring matches, case-insensitively', () => {
    expect(filterSuggestions(items, 'ADMIN')).toEqual(['dbAdmin', 'userAdmin']);
    expect(filterSuggestions(['xread', 'read'], 'read')).toEqual(['read', 'xread']);
  });
  it('returns nothing when nothing matches', () => {
    expect(filterSuggestions(items, 'zzz')).toEqual([]);
  });
});

describe('moveHighlight', () => {
  it('starts at the first or last entry', () => {
    expect(moveHighlight(-1, 1, 3)).toBe(0);
    expect(moveHighlight(-1, -1, 3)).toBe(2);
  });
  it('wraps around', () => {
    expect(moveHighlight(2, 1, 3)).toBe(0);
    expect(moveHighlight(0, -1, 3)).toBe(2);
  });
  it('has nothing to highlight in an empty list', () => {
    expect(moveHighlight(0, 1, 0)).toBe(-1);
  });
});
