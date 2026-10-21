import { describe, it, expect } from 'vitest';
import { lineOfPath, lineAt } from '../utils/jsonLines';
import { prettyDoc } from '../utils/editableJson';

const TEXT = prettyDoc({
  _id: { $oid: '650000000000000000000001' },
  name: 'Ada',
  address: { city: 'Rome', zip: '00100' },
  tags: [{ name: 'in array' }],
  createdAt: { $date: '2024-01-01T00:00:00.000Z' },
});
// 1 {
// 2   "_id": ObjectId("…"),
// 3   "name": "Ada",
// 4   "address": {
// 5     "city": "Rome",
// 6     "zip": "00100"
// 7   },
// 8   "tags": [
// 9     {
// 10      "name": "in array"
// 11    }
// 12  ],
// 13  "createdAt": ISODate("…")
// 14 }

describe('lineOfPath', () => {
  it('finds top-level and nested keys', () => {
    expect(lineOfPath(TEXT, 'name')).toBe(3);
    expect(lineOfPath(TEXT, 'address')).toBe(4);
    expect(lineOfPath(TEXT, 'address.zip')).toBe(6);
  });

  it('does not match a same-named key inside an array', () => {
    expect(lineOfPath(TEXT, 'tags')).toBe(8);
    expect(lineOfPath(TEXT, 'tags.name')).toBe(8);
  });

  it('resolves a path into a shell-style value to the key that holds it', () => {
    expect(lineOfPath(TEXT, '_id.$oid')).toBe(2);
    expect(lineOfPath(TEXT, 'createdAt.$date')).toBe(13);
  });

  it('is line 1 for the root and null for a path that is not there', () => {
    expect(lineOfPath(TEXT, '(root)')).toBe(1);
    expect(lineOfPath(TEXT, 'missing')).toBeNull();
  });

  it('is not fooled by a key-like string value or an escaped quote', () => {
    const t = '{\n  "a": "zip: \\"x\\"",\n  "zip": 1\n}';
    expect(lineOfPath(t, 'zip')).toBe(3);
  });
});

describe('lineAt', () => {
  it('returns the trimmed line and its offsets', () => {
    const l = lineAt(TEXT, 3)!;
    expect(l.text).toBe('"name": "Ada",');
    expect(TEXT.slice(l.start, l.end)).toBe('"name": "Ada",');
  });

  it('is null past the last line', () => {
    expect(lineAt(TEXT, 99)).toBeNull();
  });
});
