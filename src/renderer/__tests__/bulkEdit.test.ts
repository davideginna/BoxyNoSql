import { describe, it, expect } from 'vitest';
import { parseTypedValue, buildBulkUpdate, describeBulkEdit, BulkEditError } from '../utils/bulkEdit';

describe('parseTypedValue', () => {
  it('keeps a string as typed, spaces included', () => {
    expect(parseTypedValue('  hello ', 'string')).toBe('  hello ');
  });

  it('parses numbers and rejects what is not one', () => {
    expect(parseTypedValue('42', 'number')).toBe(42);
    expect(parseTypedValue('-1.5', 'number')).toBe(-1.5);
    expect(() => parseTypedValue('abc', 'number')).toThrow(BulkEditError);
    expect(() => parseTypedValue('', 'number')).toThrow(BulkEditError);
  });

  it('takes the spellings people actually type for a boolean', () => {
    expect(parseTypedValue('true', 'boolean')).toBe(true);
    expect(parseTypedValue('YES', 'boolean')).toBe(true);
    expect(parseTypedValue('0', 'boolean')).toBe(false);
    expect(() => parseTypedValue('maybe', 'boolean')).toThrow(BulkEditError);
  });

  it('writes a date as extended JSON, so the main process revives a real Date', () => {
    expect(parseTypedValue('2026-08-09', 'date')).toEqual({ $date: '2026-08-09T00:00:00.000Z' });
    expect(() => parseTypedValue('not a date', 'date')).toThrow(BulkEditError);
  });

  it('checks an ObjectId is 24 hex characters', () => {
    const oid = 'a'.repeat(24);
    expect(parseTypedValue(oid, 'objectid')).toEqual({ $oid: oid });
    expect(() => parseTypedValue('abc', 'objectid')).toThrow(BulkEditError);
  });

  it('parses JSON for arrays and subdocuments', () => {
    expect(parseTypedValue('{"a":1}', 'json')).toEqual({ a: 1 });
    expect(parseTypedValue('[1,2]', 'json')).toEqual([1, 2]);
    expect(() => parseTypedValue('{oops', 'json')).toThrow(/Invalid JSON/);
  });

  it('has a type for null, which is not the same as an empty string', () => {
    expect(parseTypedValue('', 'null')).toBeNull();
  });
});

describe('buildBulkUpdate', () => {
  it('sets a value', () => {
    expect(buildBulkUpdate({ op: 'set', field: 'status', value: 'paid', valueType: 'string' }))
      .toEqual({ $set: { status: 'paid' } });
  });

  it('sets a typed value', () => {
    expect(buildBulkUpdate({ op: 'set', field: 'age', value: '30', valueType: 'number' }))
      .toEqual({ $set: { age: 30 } });
  });

  it('unsets a field', () => {
    expect(buildBulkUpdate({ op: 'unset', field: 'temp' })).toEqual({ $unset: { temp: '' } });
  });

  it('renames a field', () => {
    expect(buildBulkUpdate({ op: 'rename', field: 'old', newName: 'new' }))
      .toEqual({ $rename: { old: 'new' } });
  });

  it('refuses an empty field name', () => {
    expect(() => buildBulkUpdate({ op: 'unset', field: '  ' })).toThrow(/Choose a field/);
  });

  it('refuses to touch _id, whichever end it is on', () => {
    expect(() => buildBulkUpdate({ op: 'unset', field: '_id' })).toThrow(/_id/);
    expect(() => buildBulkUpdate({ op: 'rename', field: 'a', newName: '_id' })).toThrow(/_id/);
  });

  it('refuses a rename with no target, or to the same name', () => {
    expect(() => buildBulkUpdate({ op: 'rename', field: 'a', newName: ' ' })).toThrow(/new field name/);
    expect(() => buildBulkUpdate({ op: 'rename', field: 'a', newName: 'a' })).toThrow(/same as the old one/);
  });

  it('trims the field name — a trailing space would create a different field', () => {
    expect(buildBulkUpdate({ op: 'unset', field: ' temp ' })).toEqual({ $unset: { temp: '' } });
  });

  it('passes a bad value straight through as an error', () => {
    expect(() => buildBulkUpdate({ op: 'set', field: 'age', value: 'x', valueType: 'number' })).toThrow(BulkEditError);
  });
});

describe('describeBulkEdit', () => {
  it('says what is about to happen, with the count', () => {
    expect(describeBulkEdit({ op: 'set', field: 'status' }, 12)).toBe('Set field "status" on 12 documents');
    expect(describeBulkEdit({ op: 'unset', field: 'temp' }, 1)).toBe('Remove field "temp" from 1 document');
    expect(describeBulkEdit({ op: 'rename', field: 'a', newName: 'b' }, 3)).toBe('Rename field "a" to "b" on 3 documents');
  });
});
