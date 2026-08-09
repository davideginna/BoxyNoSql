import { describe, it, expect } from 'vitest';
import { analyzeSchema, exampleOf, presencePercent, typeSummary } from '../utils/schema';

const OID = { $oid: 'a'.repeat(24) };

describe('analyzeSchema', () => {
  it('counts how many documents have each field', () => {
    const { sampled, fields } = analyzeSchema([
      { a: 1, b: 'x' },
      { a: 2 },
      { a: 3 },
    ]);
    expect(sampled).toBe(3);
    expect(fields.find(f => f.path === 'a')!.present).toBe(3);
    expect(fields.find(f => f.path === 'b')!.present).toBe(1);
  });

  it('puts the most common fields first', () => {
    const { fields } = analyzeSchema([{ a: 1, rare: 1 }, { a: 2 }, { a: 3 }]);
    expect(fields.map(f => f.path)).toEqual(['a', 'rare']);
  });

  it('reports every type a field takes, most common first', () => {
    const { fields } = analyzeSchema([{ a: 1 }, { a: 2 }, { a: 'three' }]);
    expect(fields[0].types).toEqual([{ type: 'number', count: 2 }, { type: 'string', count: 1 }]);
  });

  it('keeps null apart from missing — "present but empty" is the thing you look for', () => {
    const { fields } = analyzeSchema([{ a: null }, { a: 1 }, {}]);
    const a = fields.find(f => f.path === 'a')!;
    expect(a.present).toBe(2);
    expect(a.types).toContainEqual({ type: 'null', count: 1 });
  });

  it('follows subdocuments as dotted paths', () => {
    const { fields } = analyzeSchema([{ profile: { level: 3, bio: 'hi' } }]);
    expect(fields.map(f => f.path).sort()).toEqual(['profile', 'profile.bio', 'profile.level']);
    expect(fields.find(f => f.path === 'profile')!.types[0].type).toBe('object');
  });

  it('stops at maxDepth, still naming the field it stopped on', () => {
    const deep = { a: { b: { c: { d: 1 } } } };
    const paths = analyzeSchema([deep], 2).fields.map(f => f.path);
    expect(paths).toContain('a.b');
    expect(paths).not.toContain('a.b.c.d');
  });

  it('does not walk into arrays or BSON wrappers', () => {
    const { fields } = analyzeSchema([{ tags: ['a', 'b'], _id: OID }]);
    expect(fields.map(f => f.path).sort()).toEqual(['_id', 'tags']);
    expect(fields.find(f => f.path === 'tags')!.types[0].type).toBe('array');
    expect(fields.find(f => f.path === '_id')!.types[0].type).toBe('objectid');
  });

  it('collects a few distinct examples, not the same value three times', () => {
    const { fields } = analyzeSchema([{ a: 'x' }, { a: 'x' }, { a: 'y' }, { a: 'z' }, { a: 'w' }]);
    expect(fields[0].examples).toEqual(['x', 'y', 'z']);
  });

  it('is empty for an empty sample rather than throwing', () => {
    expect(analyzeSchema([])).toEqual({ sampled: 0, fields: [] });
  });
});

describe('exampleOf', () => {
  it('renders BSON the way the rest of the app does', () => {
    expect(exampleOf(OID)).toBe(`ObjectId(${'a'.repeat(24)})`);
    expect(exampleOf({ $date: '2026-08-09T10:00:00Z' })).toBe('2026-08-09T10:00:00Z');
  });

  it('flattens and truncates long values', () => {
    expect(exampleOf('x'.repeat(80))).toBe('x'.repeat(40) + '…');
    expect(exampleOf({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
    expect(exampleOf('a\n  b')).toBe('a b');
  });

  it('says null out loud', () => {
    expect(exampleOf(null)).toBe('null');
    expect(exampleOf(undefined)).toBe('null');
  });
});

describe('presencePercent', () => {
  it('is 100 for a field on every document', () => {
    const [field] = analyzeSchema([{ a: 1 }, { a: 2 }]).fields;
    expect(presencePercent(field, 2)).toBe(100);
  });

  it('rounds', () => {
    const field = analyzeSchema([{ a: 1 }, {}, {}]).fields[0];
    expect(presencePercent(field, 3)).toBe(33);
  });

  it('is 0 rather than NaN on an empty sample', () => {
    expect(presencePercent({ path: 'a', present: 0, types: [], examples: [] }, 0)).toBe(0);
  });
});

describe('typeSummary', () => {
  it('is just the type when there is only one', () => {
    expect(typeSummary(analyzeSchema([{ a: 1 }]).fields[0])).toBe('number');
  });

  it('shares out the percentages when a field is mixed', () => {
    const field = analyzeSchema([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 'four' }]).fields[0];
    expect(typeSummary(field)).toBe('number (75%), string (25%)');
  });
});
