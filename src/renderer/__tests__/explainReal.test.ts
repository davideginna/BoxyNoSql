// Companion to explain.test.ts, which works from hand-written shapes. This one
// runs the summarizer over output captured from a real MongoDB 7 server
// (`testdb`: users 200 docs with a unique index on email and a compound
// city_1_age_-1, orders 500 with status_1_placedAt_-1), so a hand-written
// fixture drifting from what the server actually answers gets caught.
import { describe, it, expect } from 'vitest';
import real from './fixtures/explain-mongo7.json';
import { summarizeExplain, planChain } from '../utils/explain';

const s = (key: string) => summarizeExplain((real as any)[key]);

describe('explain against real MongoDB 7 executionStats output', () => {
  it('unindexed filter reads the whole collection', () => {
    const r = s('collscan');
    expect(r.kind).toBe('find');
    expect(r.collectionScan).toBe(true);
    expect(r.indexes).toEqual([]);
    expect(r.totalDocsExamined).toBe(200);
    expect(r.namespace).toBe('testdb.users');
    expect(r.level).toBe('bad');
  });

  it('unique index lookup names the index and reads one document', () => {
    const r = s('ixscan');
    expect(r.collectionScan).toBe(false);
    expect(r.indexes).toEqual(['email_1']);
    expect(r.nReturned).toBe(1);
    expect(r.totalDocsExamined).toBe(1);
    expect(planChain(r)).toBe('FETCH → IXSCAN');
    expect(r.level).toBe('good');
  });

  it('compound index serves the sort without a SORT stage', () => {
    const r = s('compound');
    expect(r.indexes).toEqual(['city_1_age_-1']);
    expect(planChain(r)).not.toContain('SORT');
    expect(r.nReturned).toBe(40);
  });

  it('reads an aggregation explain', () => {
    const r = s('agg');
    expect(r.kind).toBe('aggregate');
    expect(r.namespace).toBe('testdb.orders');
    expect(r.indexes).toEqual(['status_1_placedAt_-1']);
  });
});
