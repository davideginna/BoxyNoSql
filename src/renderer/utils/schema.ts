/**
 * Schema inference from a sample of documents.
 *
 * MongoDB has no schema to read, so the only honest answer comes from looking
 * at documents: which fields exist, how often, with which types and which
 * values. Everything here is pure — the sample itself is fetched with a
 * `$sample` aggregation.
 */

import { detectType, type FieldType } from './buildFilter';

/** `null` is its own thing here: "present but empty" is what you look for. */
export type SchemaType = FieldType | 'null';

export interface SchemaField {
  /** Dotted path, e.g. `profile.level`. Array elements collapse to their array. */
  path: string;
  /** How many sampled documents have the field at all. */
  present: number;
  /** Counts per type, most common first. */
  types: { type: SchemaType; count: number }[];
  /** A few distinct values, as short display strings. */
  examples: string[];
}

export interface SchemaReport {
  sampled: number;
  fields: SchemaField[];
}

const MAX_EXAMPLES = 3;
const EXAMPLE_LENGTH = 40;

function typeOf(value: any): SchemaType {
  return value === null || value === undefined ? 'null' : detectType(value);
}

/** Short, single-line rendering of a value for the examples column. */
export function exampleOf(value: any): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object' && '$oid' in value) return `ObjectId(${value.$oid})`;
  if (typeof value === 'object' && '$date' in value) return String(value.$date);
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const flat = text.replace(/\s+/g, ' ');
  return flat.length > EXAMPLE_LENGTH ? flat.slice(0, EXAMPLE_LENGTH) + '…' : flat;
}

const isPlainObject = (v: any) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !('$oid' in v) && !('$date' in v);

/**
 * Walk the sample and describe every field path.
 *
 * Nesting is followed to `maxDepth` levels; deeper subdocuments are still
 * reported as `object` at the level where they stop, so the list stays finite
 * on a deeply nested (or recursive-looking) document.
 */
export function analyzeSchema(docs: any[], maxDepth = 3): SchemaReport {
  const acc = new Map<string, { present: number; types: Map<SchemaType, number>; examples: string[] }>();

  const record = (path: string, value: any) => {
    let entry = acc.get(path);
    if (!entry) { entry = { present: 0, types: new Map(), examples: [] }; acc.set(path, entry); }
    entry.present++;
    const type = typeOf(value);
    entry.types.set(type, (entry.types.get(type) ?? 0) + 1);
    if (entry.examples.length < MAX_EXAMPLES) {
      const example = exampleOf(value);
      if (!entry.examples.includes(example)) entry.examples.push(example);
    }
  };

  const walk = (value: any, prefix: string, depth: number) => {
    if (!isPlainObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      record(path, child);
      if (depth < maxDepth) walk(child, path, depth + 1);
    }
  };

  for (const doc of docs) walk(doc, '', 1);

  const fields = [...acc.entries()]
    .map(([path, entry]) => ({
      path,
      present: entry.present,
      types: [...entry.types.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
      examples: entry.examples,
    }))
    // Most common fields first, then alphabetically — `_id` ends up on top,
    // which is where people look for it.
    .sort((a, b) => b.present - a.present || a.path.localeCompare(b.path));

  return { sampled: docs.length, fields };
}

/** 0–100, rounded. A field on every sampled document is 100. */
export function presencePercent(field: SchemaField, sampled: number): number {
  if (sampled === 0) return 0;
  return Math.round((field.present / sampled) * 100);
}

/** `string` / `string, null` / `number (80%), string (20%)`. */
export function typeSummary(field: SchemaField): string {
  const total = field.types.reduce((sum, t) => sum + t.count, 0);
  if (field.types.length === 1) return field.types[0].type;
  return field.types
    .map(t => `${t.type} (${Math.round((t.count / total) * 100)}%)`)
    .join(', ');
}
