import { describe, it, expect } from 'vitest';
import { clipStrings, previewJson, queryLine } from '../utils/previewJson';

describe('clipStrings', () => {
  it('cuts long strings to max + ellipsis', () => {
    expect(clipStrings('x'.repeat(100), 10)).toBe('x'.repeat(10) + '…');
  });
  it('leaves short strings, numbers, booleans and null alone', () => {
    expect(clipStrings('abc', 10)).toBe('abc');
    expect(clipStrings(42, 10)).toBe(42);
    expect(clipStrings(true, 10)).toBe(true);
    expect(clipStrings(null, 10)).toBe(null);
  });
  it('walks nested objects and arrays', () => {
    const long = 'y'.repeat(50);
    expect(clipStrings({ $and: [{ city: { $regex: long } }, { tags: { $in: [long, 'ok'] } }] }, 8)).toEqual({
      $and: [{ city: { $regex: 'yyyyyyyy…' } }, { tags: { $in: ['yyyyyyyy…', 'ok'] } }],
    });
  });
  it('clips a long key too', () => {
    expect(Object.keys(clipStrings({ ['k'.repeat(20)]: 1 }, 3) as object)).toEqual(['kkk…']);
  });
  it('does not mutate its input', () => {
    const doc = { a: 'z'.repeat(20) };
    clipStrings(doc, 3);
    expect(doc.a).toHaveLength(20);
  });
});

describe('previewJson', () => {
  it('keeps the JSON shape with the value clipped', () => {
    const out = previewJson({ city: { $regex: 'a'.repeat(5000), $options: 'i' } });
    expect(out.length).toBeLessThan(120);
    expect(out).toContain('"$options":"i"');
    expect(out).toContain('…');
  });
  it('indents like JSON.stringify', () => {
    expect(previewJson({ a: 1 }, 2)).toBe('{\n  "a": 1\n}');
  });
});

describe('queryLine', () => {
  it('joins filter and sort', () => {
    expect(queryLine({ a: 1 }, { b: -1 })).toBe('{"a":1} · sort {"b":-1}');
  });
  it('omits empty parts', () => {
    expect(queryLine({}, { b: 1 })).toBe('sort {"b":1}');
    expect(queryLine({ a: 1 }, null)).toBe('{"a":1}');
    expect(queryLine(null, undefined)).toBe('');
  });
  it('stays short for a huge value', () => {
    expect(queryLine({ city: 'x'.repeat(10000) }, null).length).toBeLessThan(100);
  });
});
