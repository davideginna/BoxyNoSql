import { describe, it, expect } from 'vitest';
import { buildFilter, detectType, type Condition, type FieldType } from '../utils/buildFilter';

const cond = (field: string, op: Condition['op'], value: string, type: FieldType = 'string', id = 1): Condition =>
  ({ id, field, op, value, type });

describe('buildFilter', () => {
  it('returns empty object for no conditions', () => {
    expect(buildFilter([])).toEqual({});
  });

  it('single eq → flat object not wrapped in $and', () => {
    const result = buildFilter([cond('name', 'eq', 'alice')]);
    expect(result).not.toHaveProperty('$and');
    expect(result).toEqual({ name: { $eq: 'alice' } });
  });

  it('number: coerces value to number', () => {
    expect(buildFilter([cond('age', 'gt', '30', 'number')])).toEqual({ age: { $gt: 30 } });
    expect(buildFilter([cond('score', 'lte', '99.5', 'number')])).toEqual({ score: { $lte: 99.5 } });
  });

  it('string: contains → $regex case-insensitive', () => {
    const r = buildFilter([cond('name', 'contains', 'ali')]);
    expect(r).toEqual({ name: { $regex: 'ali', $options: 'i' } });
  });

  it('string: starts_with → regex with ^', () => {
    const r = buildFilter([cond('name', 'starts_with', 'ali')]);
    expect(r.name.$regex).toMatch(/^\^/);
  });

  it('string: ends_with → regex with $', () => {
    const r = buildFilter([cond('name', 'ends_with', 'ce')]);
    expect(r.name.$regex).toMatch(/\$$/);
  });

  it('is_null → { field: null }', () => {
    expect(buildFilter([cond('deleted', 'is_null', '')])).toEqual({ deleted: null });
  });

  it('isnt_null → { $ne: null }', () => {
    expect(buildFilter([cond('email', 'isnt_null', '')])).toEqual({ email: { $ne: null } });
  });

  it('exists → { $exists: true }', () => {
    expect(buildFilter([cond('email', 'exists', '')])).toEqual({ email: { $exists: true } });
  });

  it('nexists → { $exists: false }', () => {
    expect(buildFilter([cond('email', 'nexists', '')])).toEqual({ email: { $exists: false } });
  });

  it('in → $in array', () => {
    expect(buildFilter([cond('status', 'in', 'a,b,c')])).toEqual({ status: { $in: ['a', 'b', 'c'] } });
  });

  it('nin → $nin array', () => {
    expect(buildFilter([cond('status', 'nin', 'x,y')])).toEqual({ status: { $nin: ['x', 'y'] } });
  });

  it('is_true / is_false → boolean literal', () => {
    expect(buildFilter([cond('active', 'is_true', '', 'boolean')])).toEqual({ active: true });
    expect(buildFilter([cond('active', 'is_false', '', 'boolean')])).toEqual({ active: false });
  });

  it('matchAll=true → $and for multiple conditions', () => {
    const r = buildFilter([cond('a', 'eq', '1', 'number', 1), cond('b', 'eq', '2', 'number', 2)], true);
    expect(r).toHaveProperty('$and');
    expect(r.$and).toHaveLength(2);
  });

  it('matchAll=false → $or for multiple conditions', () => {
    const r = buildFilter([cond('a', 'eq', '1', 'number', 1), cond('b', 'eq', '2', 'number', 2)], false);
    expect(r).toHaveProperty('$or');
  });

  it('escapes special regex chars in contains', () => {
    const r = buildFilter([cond('name', 'contains', 'a.b*c')]);
    expect(r.name.$regex).toBe('a\\.b\\*c');
  });
});

describe('detectType', () => {
  it('detects string', () => expect(detectType('hello')).toBe('string'));
  it('detects number', () => expect(detectType(42)).toBe('number'));
  it('detects boolean', () => expect(detectType(true)).toBe('boolean'));
  it('detects array', () => expect(detectType([1, 2])).toBe('array'));
  it('detects object', () => expect(detectType({ a: 1 })).toBe('object'));
  it('detects date from ISO string', () => expect(detectType('2024-01-15T10:00:00Z')).toBe('date'));
  it('plain string not detected as date', () => expect(detectType('hello world')).toBe('string'));
  it('null defaults to string', () => expect(detectType(null)).toBe('string'));
  it('detects ObjectId-like BSON', () => expect(detectType({ _bsontype: 'ObjectId', toString: () => 'x' })).toBe('objectid'));
});
