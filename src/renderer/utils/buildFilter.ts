export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'objectid' | 'array' | 'object';

export type Operator =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'regex'
  | 'is_null' | 'isnt_null' | 'exists' | 'nexists'
  | 'in' | 'nin'
  | 'is_true' | 'is_false'
  | 'array_contains' | 'array_has';

export interface OperatorDef {
  value: Operator;
  label: string;
  noValue?: boolean;
}

export const OPERATORS_BY_TYPE: Record<FieldType, OperatorDef[]> = {
  string: [
    { value: 'eq',           label: 'equals' },
    { value: 'ne',           label: 'not equals' },
    { value: 'contains',     label: 'contains' },
    { value: 'not_contains', label: "doesn't contain" },
    { value: 'starts_with',  label: 'starts with' },
    { value: 'ends_with',    label: 'ends with' },
    { value: 'regex',        label: 'regex' },
    { value: 'is_null',      label: 'is null',        noValue: true },
    { value: 'isnt_null',    label: "isn't null",     noValue: true },
    { value: 'exists',       label: 'exists',         noValue: true },
    { value: 'nexists',      label: "doesn't exist",  noValue: true },
    { value: 'in',           label: 'in (comma sep)' },
    { value: 'nin',          label: 'not in (comma sep)' },
  ],
  number: [
    { value: 'eq',      label: '=' },
    { value: 'ne',      label: '≠' },
    { value: 'gt',      label: '>' },
    { value: 'gte',     label: '≥' },
    { value: 'lt',      label: '<' },
    { value: 'lte',     label: '≤' },
    { value: 'is_null', label: 'is null',       noValue: true },
    { value: 'exists',  label: 'exists',        noValue: true },
    { value: 'nexists', label: "doesn't exist", noValue: true },
    { value: 'in',      label: 'in (comma sep)' },
    { value: 'nin',     label: 'not in' },
  ],
  boolean: [
    { value: 'is_true',  label: 'is true',       noValue: true },
    { value: 'is_false', label: 'is false',      noValue: true },
    { value: 'exists',   label: 'exists',        noValue: true },
    { value: 'nexists',  label: "doesn't exist", noValue: true },
  ],
  date: [
    { value: 'eq',      label: 'equals' },
    { value: 'lt',      label: 'before' },
    { value: 'gt',      label: 'after' },
    { value: 'lte',     label: 'on or before' },
    { value: 'gte',     label: 'on or after' },
    { value: 'is_null', label: 'is null',       noValue: true },
    { value: 'exists',  label: 'exists',        noValue: true },
    { value: 'nexists', label: "doesn't exist", noValue: true },
  ],
  objectid: [
    { value: 'eq',      label: 'equals' },
    { value: 'ne',      label: 'not equals' },
    { value: 'exists',  label: 'exists',        noValue: true },
    { value: 'nexists', label: "doesn't exist", noValue: true },
  ],
  array: [
    { value: 'array_contains', label: 'contains' },
    { value: 'array_has',      label: 'has element' },
    { value: 'exists',         label: 'exists',        noValue: true },
    { value: 'nexists',        label: "doesn't exist", noValue: true },
  ],
  object: [
    { value: 'exists',  label: 'exists',        noValue: true },
    { value: 'nexists', label: "doesn't exist", noValue: true },
  ],
};

export const TYPE_COLORS: Record<FieldType, string> = {
  string:   '#3794ff',
  number:   '#e67e22',
  boolean:  '#2ecc71',
  date:     '#9b59b6',
  objectid: '#e74c3c',
  array:    '#f1c40f',
  object:   '#607d8b',
};

export const TYPE_LABELS: Record<FieldType, string> = {
  string:   'String',
  number:   'Number',
  boolean:  'Boolean',
  date:     'Date',
  objectid: 'ObjectId',
  array:    'Array',
  object:   'Object',
};

export interface Condition {
  id: number;
  field: string;
  op: Operator;
  value: string;
  type: FieldType;
}

export function detectType(value: any): FieldType {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (value && typeof value === 'object' && '$oid' in value) return 'objectid';
  if (value && typeof value === 'object' && value._bsontype === 'ObjectId') return 'objectid';
  if (value instanceof Date) return 'date';
  if (value && typeof value === 'object' && '$date' in value) return 'date';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return 'date';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'object') return 'object';
  return 'string';
}

function parseValue(value: string, type: FieldType): any {
  if (type === 'number') return Number(value);
  if (type === 'boolean') return value !== 'false';
  // Extended JSON like `{$oid}`, so the filter reads as `ISODate(…)` in the
  // JSON editor and round-trips; the main process revives it (`fromExtJSON`).
  if (type === 'date') {
    const d = new Date(value);
    return { $date: isNaN(d.getTime()) ? value : d.toISOString() };
  }
  if (type === 'objectid') return { $oid: value };
  return value;
}

function parseList(value: string, type: FieldType): any[] {
  return value.split(',').map(v => parseValue(v.trim(), type));
}

