export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'objectid' | 'array' | 'object';

export type Operator =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'regex'
  | 'is_null' | 'isnt_null' | 'exists' | 'nexists'
  | 'in' | 'nin'
  | 'is_true' | 'is_false'
  | 'array_contains';

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
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return 'date';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'object') return 'object';
  return 'string';
}

function parseValue(value: string, type: FieldType): any {
  if (type === 'number') return Number(value);
  if (type === 'boolean') return value !== 'false';
  if (type === 'date') return new Date(value);
  if (type === 'objectid') return { $oid: value };
  return value;
}

function parseList(value: string, type: FieldType): any[] {
  return value.split(',').map(v => parseValue(v.trim(), type));
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
    case 'array_contains': return { [field]: parseValue(value, type) };
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
