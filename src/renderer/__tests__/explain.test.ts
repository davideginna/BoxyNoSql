import { describe, it, expect } from 'vitest';
import { summarizeExplain, planChain, UNSELECTIVE_RATIO } from '../utils/explain';

/** `find({ city: 'Rome' })` with no index: every document read to return 12. */
const COLLSCAN = {
  queryPlanner: {
    namespace: 'testdb.users',
    winningPlan: { stage: 'COLLSCAN', filter: { city: { $eq: 'Rome' } }, direction: 'forward' },
    rejectedPlans: [],
  },
  executionStats: {
    executionSuccess: true,
    nReturned: 12,
    executionTimeMillis: 4,
    totalKeysExamined: 0,
    totalDocsExamined: 200,
    executionStages: {
      stage: 'COLLSCAN', nReturned: 12, executionTimeMillisEstimate: 3, docsExamined: 200,
    },
  },
};

/** `find({ email: 'a@x.it' })` on `email_1`: one key, one document, one result. */
const IXSCAN = {
  queryPlanner: {
    namespace: 'testdb.users',
    winningPlan: {
      stage: 'FETCH',
      inputStage: { stage: 'IXSCAN', keyPattern: { email: 1 }, indexName: 'email_1', direction: 'forward' },
    },
  },
  executionStats: {
    nReturned: 1,
    executionTimeMillis: 0,
    totalKeysExamined: 1,
    totalDocsExamined: 1,
    executionStages: {
      stage: 'FETCH', nReturned: 1, executionTimeMillisEstimate: 0, docsExamined: 1,
      inputStage: {
        stage: 'IXSCAN', nReturned: 1, executionTimeMillisEstimate: 0,
        keyPattern: { email: 1 }, indexName: 'email_1', keysExamined: 1,
      },
    },
  },
};

/** Sort on top of a compound index that only serves the equality half. */
const COMPOUND = {
  queryPlanner: {
    namespace: 'testdb.users',
    winningPlan: {
      stage: 'SORT',
      sortPattern: { age: 1 },
      inputStage: {
        stage: 'FETCH',
        inputStage: { stage: 'IXSCAN', keyPattern: { city: 1, age: 1 }, indexName: 'city_1_age_1' },
      },
    },
  },
  executionStats: {
    nReturned: 3,
    executionTimeMillis: 12,
    totalKeysExamined: 90,
    totalDocsExamined: 90,
    executionStages: {
      stage: 'SORT', nReturned: 3, executionTimeMillisEstimate: 10,
      inputStage: {
        stage: 'FETCH', nReturned: 90, executionTimeMillisEstimate: 6,
        inputStage: {
          stage: 'IXSCAN', nReturned: 90, executionTimeMillisEstimate: 2,
          keyPattern: { city: 1, age: 1 }, indexName: 'city_1_age_1',
        },
      },
    },
  },
};

/** `[{ $match: { status: 'paid' } }, { $group: … }]` on `status_1_placedAt_1`. */
const AGGREGATION = {
  explainVersion: '1',
  stages: [
    {
      $cursor: {
        queryPlanner: {
          namespace: 'testdb.orders',
          winningPlan: {
            stage: 'FETCH',
            inputStage: { stage: 'IXSCAN', keyPattern: { status: 1, placedAt: 1 }, indexName: 'status_1_placedAt_1' },
          },
        },
        executionStats: {
          nReturned: 240,
          executionTimeMillis: 7,
          totalKeysExamined: 240,
          totalDocsExamined: 240,
          executionStages: {
            stage: 'FETCH', nReturned: 240,
            inputStage: { stage: 'IXSCAN', nReturned: 240, indexName: 'status_1_placedAt_1', keyPattern: { status: 1, placedAt: 1 } },
          },
        },
      },
      nReturned: 240,
      executionTimeMillisEstimate: 7,
    },
    { $group: { _id: '$userId' }, nReturned: 4, executionTimeMillisEstimate: 9 },
  ],
  serverInfo: { version: '7.0.5' },
};

