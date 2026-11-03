import { describe, it, expect } from 'vitest';
import {
  valueKind, containerSummary, editText, parseEditValue, textForKind, getAt, isAddressable, editBlock,
  setUpdate, removeUpdate, renameUpdate, addFieldPath, patchSet, patchRemove, patchRename, FieldEditError,
} from '../utils/fieldEdit';

const OID = 'a'.repeat(24);
const ISO = '2022-04-26T16:18:05.988Z';

describe('valueKind', () => {
  it('names every shape the serializer sends', () => {
    expect(valueKind('x')).toBe('string');
    expect(valueKind(3.5)).toBe('number');
    expect(valueKind(false)).toBe('boolean');
    expect(valueKind(null)).toBe('null');
    expect(valueKind(undefined)).toBe('null');
    expect(valueKind({ $oid: OID })).toBe('objectId');
    expect(valueKind({ $date: ISO })).toBe('date');
    expect(valueKind([1])).toBe('array');
    expect(valueKind({ a: 1 })).toBe('object');
  });

  it('does not mistake an object that merely has a $oid key for an ObjectId', () => {
    expect(valueKind({ $oid: OID, extra: 1 })).toBe('object');
  });
});

describe('containerSummary', () => {
  it('counts fields and elements, singular included', () => {
    expect(containerSummary({ a: 1 })).toBe('{ 1 field }');
    expect(containerSummary({ a: 1, b: 2 })).toBe('{ 2 fields }');
    expect(containerSummary([])).toBe('[ 0 elements ]');
    expect(containerSummary([1])).toBe('[ 1 element ]');
  });
});

describe('editText / parseEditValue round trip', () => {
  const cases: [any, ReturnType<typeof valueKind>][] = [
    ['hello', 'string'], [42, 'number'], [-1.5, 'number'], [true, 'boolean'], [null, 'null'],
    [{ $oid: OID }, 'objectId'], [{ $date: ISO }, 'date'], [{ a: { $oid: OID }, b: [1, 2] }, 'object'], [[1, 'x'], 'array'],
  ];
  for (const [v, kind] of cases) {
    it(`${kind} ${JSON.stringify(v)}`, () => {
      expect(parseEditValue(editText(v), kind)).toEqual(v);
    });
  }

  it('prints containers on one line, in the shell dialect', () => {
    expect(editText({ a: { $oid: OID } })).toBe(`{ "a": ObjectId("${OID}") }`);
  });
});

describe('parseEditValue', () => {
  it('keeps a string exactly as typed, spaces included', () => {
    expect(parseEditValue('  x ', 'string')).toBe('  x ');
  });

  it('refuses what does not read as the chosen type', () => {
    expect(() => parseEditValue('abc', 'number')).toThrow(FieldEditError);
    expect(() => parseEditValue('', 'number')).toThrow(FieldEditError);
    expect(() => parseEditValue('yes', 'boolean')).toThrow(FieldEditError);
    expect(() => parseEditValue('not a date', 'date')).toThrow(FieldEditError);
    expect(() => parseEditValue('123', 'objectId')).toThrow(FieldEditError);
    expect(() => parseEditValue('{', 'object')).toThrow(/Invalid JSON/);
    expect(() => parseEditValue('[1]', 'object')).toThrow(FieldEditError);
    expect(() => parseEditValue('{}', 'array')).toThrow(FieldEditError);
  });

  it('accepts the shell wrappers and +0000 offsets', () => {
    expect(parseEditValue(`ObjectId("${OID.toUpperCase()}")`, 'objectId')).toEqual({ $oid: OID });
    expect(parseEditValue(`ISODate("${ISO}")`, 'date')).toEqual({ $date: ISO });
    expect(parseEditValue('2022-04-26T16:18:05.988+0000', 'date')).toEqual({ $date: ISO });
  });

  it('reads a date as a date, never as a bare string', () => {
    expect(parseEditValue('2022-04-26', 'date')).toEqual({ $date: '2022-04-26T00:00:00.000Z' });
  });
});

describe('textForKind', () => {
  it('keeps text that still fits the new type', () => {
    expect(textForKind('42', 'number')).toBe('42');
    expect(textForKind('42', 'string')).toBe('42');
  });

  it('replaces text that does not', () => {
    expect(textForKind('abc', 'number')).toBe('0');
    expect(textForKind('abc', 'boolean')).toBe('true');
    expect(textForKind('abc', 'array')).toBe('[]');
    expect(textForKind('abc', 'null')).toBe('');
  });
});

