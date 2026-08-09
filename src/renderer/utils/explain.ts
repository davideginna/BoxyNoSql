/**
 * Reading an `explain()` result.
 *
 * What anyone actually wants out of an explain is one name and three numbers:
 * which index was used (or none), how many documents the server had to look at,
 * how many came back and how long it took. Everything else is nesting. This
 * turns the raw output into that.
 *
 * Nothing here throws. Explain output differs by server version, by deployment
 * (a sharded explain nests one plan per shard) and by query engine — the
 * classic engine puts the plan in `winningPlan`, the slot-based one one level
 * further down in `winningPlan.queryPlan` — so every field is read defensively
 * and a missing one degrades to `null` instead of taking the panel down.
 */

/** Documents examined per document returned above which an index is not earning its keep. */
export const UNSELECTIVE_RATIO = 10;

/** Depth guard: a plan tree is a handful of levels, a cycle would be a bug in the driver. */
const MAX_PLAN_DEPTH = 30;

export interface ExplainStage {
  /** Stage name as the server calls it: `IXSCAN`, `COLLSCAN`, `$group`, … */
  name: string;
  /** Depth in the plan tree, so a flat list can still be shown as a tree. */
  depth: number;
  /** Index backing this stage, when it is an index scan. */
  index?: string;
  /** The index key as `{ city: 1, age: -1 }`, when the server reported it. */
  keyPattern?: string;
  /** Documents leaving this stage. Only present with execution statistics. */
  nReturned?: number;
  /** Milliseconds spent in this stage — an estimate, as the server reports it. */
  ms?: number;
}

export type ExplainLevel = 'good' | 'warn' | 'bad' | 'unknown';

export interface ExplainSummary {
  /** Which shape the server answered with, not what was asked. */
  kind: 'find' | 'aggregate' | 'unknown';
  namespace: string | null;
  /** Winning plan, outermost stage first. */
  stages: ExplainStage[];
  /** Distinct index names in the winning plan, in plan order. Empty on a scan. */
  indexes: string[];
  collectionScan: boolean;
  nReturned: number | null;
  totalDocsExamined: number | null;
  totalKeysExamined: number | null;
  executionTimeMillis: number | null;
  /** Documents examined per document returned; a returned count of 0 counts as 1. */
  examinedPerReturned: number | null;
  level: ExplainLevel;
  /** One sentence, the thing worth reading before the numbers. */
  verdict: string;
}

const num = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: any): any => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null);
const fmt = (n: number) => n.toLocaleString();

/** `{ city: 1, age: -1 }` from the raw key pattern; `undefined` when there is none. */
function keyPatternOf(value: any): string | undefined {
  const pattern = obj(value);
  if (!pattern) return undefined;
  const entries = Object.entries(pattern);
  if (entries.length === 0) return undefined;
  return `{ ${entries.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')} }`;
}

/** The slot-based engine wraps the readable plan; the classic one does not. */
function planNode(node: any): any {
  const n = obj(node);
  if (!n) return null;
  return obj(n.queryPlan) ?? n;
}

/**
 * `depth` is what the UI indents by and `hops` is the recursion guard: a plan
 * has wrapper nodes carrying no stage of their own (a shard entry, for one),
 * and counting those as levels would indent the tree by nothing.
 */
function walkPlan(node: any, out: ExplainStage[], depth = 0, hops = 0): void {
  const n = planNode(node);
  if (!n || hops > MAX_PLAN_DEPTH) return;
  let childDepth = depth;
  if (typeof n.stage === 'string') {
    const stage: ExplainStage = { name: n.stage, depth };
    if (typeof n.indexName === 'string') stage.index = n.indexName;
    const keyPattern = keyPatternOf(n.keyPattern);
    if (keyPattern) stage.keyPattern = keyPattern;
    const nReturned = num(n.nReturned);
    if (nReturned !== null) stage.nReturned = nReturned;
    const ms = num(n.executionTimeMillisEstimate);
    if (ms !== null) stage.ms = ms;
    out.push(stage);
    childDepth = depth + 1;
  }
  // `inputStages` covers OR/SORT_MERGE, `shards`/`winningPlan` a sharded plan,
  // `executionStages` a shard entry that carries its own timings.
  const children = [
    n.inputStage,
    ...(Array.isArray(n.inputStages) ? n.inputStages : []),
    ...(Array.isArray(n.shards) ? n.shards : []),
    n.winningPlan,
    n.executionStages,
  ];
  for (const child of children) walkPlan(child, out, childDepth, hops + 1);
}

interface ParsedPlan {
  kind: ExplainSummary['kind'];
  namespace: string | null;
  stages: ExplainStage[];
  nReturned: number | null;
  totalDocsExamined: number | null;
  totalKeysExamined: number | null;
  executionTimeMillis: number | null;
}

/** The `queryPlanner` + `executionStats` shape — a find, or the `$cursor` inside a pipeline. */
function findSummary(root: any): ParsedPlan | null {
  const planner = obj(root?.queryPlanner);
  const stats = obj(root?.executionStats);
  if (!planner && !stats) return null;

  // Execution stages mirror the winning plan and carry the counts as well, so
  // they are preferred; the plan is the fallback when only the planner ran.
  const stages: ExplainStage[] = [];
  walkPlan(stats?.executionStages, stages);
  if (stages.length === 0) walkPlan(planner?.winningPlan, stages);

  return {
    kind: 'find',
    namespace: typeof planner?.namespace === 'string' ? planner.namespace : null,
    stages,
    nReturned: num(stats?.nReturned),
    totalDocsExamined: num(stats?.totalDocsExamined),
    totalKeysExamined: num(stats?.totalKeysExamined),
    executionTimeMillis: num(stats?.executionTimeMillis),
  };
}