describe('summarizeExplain — find', () => {
  it('reads a collection scan and calls it out', () => {
    const s = summarizeExplain(COLLSCAN);
    expect(s.kind).toBe('find');
    expect(s.namespace).toBe('testdb.users');
    expect(s.collectionScan).toBe(true);
    expect(s.indexes).toEqual([]);
    expect(s.nReturned).toBe(12);
    expect(s.totalDocsExamined).toBe(200);
    expect(s.totalKeysExamined).toBe(0);
    expect(s.executionTimeMillis).toBe(4);
    expect(s.level).toBe('bad');
    expect(s.verdict).toMatch(/Collection scan/);
    expect(s.verdict).toMatch(/No index covers this query/);
  });

  it('names the index of an IXSCAN and calls the plan good', () => {
    const s = summarizeExplain(IXSCAN);
    expect(s.indexes).toEqual(['email_1']);
    expect(planChain(s)).toBe('FETCH → IXSCAN');
    expect(s.collectionScan).toBe(false);
    expect(s.examinedPerReturned).toBe(1);
    expect(s.level).toBe('good');
    expect(s.verdict).toMatch(/Index email_1 used/);
  });

  it('keeps the whole stage chain of a multi-stage plan, with per-stage counts', () => {
    const s = summarizeExplain(COMPOUND);
    expect(planChain(s)).toBe('SORT → FETCH → IXSCAN');
    expect(s.stages.map(st => st.depth)).toEqual([0, 1, 2]);
    expect(s.stages[0].nReturned).toBe(3);
    expect(s.stages[2]).toMatchObject({
      name: 'IXSCAN', index: 'city_1_age_1', keyPattern: '{ city: 1, age: 1 }',
    });
    expect(s.indexes).toEqual(['city_1_age_1']);
  });

  it('warns when an index is used but reads far more than it returns', () => {
    const s = summarizeExplain(COMPOUND);
    expect(s.examinedPerReturned).toBe(30);
    expect(s.examinedPerReturned).toBeGreaterThanOrEqual(UNSELECTIVE_RATIO);
    expect(s.level).toBe('warn');
    expect(s.verdict).toMatch(/not selective/);
    expect(s.verdict).toMatch(/30×/);
  });

  it('treats a scan that returns everything it reads as expected, not as a fault', () => {
    const s = summarizeExplain({
      ...COLLSCAN,
      executionStats: { ...COLLSCAN.executionStats, nReturned: 200, totalDocsExamined: 200 },
    });
    expect(s.level).toBe('warn');
    expect(s.verdict).toMatch(/Expected with no filter/);
  });

  it('counts a query that returned nothing against what it read', () => {
    const s = summarizeExplain({
      ...COLLSCAN,
      executionStats: { ...COLLSCAN.executionStats, nReturned: 0, totalDocsExamined: 500 },
    });
    expect(s.examinedPerReturned).toBe(500);
    expect(s.level).toBe('bad');
  });

  it('reads the slot-based engine, which nests the plan one level further down', () => {
    const s = summarizeExplain({
      explainVersion: '2',
      queryPlanner: {
        namespace: 'testdb.users',
        winningPlan: {
          queryPlan: {
            stage: 'FETCH',
            inputStage: { stage: 'IXSCAN', indexName: 'email_1', keyPattern: { email: 1 } },
          },
          slotBasedPlan: { slots: '$$RESULT=s11', stages: '[2] nlj ...' },
        },
      },
    });
    expect(planChain(s)).toBe('FETCH → IXSCAN');
    expect(s.indexes).toEqual(['email_1']);
  });

  it('keeps both branches of an $or plan', () => {
    const s = summarizeExplain({
      queryPlanner: {
        namespace: 'testdb.users',
        winningPlan: {
          stage: 'OR',
          inputStages: [
            { stage: 'IXSCAN', indexName: 'email_1' },
            { stage: 'IXSCAN', indexName: 'city_1_age_1' },
          ],
        },
      },
    });
    expect(planChain(s)).toBe('OR → IXSCAN → IXSCAN');
    expect(s.indexes).toEqual(['email_1', 'city_1_age_1']);
  });
});