describe('paths', () => {
  const doc = { a: { b: [10, { c: 1 }] } };

  it('walks objects and arrays', () => {
    expect(getAt(doc, ['a', 'b', 1, 'c'])).toBe(1);
    expect(getAt(doc, ['a', 'x', 'y'])).toBeUndefined();
  });

  it('refuses names that have no dotted path', () => {
    expect(isAddressable(['a.b'])).toBe(false);
    expect(isAddressable(['$x'])).toBe(false);
    expect(isAddressable([''])).toBe(false);
    expect(isAddressable([])).toBe(false);
    expect(isAddressable(['a', 0, 'b'])).toBe(true);
  });

  it('never lets _id be edited in place', () => {
    expect(editBlock(['_id'])).toMatch(/_id/);
    expect(editBlock(['_id', '$oid'])).toMatch(/_id/);
    expect(() => setUpdate(['_id'], 1)).toThrow(FieldEditError);
    expect(editBlock(['name'])).toBeNull();
  });
});

describe('update documents', () => {
  const doc = { name: 'x', tags: ['a', 'b', 'c'], addr: { city: 'Rome' }, items: [{ n: 1 }] };

  it('$set on the dotted path', () => {
    expect(setUpdate(['addr', 'city'], 'Milan')).toEqual({ $set: { 'addr.city': 'Milan' } });
    expect(setUpdate(['tags', 1], 'z')).toEqual({ $set: { 'tags.1': 'z' } });
  });

  it('$unset a field, but rewrites the array to remove an element — no null hole', () => {
    expect(removeUpdate(doc, ['addr', 'city'])).toEqual({ $unset: { 'addr.city': '' } });
    expect(removeUpdate(doc, ['tags', 1])).toEqual({ $set: { tags: ['a', 'c'] } });
  });

  it('$rename within the same object', () => {
    expect(renameUpdate(doc, ['addr', 'city'], 'town')).toEqual({ $rename: { 'addr.city': 'addr.town' } });
  });

  it('refuses renames the server would reject or that would clobber a field', () => {
    expect(() => renameUpdate(doc, ['items', 0, 'n'], 'm')).toThrow(/array/);
    expect(() => renameUpdate(doc, ['tags', 0], 'x')).toThrow(/array/);
    expect(() => renameUpdate(doc, ['name'], 'tags')).toThrow(/already exists/);
    expect(() => renameUpdate(doc, ['name'], 'name')).toThrow(/same/);
    expect(() => renameUpdate(doc, ['name'], 'a.b')).toThrow(FieldEditError);
    expect(() => renameUpdate(doc, ['name'], '_id')).toThrow(FieldEditError);
  });

  it('adds a field by name, an array element by position', () => {
    expect(addFieldPath(doc, [], 'age')).toEqual(['age']);
    expect(addFieldPath(doc, ['addr'], 'zip')).toEqual(['addr', 'zip']);
    expect(addFieldPath(doc, ['tags'], '')).toEqual(['tags', 3]);
    expect(() => addFieldPath(doc, [], 'name')).toThrow(/already exists/);
    expect(() => addFieldPath(doc, [], ' ')).toThrow(FieldEditError);
  });
});

describe('local patches', () => {
  const doc = { a: 1, b: { c: [1, 2, 3] }, d: 'x' };

  it('set leaves the original untouched', () => {
    const out = patchSet(doc, ['b', 'c', 0], 9);
    expect(out.b.c).toEqual([9, 2, 3]);
    expect(doc.b.c).toEqual([1, 2, 3]);
  });

  it('set creates missing parents', () => {
    expect(patchSet({}, ['x', 'y'], 1)).toEqual({ x: { y: 1 } });
  });

  it('remove deletes a key or splices an element', () => {
    expect(patchRemove(doc, ['a'])).toEqual({ b: { c: [1, 2, 3] }, d: 'x' });
    expect(patchRemove(doc, ['b', 'c', 1]).b.c).toEqual([1, 3]);
    expect(doc.a).toBe(1);
  });

  it('rename keeps the key in its place', () => {
    expect(Object.keys(patchRename(doc, ['b'], 'z'))).toEqual(['a', 'z', 'd']);
  });
});