/** The `stages` shape — an aggregation, whose first stage is usually the `$cursor` find. */
function aggregateSummary(root: any): ParsedPlan | null {
  const list = Array.isArray(root?.stages) ? root.stages : null;
  if (!list) return null;

  const stages: ExplainStage[] = [];
  let cursor: ParsedPlan | null = null;
  let lastReturned: number | null = null;
  let maxMs: number | null = null;

  for (const entry of list) {
    const e = obj(entry);
    if (!e) continue;
    const name = Object.keys(e).find(k => k.startsWith('$')) ?? Object.keys(e)[0];
    if (!name) continue;

    const ms = num(e.executionTimeMillisEstimate);
    if (ms !== null) maxMs = maxMs === null ? ms : Math.max(maxMs, ms);

    // `$cursor` is the find underneath the pipeline: the index and the examined
    // counts live in there, not in the stage list.
    if (name === '$cursor') {
      cursor = findSummary(obj(e.$cursor));
      if (cursor) {
        stages.push(ms === null ? { name, depth: 0 } : { name, depth: 0, ms });
        stages.push(...cursor.stages.map(s => ({ ...s, depth: s.depth + 1 })));
        lastReturned = cursor.nReturned ?? lastReturned;
      }
      continue;
    }

    const stage: ExplainStage = { name, depth: 0 };
    const nReturned = num(e.nReturned);
    if (nReturned !== null) { stage.nReturned = nReturned; lastReturned = nReturned; }
    if (ms !== null) stage.ms = ms;
    stages.push(stage);
  }

  return {
    kind: 'aggregate',
    namespace: cursor?.namespace ?? null,
    stages,
    // What the pipeline produced is what its *last* stage produced, not what
    // the cursor feeding it did.
    nReturned: lastReturned,
    totalDocsExamined: cursor?.totalDocsExamined ?? null,
    totalKeysExamined: cursor?.totalKeysExamined ?? null,
    executionTimeMillis:
      num(root?.executionStats?.executionTimeMillis)
      ?? cursor?.executionTimeMillis
      ?? maxMs,
  };
}

/** A sharded aggregate nests one plan per shard; the first is representative. */
function unwrapShards(raw: any): any {
  const root = obj(raw);
  if (!root) return null;
  if (root.stages || root.queryPlanner || root.executionStats) return root;
  const shards = obj(root.shards);
  if (!shards) return root;
  for (const shard of Object.values(shards)) {
    const s = obj(shard);
    if (s && (s.stages || s.queryPlanner || s.executionStats)) return s;
  }
  return root;
}

function verdictOf(s: Omit<ExplainSummary, 'level' | 'verdict'>): Pick<ExplainSummary, 'level' | 'verdict'> {
  const { totalDocsExamined: examined, nReturned: returned, examinedPerReturned: ratio } = s;
  const counts = examined !== null && returned !== null
    ? `${fmt(examined)} document${examined === 1 ? '' : 's'} examined for ${fmt(returned)} returned`
    : null;

  if (s.collectionScan) {
    return ratio !== null && ratio > 1
      ? { level: 'bad', verdict: `Collection scan — ${counts}. No index covers this query.` }
      : {
        level: 'warn',
        verdict: counts
          ? `Collection scan — ${counts}. Expected with no filter; with one, an index on the filtered fields would avoid reading everything.`
          : 'Collection scan — no index was used.',
      };
  }

  if (s.indexes.length > 0) {
    const label = s.indexes.length === 1 ? `Index ${s.indexes[0]}` : `Indexes ${s.indexes.join(', ')}`;
    if (ratio !== null && ratio >= UNSELECTIVE_RATIO) {
      return {
        level: 'warn',
        verdict: `${label} used, but ${counts} — ${fmt(Math.round(ratio))}× more read than returned, so it is not selective for this query.`,
      };
    }
    return { level: 'good', verdict: counts ? `${label} used — ${counts}.` : `${label} used.` };
  }

  if (s.stages.length === 0) {
    return { level: 'unknown', verdict: 'This server returned an explain shape that could not be read — see the raw output below.' };
  }
  return counts === null
    ? { level: 'unknown', verdict: 'The server reported the plan but no execution statistics.' }
    : { level: 'unknown', verdict: `Neither an index scan nor a collection scan in the winning plan — ${counts}.` };
}

/** Raw explain output → the handful of things worth showing. Never throws. */
export function summarizeExplain(raw: any): ExplainSummary {
  const root = unwrapShards(raw);
  const parsed: ParsedPlan = aggregateSummary(root) ?? findSummary(root) ?? {
    kind: 'unknown', namespace: null, stages: [],
    nReturned: null, totalDocsExamined: null, totalKeysExamined: null, executionTimeMillis: null,
  };

  const indexes: string[] = [];
  for (const stage of parsed.stages) {
    if (stage.index && !indexes.includes(stage.index)) indexes.push(stage.index);
  }

  const base = {
    ...parsed,
    indexes,
    collectionScan: parsed.stages.some(st => st.name === 'COLLSCAN'),
    // A query that returned nothing still read whatever it read, so 0 returned
    // counts as 1 rather than making the ratio meaningless.
    examinedPerReturned: parsed.totalDocsExamined !== null && parsed.nReturned !== null
      ? parsed.totalDocsExamined / Math.max(parsed.nReturned, 1)
      : null,
  };

  return { ...base, ...verdictOf(base) };
}

/** `FETCH → IXSCAN → …`, for a one-line rendering of the plan. */
export function planChain(summary: ExplainSummary): string {
  return summary.stages.map(s => s.name).join(' → ');
}