describe('summarizeExplain — aggregation', () => {
  it('reads the stages shape, flattening the $cursor plan into it', () => {
    const s = summarizeExplain(AGGREGATION);
    expect(s.kind).toBe('aggregate');
    expect(s.namespace).toBe('testdb.orders');
    expect(planChain(s)).toBe('$cursor → FETCH → IXSCAN → $group');
    expect(s.indexes).toEqual(['status_1_placedAt_1']);
  });

  it('reports what the pipeline returned, not what the cursor fed it', () => {
    const s = summarizeExplain(AGGREGATION);
    expect(s.nReturned).toBe(4);
    expect(s.totalDocsExamined).toBe(240);
    expect(s.totalKeysExamined).toBe(240);
    expect(s.executionTimeMillis).toBe(7);
    expect(s.level).toBe('warn');
    expect(s.verdict).toMatch(/status_1_placedAt_1/);
  });

  it('falls back to the largest stage estimate when there is no cursor timing', () => {
    const s = summarizeExplain({
      stages: [
        { $match: { a: 1 }, nReturned: 10, executionTimeMillisEstimate: 2 },
        { $sort: { a: 1 }, nReturned: 10, executionTimeMillisEstimate: 11 },
      ],
    });
    expect(s.executionTimeMillis).toBe(11);
    expect(s.nReturned).toBe(10);
    expect(s.totalDocsExamined).toBeNull();
  });

  it('reads an aggregation the server answered with the find shape', () => {
    // A `$match`-only pipeline can be pushed all the way down, and then mongod
    // replies with queryPlanner/executionStats instead of `stages`.
    const s = summarizeExplain(IXSCAN);
    expect(s.kind).toBe('find');
    expect(s.indexes).toEqual(['email_1']);
  });

  it('unwraps a sharded explain and shows one shard', () => {
    const s = summarizeExplain({ shards: { shard0: AGGREGATION } });
    expect(s.kind).toBe('aggregate');
    expect(s.indexes).toEqual(['status_1_placedAt_1']);
  });
});

describe('summarizeExplain — odd and missing fields', () => {
  it('degrades instead of throwing on nothing at all', () => {
    for (const input of [null, undefined, 42, 'nope', [], {}]) {
      const s = summarizeExplain(input);
      expect(s.kind).toBe('unknown');
      expect(s.stages).toEqual([]);
      expect(s.nReturned).toBeNull();
      expect(s.totalDocsExamined).toBeNull();
      expect(s.level).toBe('unknown');
      expect(s.verdict).toBeTruthy();
    }
  });

  it('keeps the plan when the server reported no execution statistics', () => {
    const s = summarizeExplain({ queryPlanner: IXSCAN.queryPlanner });
    expect(planChain(s)).toBe('FETCH → IXSCAN');
    expect(s.nReturned).toBeNull();
    expect(s.executionTimeMillis).toBeNull();
    expect(s.examinedPerReturned).toBeNull();
    expect(s.level).toBe('good');
    expect(s.verdict).toBe('Index email_1 used.');
  });

  it('ignores fields of the wrong type rather than showing them', () => {
    const s = summarizeExplain({
      queryPlanner: { namespace: 12, winningPlan: { stage: 'FETCH', inputStage: { stage: 'IXSCAN', indexName: null, keyPattern: {} } } },
      executionStats: { nReturned: 'many', totalDocsExamined: NaN, executionTimeMillis: null },
    });
    expect(s.namespace).toBeNull();
    expect(s.indexes).toEqual([]);
    expect(s.stages[1].keyPattern).toBeUndefined();
    expect(s.nReturned).toBeNull();
    expect(s.totalDocsExamined).toBeNull();
    expect(s.level).toBe('unknown');
  });

  it('does not run away on a plan that points back at itself', () => {
    const loop: any = { stage: 'FETCH' };
    loop.inputStage = loop;
    const s = summarizeExplain({ queryPlanner: { winningPlan: loop } });
    expect(s.stages.length).toBeLessThanOrEqual(32);
    expect(s.stages[0].name).toBe('FETCH');
  });

  it('skips junk entries in a stages array', () => {
    const s = summarizeExplain({ stages: [null, 'x', { $limit: 5, nReturned: 5 }] });
    expect(planChain(s)).toBe('$limit');
    expect(s.nReturned).toBe(5);
  });
});
