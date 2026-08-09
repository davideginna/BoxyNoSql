import { describe, it, expect } from 'vitest';
import {
  csvEscape, csvRow, collectKeys, defaultFileName, dialogFilters, createChunkWriter,
} from '../exportFormat';

describe('csvEscape', () => {
  it('leaves a plain value alone', () => {
    expect(csvEscape('abc')).toBe('abc');
    expect(csvEscape(42)).toBe('42');
  });

  it('writes null and undefined as an empty cell', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('quotes commas, quotes and newlines, doubling the quotes', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('one\ntwo')).toBe('"one\ntwo"');
  });

  it('JSON-encodes objects and arrays', () => {
    expect(csvEscape({ $oid: 'x' })).toBe('"{""$oid"":""x""}"');
    expect(csvEscape([1, 2])).toBe('"[1,2]"');
  });
});

describe('csvRow', () => {
  it('joins escaped values', () => {
    expect(csvRow(['a', 'b,c', null])).toBe('a,"b,c",');
  });
});

describe('collectKeys', () => {
  it('unions the keys in first-seen order', () => {
    expect([...collectKeys([{ b: 1 }, { a: 2, b: 3 }, { c: 4 }])]).toEqual(['b', 'a', 'c']);
  });

  it('accumulates across calls, which is how the streaming pass builds them', () => {
    const keys = collectKeys([{ a: 1 }]);
    collectKeys([{ b: 2 }], keys);
    expect([...keys]).toEqual(['a', 'b']);
  });

  it('ignores non-objects', () => {
    expect([...collectKeys([null, 3, 'x', { a: 1 }] as any)]).toEqual(['a']);
  });
});

describe('defaultFileName', () => {
  const day = new Date('2026-08-09T10:00:00Z');

  it('stamps the collection, the day and the extension', () => {
    expect(defaultFileName('users', 'json', false, day)).toBe('users-2026-08-09.json');
    expect(defaultFileName('users', 'ndjson', false, day)).toBe('users-2026-08-09.ndjson');
  });

  it('marks a filtered export so it cannot be mistaken for the whole collection', () => {
    expect(defaultFileName('users', 'csv', true, day)).toBe('users-filtered-2026-08-09.csv');
  });

  it('strips characters that have no business in a file name', () => {
    expect(defaultFileName('my coll/name', 'json', false, day)).toBe('my_coll_name-2026-08-09.json');
  });
});

describe('dialogFilters', () => {
  it('offers the format first and "All files" as an escape hatch', () => {
    expect(dialogFilters('csv')).toEqual([
      { name: 'CSV', extensions: ['csv'] },
      { name: 'All files', extensions: ['*'] },
    ]);
  });
});

const render = (format: 'json' | 'ndjson' | 'csv', docs: any[], keys?: string[]) => {
  const w = createChunkWriter(format, keys);
  return w.head() + docs.map(w.row).join('') + w.tail();
};

describe('createChunkWriter — ndjson', () => {
  it('writes one document per line', () => {
    expect(render('ndjson', [{ a: 1 }, { b: 2 }])).toBe('{"a":1}\n{"b":2}\n');
  });

  it('writes nothing at all for an empty result', () => {
    expect(render('ndjson', [])).toBe('');
  });
});

describe('createChunkWriter — json', () => {
  it('produces a valid array whatever the document count', () => {
    const out = render('json', [{ a: 1 }, { b: 2 }]);
    expect(JSON.parse(out)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('closes an empty export as an empty array, not as a broken one', () => {
    expect(JSON.parse(render('json', []))).toEqual([]);
  });

  it('indents the documents inside the array', () => {
    expect(render('json', [{ a: 1 }])).toBe('[\n  {\n    "a": 1\n  }\n]\n');
  });
});

describe('createChunkWriter — csv', () => {
  it('writes the header once, then one row per document', () => {
    expect(render('csv', [{ a: 1, b: 'x' }, { a: 2, b: 'y' }], ['a', 'b']))
      .toBe('a,b\n1,x\n2,y\n');
  });

  it('leaves a missing field empty instead of shifting the row', () => {
    expect(render('csv', [{ a: 1 }], ['a', 'b'])).toBe('a,b\n1,\n');
  });

  it('writes nothing when there are no columns', () => {
    expect(render('csv', [], [])).toBe('');
  });
});
