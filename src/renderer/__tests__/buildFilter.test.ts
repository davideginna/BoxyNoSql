import { describe, it, expect } from 'vitest';
import { buildFilter, detectType, parseFilter, splitFilter, combineFilters, type Condition, type FieldType, type Operator } from '../utils/buildFilter';

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
  it('detects date from extended JSON {$date}', () => expect(detectType({ $date: '2024-01-15T10:00:00Z' })).toBe('date'));
  it('detects date from ISO string', () => expect(detectType('2024-01-15T10:00:00Z')).toBe('date'));
  it('plain string not detected as date', () => expect(detectType('hello world')).toBe('string'));
  it('null defaults to string', () => expect(detectType(null)).toBe('string'));
  it('detects ObjectId-like BSON', () => expect(detectType({ _bsontype: 'ObjectId', toString: () => 'x' })).toBe('objectid'));
});

describe('date values', () => {
  it('builds dates as {$date} so the JSON editor shows ISODate and reads it back', () => {
    expect(buildFilter([{ id: 1, field: 'd', op: 'gt', value: '2024-01-15', type: 'date' }]))
      .toEqual({ d: { $gt: { $date: '2024-01-15T00:00:00.000Z' } } });
  });
});

describe('parseFilter — round trip with buildFilter', () => {
  const C = (field: string, op: Operator, type: FieldType, value = '') => ({ field, op, type, value });
  const cases = [
    C('name', 'eq', 'string', 'alpha'), C('name', 'ne', 'string', 'alpha'),
    C('name', 'contains', 'string', 'a.b (x)'), C('name', 'not_contains', 'string', 'zz'),
    C('name', 'starts_with', 'string', 'Mr.'), C('name', 'ends_with', 'string', '$1'),
    C('name', 'regex', 'string', '^a.*z$'),
    C('name', 'is_null', 'string'), C('name', 'isnt_null', 'string'),
    C('name', 'exists', 'string'), C('name', 'nexists', 'string'),
    C('name', 'in', 'string', 'a, b, c'), C('n', 'nin', 'number', '1, 2'),
    C('n', 'gt', 'number', '5'), C('n', 'lte', 'number', '7.5'),
    C('ok', 'is_true', 'boolean'), C('ok', 'is_false', 'boolean'),
    C('d', 'gte', 'date', '2024-01-15T00:00:00.000Z'),
    C('ref', 'eq', 'objectid', 'a'.repeat(24)),
  ];

  it.each(cases)('$op on $type', c => {
    const filter = buildFilter([{ id: 1, ...c }]);
    const back = parseFilter(filter)!;
    expect(back).not.toBeNull();
    // Re-building what came back gives the same filter — that is the contract.
    expect(buildFilter(back.conditions.map((x, i) => ({ ...x, id: i })))).toEqual(filter);
  });

  it('keeps several conditions and AND/OR', () => {
    const conds = [{ id: 1, ...cases[0] }, { id: 2, ...cases[13] }];
    expect(parseFilter(buildFilter(conds, true))).toEqual({ matchAll: true, conditions: [cases[0], cases[13]] });
    expect(parseFilter(buildFilter(conds, false))).toEqual({ matchAll: false, conditions: [cases[0], cases[13]] });
  });
});

describe('parseFilter — hand-written JSON', () => {
  it('reads {} as no conditions', () => {
    expect(parseFilter({})).toEqual({ matchAll: true, conditions: [] });
  });

  it('reads a bare value as equals, several keys as AND', () => {
    expect(parseFilter({ name: 'x', n: 3 })).toEqual({
      matchAll: true,
      conditions: [
        { field: 'name', op: 'eq', type: 'string', value: 'x' },
        { field: 'n', op: 'eq', type: 'number', value: '3' },
      ],
    });
  });

  it('reads dotted paths and dates', () => {
    expect(parseFilter({ 'profile.city': 'Rome', d: { $lt: { $date: '2024-01-01T00:00:00Z' } } })!.conditions)
      .toEqual([
        { field: 'profile.city', op: 'eq', type: 'string', value: 'Rome' },
        { field: 'd', op: 'lt', type: 'date', value: '2024-01-01T00:00:00Z' },
      ]);
  });

  it.each([
    ['$elemMatch', { tags: { $elemMatch: { a: 1 } } }],
    ['$expr', { $expr: { $gt: ['$a', '$b'] } }],
    ['nested logic', { $or: [{ a: 1, b: 2 }, { c: 3 }] }],
    ['regex with other options', { a: { $regex: 'x', $options: 'im' } }],
    ['two operators on one field', { n: { $gt: 1, $lt: 5 } }],
    ['$gt on a string (no such builder op)', { name: { $gt: 'm' } }],
    ['mixed-type $in', { a: { $in: [1, 'x'] } }],
    ['$in value with a comma', { a: { $in: ['x,y'] } }],
    ['array value', { a: [1, 2] }],
    ['not an object', [1]],
  ])('returns null for %s, so the JSON is kept as-is', (_, f) => {
    expect(parseFilter(f)).toBeNull();
  });
});

describe('combineFilters', () => {
  it('ANDs a custom JSON filter with the builder one, or returns whichever exists', () => {
    expect(combineFilters({ $expr: 1 }, { a: 1 })).toEqual({ $and: [{ $expr: 1 }, { a: 1 }] });
    expect(combineFilters({ $expr: 1 }, {})).toEqual({ $expr: 1 });
    expect(combineFilters(null, { a: 1 })).toEqual({ a: 1 });
    expect(combineFilters(null, {})).toEqual({});
  });
});

describe('splitFilter', () => {
  const EM = { tags: { $elemMatch: { k: 'y' } } };

  it('turns what it can into conditions and keeps only the rest as JSON', () => {
    expect(splitFilter({ status: 'open', ...EM })).toEqual({
      matchAll: true,
      conditions: [{ field: 'status', op: 'eq', type: 'string', value: 'open' }],
      rest: EM,
    });
  });

  it('does the same inside an explicit $and', () => {
    const r = splitFilter({ $and: [{ n: { $gt: 1 } }, EM, { $expr: { $eq: ['$a', 1] } }] });
    expect(r.conditions).toEqual([{ field: 'n', op: 'gt', type: 'number', value: '1' }]);
    expect(r.rest).toEqual({ $and: [EM, { $expr: { $eq: ['$a', 1] } }] });
  });

  it('keeps an $or whole when any part of it is not expressible', () => {
    const f = { $or: [{ a: 1 }, EM] };
    expect(splitFilter(f)).toEqual({ matchAll: true, conditions: [], rest: f });
  });

  it('has no rest when the whole filter parses', () => {
    expect(splitFilter({ a: 1 }).rest).toBeNull();
  });

  it('recombines into the same filter, semantically', () => {
    const r = splitFilter({ status: 'open', ...EM });
    const built = buildFilter(r.conditions.map((c, i) => ({ ...c, id: i })), r.matchAll);
    expect(combineFilters(r.rest, built)).toEqual({ $and: [EM, { status: { $eq: 'open' } }] });
  });
});
