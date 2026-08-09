import { describe, it, expect, beforeEach } from 'vitest';
import {
  cycleSort, buildSort, buildProjection, knownFields, toggleHidden,
  loadHiddenFields, saveHiddenFields, SORT_DIR_LABEL, SORT_DIR_HINT, sortTooltip, SortKey,
} from '../utils/docTable';

const asc = (field: string): SortKey => ({ field, dir: 1 });
const desc = (field: string): SortKey => ({ field, dir: -1 });

describe('cycleSort — plain click', () => {
  it('sorts ascending on the first click', () => {
    expect(cycleSort([], 'age')).toEqual([asc('age')]);
  });

  it('flips to descending on the second click', () => {
    expect(cycleSort([asc('age')], 'age')).toEqual([desc('age')]);
  });

  it('clears the sort on the third click', () => {
    expect(cycleSort([desc('age')], 'age')).toEqual([]);
  });

  it('replaces the whole key list when another column is clicked', () => {
    expect(cycleSort([desc('age')], 'name')).toEqual([asc('name')]);
  });

  it('collapses a multi-key sort back to the clicked column', () => {
    expect(cycleSort([desc('age'), asc('name')], 'age')).toEqual([asc('age')]);
  });
});

describe('cycleSort — shift click', () => {
  it('appends the field as a secondary key', () => {
    expect(cycleSort([asc('city')], 'age', true)).toEqual([asc('city'), asc('age')]);
  });

  it('flips only that key and keeps the order', () => {
    expect(cycleSort([asc('city'), asc('age')], 'city', true)).toEqual([desc('city'), asc('age')]);
  });

  it('drops the key on the third click, leaving the others', () => {
    expect(cycleSort([desc('city'), asc('age')], 'city', true)).toEqual([asc('age')]);
  });
});

describe('buildSort', () => {
  it('is null when nothing is sorted, so the caller can skip .sort()', () => {
    expect(buildSort([])).toBeNull();
  });

  it('keeps the key order — it is the sort precedence', () => {
    expect(Object.entries(buildSort([desc('city'), asc('age')])!)).toEqual([['city', -1], ['age', 1]]);
  });
});

describe('buildProjection', () => {
  it('is null when every field is visible', () => {
    expect(buildProjection([])).toBeNull();
  });

  it('excludes the hidden fields', () => {
    expect(buildProjection(['a', 'b'])).toEqual({ a: 0, b: 0 });
  });

  it('never excludes _id — edit and delete key off it', () => {
    expect(buildProjection(['_id'])).toBeNull();
    expect(buildProjection(['_id', 'a'])).toEqual({ a: 0 });
  });
});

describe('knownFields', () => {
  it('unions the keys of every document', () => {
    expect(knownFields([{ a: 1 }, { b: 2, c: 3 }], [])).toEqual(['a', 'b', 'c']);
  });

  it('keeps hidden fields listed even though no document returns them', () => {
    expect(knownFields([{ a: 1 }], ['secret'])).toEqual(['a', 'secret']);
  });

  it('does not duplicate a field that is both hidden and present', () => {
    expect(knownFields([{ a: 1 }], ['a'])).toEqual(['a']);
  });
});

describe('toggleHidden', () => {
  it('hides then shows again', () => {
    expect(toggleHidden([], 'a')).toEqual(['a']);
    expect(toggleHidden(['a'], 'a')).toEqual([]);
  });

  it('refuses to hide _id', () => {
    expect(toggleHidden([], '_id')).toEqual([]);
  });
});

describe('hidden-field persistence', () => {
  beforeEach(() => localStorage.clear());

  it('is empty when nothing was ever saved', () => {
    expect(loadHiddenFields('c', 'db', 'col')).toEqual([]);
  });

  it('is empty rather than throwing on malformed storage', () => {
    localStorage.setItem('hiddenFields', '{not json');
    expect(loadHiddenFields('c', 'db', 'col')).toEqual([]);
  });

  it('round-trips per collection without leaking across them', () => {
    saveHiddenFields('c', 'db', 'col1', ['a']);
    saveHiddenFields('c', 'db', 'col2', ['b']);
    expect(loadHiddenFields('c', 'db', 'col1')).toEqual(['a']);
    expect(loadHiddenFields('c', 'db', 'col2')).toEqual(['b']);
    expect(loadHiddenFields('other', 'db', 'col1')).toEqual([]);
  });

  it('drops the entry entirely once every field is visible again', () => {
    saveHiddenFields('c', 'db', 'col', ['a']);
    saveHiddenFields('c', 'db', 'col', []);
    expect(JSON.parse(localStorage.getItem('hiddenFields')!)).toEqual({});
  });
});

describe('sort labels', () => {
  it('spells out what each direction does to strings, numbers and dates', () => {
    expect(SORT_DIR_LABEL[1]).toBe('ascending');
    expect(SORT_DIR_HINT[1]).toBe('A→Z · 1→9 · oldest first');
    expect(SORT_DIR_LABEL[-1]).toBe('descending');
    expect(SORT_DIR_HINT[-1]).toBe('Z→A · 9→1 · newest first');
  });

  it('tells the header what a click will do next', () => {
    expect(sortTooltip('age', null)).toContain('Not sorted by age');
    expect(sortTooltip('age', null)).toContain('Click to sort ascending');
    expect(sortTooltip('age', 1)).toContain('Sorted ascending (A→Z · 1→9 · oldest first)');
    expect(sortTooltip('age', 1)).toContain('Click to sort descending');
    expect(sortTooltip('age', -1)).toContain('Click to remove the sort');
  });

  it('mentions the shift-click shortcut wherever it is shown', () => {
    expect(sortTooltip('age', 1)).toContain('Shift-click');
  });
});
