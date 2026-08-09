import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadQueries, saveQueries, recordRun, setName, removeQuery, forScope,
  scopeKey, previewLabel, HISTORY_LIMIT, type QueryEntry,
} from '../utils/queryHistory';

const SCOPE = scopeKey('c1', 'db', 'col');

const run = (entries: QueryEntry[], body: string, at: number, kind: 'filter' | 'query' | 'aggregation' = 'filter', scope = SCOPE) =>
  recordRun(entries, { kind, scope, body, label: body }, at);

describe('scopeKey', () => {
  it('keys history by connection, database and collection', () => {
    expect(scopeKey('c1', 'db', 'col')).toBe('c1|db|col');
  });
});

describe('recordRun', () => {
  it('adds the run', () => {
    const list = run([], '{a:1}', 1000);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: 'filter', scope: SCOPE, body: '{a:1}', at: 1000 });
    expect(list[0].name).toBeUndefined();
  });

  it('bumps an identical run instead of duplicating it', () => {
    let list = run([], '{a:1}', 1000);
    list = run(list, '{b:2}', 2000);
    list = run(list, '{a:1}', 3000);

    expect(list).toHaveLength(2);
    expect(list.find(e => e.body === '{a:1}')!.at).toBe(3000);
    expect(forScope(list, 'filter', SCOPE).recent.map(e => e.body)).toEqual(['{a:1}', '{b:2}']);
  });

  it('keeps the same body separate per kind and per collection', () => {
    let list = run([], '{a:1}', 1000);
    list = run(list, '{a:1}', 1000, 'query');
    list = run(list, '{a:1}', 1000, 'filter', scopeKey('c1', 'db', 'other'));

    expect(list).toHaveLength(3);
    expect(forScope(list, 'filter', SCOPE).recent).toHaveLength(1);
  });

  it(`drops the oldest once past ${HISTORY_LIMIT} unnamed entries`, () => {
    let list: QueryEntry[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) list = run(list, `q${i}`, 1000 + i);

    const { recent } = forScope(list, 'filter', SCOPE);
    expect(recent).toHaveLength(HISTORY_LIMIT);
    expect(recent.map(e => e.body)).not.toContain('q0');
    expect(recent[0].body).toBe(`q${HISTORY_LIMIT + 4}`);
  });

  it('never trims a saved query away, however old', () => {
    let list = run([], 'keeper', 1);
    list = setName(list, list[0].id, 'Keeper');
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) list = run(list, `q${i}`, 1000 + i);

    const { saved, recent } = forScope(list, 'filter', SCOPE);
    expect(saved.map(e => e.name)).toEqual(['Keeper']);
    expect(recent).toHaveLength(HISTORY_LIMIT);
  });

  it('leaves another collection alone when trimming', () => {
    let list = run([], 'other', 1, 'filter', scopeKey('c1', 'db', 'other'));
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) list = run(list, `q${i}`, 1000 + i);

    expect(list.filter(e => e.scope === scopeKey('c1', 'db', 'other'))).toHaveLength(1);
  });

  it('refreshes the label of a re-run entry', () => {
    let list = recordRun([], { kind: 'filter', scope: SCOPE, body: 'b', label: 'old' }, 1);
    list = recordRun(list, { kind: 'filter', scope: SCOPE, body: 'b', label: 'new' }, 2);
    expect(list[0].label).toBe('new');
  });
});

describe('setName', () => {
  it('promotes an entry to saved and back', () => {
    let list = run([], '{a:1}', 1000);
    const { id } = list[0];

    list = setName(list, id, 'By age');
    expect(forScope(list, 'filter', SCOPE).saved[0].name).toBe('By age');
    expect(forScope(list, 'filter', SCOPE).recent).toHaveLength(0);

    list = setName(list, id, null);
    expect(forScope(list, 'filter', SCOPE).saved).toHaveLength(0);
    expect(forScope(list, 'filter', SCOPE).recent[0].name).toBeUndefined();
  });
});

describe('removeQuery', () => {
  it('drops just that entry', () => {
    let list = run([], 'a', 1);
    list = run(list, 'b', 2);
    expect(removeQuery(list, list[0].id).map(e => e.body)).toEqual(['b']);
  });
});

describe('forScope', () => {
  it('sorts both sections newest first', () => {
    let list = run([], 'a', 1);
    list = run(list, 'b', 3);
    list = run(list, 'c', 2);
    expect(forScope(list, 'filter', SCOPE).recent.map(e => e.body)).toEqual(['b', 'c', 'a']);
  });

  it('is empty for a collection that never ran anything', () => {
    const list = run([], 'a', 1);
    expect(forScope(list, 'filter', scopeKey('c1', 'db', 'nope'))).toEqual({ saved: [], recent: [] });
  });
});

describe('persistence', () => {
  beforeEach(() => localStorage.clear());

  it('is empty when nothing was ever saved', () => {
    expect(loadQueries()).toEqual([]);
  });

  it('is empty rather than throwing on malformed storage', () => {
    localStorage.setItem('queryHistory', '{not json');
    expect(loadQueries()).toEqual([]);
  });

  it('round-trips the list', () => {
    const list = run([], '{a:1}', 1000);
    saveQueries(list);
    expect(loadQueries()).toEqual(list);
  });
});

describe('previewLabel', () => {
  it('flattens whitespace so a multi-line pipeline stays one row', () => {
    expect(previewLabel('{\n  a: 1\n}')).toBe('{ a: 1 }');
  });

  it('truncates past the limit', () => {
    expect(previewLabel('x'.repeat(100))).toBe('x'.repeat(70) + '…');
  });
});