/**
 * Candidates for an exact array-element match. The value box is text, but the
 * array may hold numbers or booleans, so `5` looks for both `5` and `"5"`.
 */
function elementCandidates(value: string): any[] {
  const out: any[] = [value];
  if (value.trim() !== '' && !isNaN(Number(value))) out.push(Number(value));
  if (value === 'true' || value === 'false') out.push(value === 'true');
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function conditionToMongo(c: Condition): any {
  const { field, op, value, type } = c;
  switch (op) {
    case 'eq':           return { [field]: { $eq: parseValue(value, type) } };
    case 'ne':           return { [field]: { $ne: parseValue(value, type) } };
    case 'gt':           return { [field]: { $gt: parseValue(value, type) } };
    case 'gte':          return { [field]: { $gte: parseValue(value, type) } };
    case 'lt':           return { [field]: { $lt: parseValue(value, type) } };
    case 'lte':          return { [field]: { $lte: parseValue(value, type) } };
    // A query on an array field matches when any element matches, so the same
    // regex `contains` uses on a string finds the arrays holding such a string.
    case 'array_contains': return { [field]: { $regex: escapeRegex(value), $options: 'i' } };
    case 'array_has': {
      const vals = elementCandidates(value);
      return { [field]: vals.length === 1 ? vals[0] : { $in: vals } };
    }
    case 'contains':     return { [field]: { $regex: escapeRegex(value), $options: 'i' } };
    case 'not_contains': return { [field]: { $not: { $regex: escapeRegex(value), $options: 'i' } } };
    case 'starts_with':  return { [field]: { $regex: '^' + escapeRegex(value), $options: 'i' } };
    case 'ends_with':    return { [field]: { $regex: escapeRegex(value) + '$', $options: 'i' } };
    case 'regex':        return { [field]: { $regex: value } };
    case 'is_null':      return { [field]: null };
    case 'isnt_null':    return { [field]: { $ne: null } };
    case 'exists':       return { [field]: { $exists: true } };
    case 'nexists':      return { [field]: { $exists: false } };
    case 'in':           return { [field]: { $in: parseList(value, type) } };
    case 'nin':          return { [field]: { $nin: parseList(value, type) } };
    case 'is_true':      return { [field]: true };
    case 'is_false':     return { [field]: false };
    default:             return {};
  }
}

export function buildFilter(conditions: Condition[], matchAll = true): any {
  if (conditions.length === 0) return {};
  const parts = conditions.map(conditionToMongo).filter(p => Object.keys(p).length > 0);
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return matchAll ? { $and: parts } : { $or: parts };
}

// ── JSON → conditions ────────────────────────────────────────────────────────

export type ParsedCondition = Omit<Condition, 'id'>;

/** The literal a regex stands for, if it is just an escaped literal; null otherwise. */
function regexLiteral(pattern: string): string | null {
  const plain = pattern.replace(/\\(.)/g, '$1');
  return escapeRegex(plain) === pattern ? plain : null;
}

/** A filter value as the builder holds it: its type and the text in the value box. */
function valueOf(v: any): { type: FieldType; text: string } | null {
  if (typeof v === 'number') return { type: 'number', text: String(v) };
  if (typeof v === 'string') return { type: 'string', text: v };
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === '$oid' && typeof v.$oid === 'string') return { type: 'objectid', text: v.$oid };
    if (keys.length === 1 && keys[0] === '$date' && typeof v.$date === 'string') return { type: 'date', text: v.$date };
  }
  return null;
}

const allowed = (type: FieldType, op: Operator) => OPERATORS_BY_TYPE[type].some(o => o.value === op);

function cond(field: string, op: Operator, type: FieldType, value = ''): ParsedCondition | null {
  return allowed(type, op) ? { field, op, type, value } : null;
}

/** One `{field: spec}` pair back into a builder condition, or null if the builder cannot express it. */
function partToCondition(field: string, spec: any): ParsedCondition | null {
  if (field.startsWith('$')) return null;
  if (spec === null) return cond(field, 'is_null', 'string');
  if (spec === true) return cond(field, 'is_true', 'boolean');
  if (spec === false) return cond(field, 'is_false', 'boolean');
  const plain = valueOf(spec);
  if (plain) return cond(field, 'eq', plain.type, plain.text);
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;

  const keys = Object.keys(spec);
  if (keys.length === 2 && '$regex' in spec && '$options' in spec) {
    if (spec.$options !== 'i' || typeof spec.$regex !== 'string') return null;
    const re: string = spec.$regex;
    if (re.startsWith('^')) { const lit = regexLiteral(re.slice(1)); if (lit !== null) return cond(field, 'starts_with', 'string', lit); }
    if (re.endsWith('$') && !re.endsWith('\\$')) { const lit = regexLiteral(re.slice(0, -1)); if (lit !== null) return cond(field, 'ends_with', 'string', lit); }
    const lit = regexLiteral(re);
    return lit !== null ? cond(field, 'contains', 'string', lit) : null;
  }
  if (keys.length !== 1) return null;
  const [op] = keys;
  const v = spec[op];
  switch (op) {
    case '$eq': case '$ne': case '$gt': case '$gte': case '$lt': case '$lte': {
      if (op === '$ne' && v === null) return cond(field, 'isnt_null', 'string');
      const val = valueOf(v);
      return val ? cond(field, op.slice(1) as Operator, val.type, val.text) : null;
    }
    case '$regex': return typeof v === 'string' ? cond(field, 'regex', 'string', v) : null;
    case '$not': {
      if (!v || typeof v !== 'object' || Object.keys(v).length !== 2 || v.$options !== 'i' || typeof v.$regex !== 'string') return null;
      const lit = regexLiteral(v.$regex);
      return lit !== null ? cond(field, 'not_contains', 'string', lit) : null;
    }
    case '$exists': return typeof v === 'boolean' ? cond(field, v ? 'exists' : 'nexists', 'string') : null;
    case '$in': case '$nin': {
      if (!Array.isArray(v) || v.length === 0) return null;
      const vals = v.map(valueOf);
      if (vals.some(x => !x || x.type !== vals[0]!.type || x.text.includes(','))) return null;
      return cond(field, op.slice(1) as Operator, vals[0]!.type, vals.map(x => x!.text).join(', '));
    }
    default: return null;
  }
}

/** A plain object's `{field: spec}` pairs as conditions — all or nothing. */
function objectToConditions(obj: any): ParsedCondition[] | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const out: ParsedCondition[] = [];
  for (const [field, spec] of Object.entries(obj)) {
    const c = partToCondition(field, spec);
    if (!c) return null;
    out.push(c);
  }
  return out;
}

/**
 * Inverse of `buildFilter`: a Mongo filter back into builder conditions, so a
 * filter edited as JSON can land back in the panel. Covers what `buildFilter`
 * itself produces plus the obvious hand-written forms (`{a: 1}`, several
 * top-level keys as an implicit AND). Anything the builder cannot express —
 * `$elemMatch`, `$expr`, nested logic, a regex with other options — returns
 * null and the caller keeps the JSON as-is instead of losing part of it.
 */
export function parseFilter(filter: any): { matchAll: boolean; conditions: ParsedCondition[] } | null {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return null;
  const keys = Object.keys(filter);
  if (keys.length === 1 && (keys[0] === '$and' || keys[0] === '$or')) {
    const parts = filter[keys[0]];
    if (!Array.isArray(parts)) return null;
    const conditions: ParsedCondition[] = [];
    for (const part of parts) {
      // Inside $or each part must be one condition, or the grouping would change.
      if (keys[0] === '$or' && (!part || typeof part !== 'object' || Object.keys(part).length !== 1)) return null;
      const cs = objectToConditions(part);
      if (!cs) return null;
      conditions.push(...cs);
    }
    return { matchAll: keys[0] === '$and', conditions };
  }
  const conditions = objectToConditions(filter);
  return conditions ? { matchAll: true, conditions } : null;
}

/**
 * Like `parseFilter`, but never gives up on the whole filter: under an AND
 * (several top-level keys, or `$and`) every part the builder can show becomes
 * a condition and only the rest is returned as `rest`, to be kept as custom
 * JSON — `combineFilters(rest, buildFilter(conditions))` is the same filter.
 * An `$or` that does not parse whole stays whole: splitting it would change it.
 */
export function splitFilter(filter: any): { matchAll: boolean; conditions: ParsedCondition[]; rest: any | null } {
  const whole = parseFilter(filter);
  if (whole) return { ...whole, rest: null };
  const asRest = { matchAll: true, conditions: [] as ParsedCondition[], rest: filter };
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return asRest;

  const keys = Object.keys(filter);
  if (keys.length === 1 && keys[0] === '$and' && Array.isArray(filter.$and)) {
    const conditions: ParsedCondition[] = [];
    const restParts: any[] = [];
    for (const part of filter.$and) {
      const cs = objectToConditions(part);
      if (cs) conditions.push(...cs); else restParts.push(part);
    }
    const rest = restParts.length === 1 ? restParts[0] : { $and: restParts };
    return { matchAll: true, conditions, rest };
  }
  if (keys.length === 1) return asRest;

  const conditions: ParsedCondition[] = [];
  const rest: Record<string, any> = {};
  for (const [field, spec] of Object.entries(filter)) {
    const c = partToCondition(field, spec);
    if (c) conditions.push(c); else rest[field] = spec;
  }
  return { matchAll: true, conditions, rest };
}

/** The builder's filter combined with a hand-written one the builder could not take apart. */
export function combineFilters(raw: any, built: any): any {
  const hasRaw = raw && Object.keys(raw).length > 0;
  const hasBuilt = built && Object.keys(built).length > 0;
  if (hasRaw && hasBuilt) return { $and: [raw, built] };
  return hasRaw ? raw : (built ?? {});
}
