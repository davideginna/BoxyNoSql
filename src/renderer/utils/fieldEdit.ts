/**
 * In-place editing of one value inside one document — the table cell, the tree
 * row, the "Edit value" / "Add field" dialog all go through here.
 *
 * Unlike the document editor, which `replaceOne`s the whole document, an
 * in-place edit is a `$set` / `$unset` / `$rename` on a single path. That is
 * what makes it safe while some fields are hidden (the row is a projection; a
 * replace would delete what is not shown) and what keeps two people editing
 * different fields of the same document from overwriting each other.
 *
 * A path is a list of segments, never a dotted string: the dotted form is only
 * built at the very end, and only when every segment can be written that way
 * (`isAddressable`). A key with a dot in it, or one starting with `$`, has no
 * update-operator path — those fall back to the document editor.
 */
import { prettyDoc, parseEditable } from './editableJson';

export type Segment = string | number;
export type Path = Segment[];

/** What a value is, as the type column and the type picker name it. */
export type ValueKind = 'string' | 'number' | 'boolean' | 'null' | 'date' | 'objectId' | 'object' | 'array';

export const VALUE_KINDS: ValueKind[] = ['string', 'number', 'boolean', 'date', 'objectId', 'null', 'object', 'array'];

export const KIND_LABEL: Record<ValueKind, string> = {
  string: 'String',
  number: 'Number',
  boolean: 'Boolean',
  null: 'Null',
  date: 'Date',
  objectId: 'ObjectId',
  object: 'Object',
  array: 'Array',
};

export class FieldEditError extends Error {}

const isOid = (v: any) => v !== null && typeof v === 'object' && !Array.isArray(v) && typeof v.$oid === 'string' && Object.keys(v).length === 1;
const isDate = (v: any) => v !== null && typeof v === 'object' && !Array.isArray(v) && '$date' in v && Object.keys(v).length === 1;

export function valueKind(v: any): ValueKind {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (Array.isArray(v)) return 'array';
  if (isOid(v)) return 'objectId';
  if (isDate(v)) return 'date';
  if (typeof v === 'object') return 'object';
  return 'string';
}

/** Objects and arrays are containers: the tree opens them, the table summarises them. */
export const isContainer = (v: any) => {
  const k = valueKind(v);
  return k === 'object' || k === 'array';
};

/** `{ 3 fields }` / `[ 5 elements ]` — what a container shows in a cell. */
export function containerSummary(v: any): string {
  if (Array.isArray(v)) return `[ ${v.length} element${v.length === 1 ? '' : 's'} ]`;
  const n = Object.keys(v ?? {}).length;
  return `{ ${n} field${n === 1 ? '' : 's'} }`;
}

/** The value as the edit box shows it. */
export function editText(v: any): string {
  switch (valueKind(v)) {
    case 'string': return v;
    case 'number': case 'boolean': return String(v);
    case 'null': return '';
    case 'objectId': return v.$oid;
    case 'date': return v.$date == null ? '' : String(v.$date);
    // One line: the inline box is an <input>. JSON.stringify escapes newlines
    // inside strings, so every newline here is structural and safe to fold.
    default: return prettyDoc(v).replace(/\n\s*/g, ' ');
  }
}

/** Text from the edit box, read as `kind`, into the Extended JSON the main process revives. */
export function parseEditValue(raw: string, kind: ValueKind): any {
  const text = raw.trim();
  switch (kind) {
    case 'string':
      return raw;
    case 'null':
      return null;
    case 'number': {
      const n = Number(text);
      if (text === '' || !Number.isFinite(n)) throw new FieldEditError(`"${raw}" is not a number`);
      return n;
    }
    case 'boolean':
      if (/^true$/i.test(text)) return true;
      if (/^false$/i.test(text)) return false;
      throw new FieldEditError('Type true or false');
    case 'date': {
      const inner = text.match(/^ISODate\(\s*["']([^"']+)["']\s*\)$/)?.[1] ?? text;
      // `+0000` (no colon) is what some exports write; Date wants `+00:00`.
      const d = new Date(inner.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
      if (!inner || Number.isNaN(d.getTime())) throw new FieldEditError(`"${raw}" is not a date`);
      return { $date: d.toISOString() };
    }
    case 'objectId': {
      const hex = text.match(/^ObjectId\(\s*["']([0-9a-fA-F]{24})["']\s*\)$/)?.[1] ?? text;
      if (!/^[0-9a-fA-F]{24}$/.test(hex)) throw new FieldEditError('An ObjectId is 24 hex characters');
      return { $oid: hex.toLowerCase() };
    }
    case 'object':
    case 'array': {
      let v: any;
      try { v = parseEditable(text || (kind === 'array' ? '[]' : '{}')); } catch (e: any) { throw new FieldEditError(`Invalid JSON: ${e.message}`); }
      if (kind === 'array' && !Array.isArray(v)) throw new FieldEditError('An array is written [ … ]');
      if (kind === 'object' && (v === null || typeof v !== 'object' || Array.isArray(v))) throw new FieldEditError('An object is written { … }');
      return v;
    }
  }
}

/**
 * Switching the type picker: keep the text when it still reads as the new
 * type, otherwise start from something that does — `true` for a boolean, now
 * for a date — so the box is never stuck showing an error the user did not cause.
 */
export function textForKind(text: string, kind: ValueKind): string {
  try { parseEditValue(text, kind); return kind === 'null' ? '' : text; } catch {}
  switch (kind) {
    case 'number': return '0';
    case 'boolean': return 'true';
    case 'date': return new Date().toISOString();
    case 'object': return '{}';
    case 'array': return '[]';
    default: return '';
  }
}

/** The value at `path`, or `undefined` when any step is missing. */
export function getAt(doc: any, path: Path): any {
  let cur = doc;
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[seg as any];
  }
  return cur;
}

/** Can this path be written as an update-operator path? */
export function isAddressable(path: Path): boolean {
  if (path.length === 0) return false;
  return path.every(s => {
    const t = String(s);
    return t !== '' && !t.includes('.') && !t.startsWith('$');
  });
}

/** `_id`, or anything under it, is the document's identity — never edited in place. */
export const isIdPath = (path: Path) => path[0] === '_id';

export const dotted = (path: Path) => path.map(String).join('.');

/** Why a path cannot be edited in place, or `null` when it can. */
export function editBlock(path: Path): string | null {
  if (isIdPath(path)) return '`_id` cannot be changed';
  if (!isAddressable(path)) return 'This field name cannot be updated in place — use Edit document';
  return null;
}

function guard(path: Path) {
  const why = editBlock(path);
  if (why) throw new FieldEditError(why);
}

export function setUpdate(path: Path, value: any): Record<string, any> {
  guard(path);
  return { $set: { [dotted(path)]: value } };
}

/**
 * Removing a field. Inside an array `$unset` would leave a `null` hole, so an
 * element is removed by writing its array back without it — `doc` is needed to
 * know which case this is.
 */
export function removeUpdate(doc: any, path: Path): Record<string, any> {
  guard(path);
  const parentPath = path.slice(0, -1);
  const parent = parentPath.length ? getAt(doc, parentPath) : doc;
  if (Array.isArray(parent)) {
    const idx = Number(path[path.length - 1]);
    return { $set: { [dotted(parentPath)]: parent.filter((_, i) => i !== idx) } };
  }
  return { $unset: { [dotted(path)]: '' } };
}

export function renameUpdate(doc: any, path: Path, newName: string): Record<string, any> {
  guard(path);
  const name = newName.trim();
  if (!name) throw new FieldEditError('Enter the new field name');
  if (name === String(path[path.length - 1])) throw new FieldEditError('The new name is the same as the old one');
  const target = [...path.slice(0, -1), name];
  guard(target);
  const parentPath = path.slice(0, -1);
  const parent = parentPath.length ? getAt(doc, parentPath) : doc;
  // `$rename` does not work on paths through arrays, and an element has an index, not a name.
  const throughArray = path.some((_, i) => Array.isArray(i === 0 ? doc : getAt(doc, path.slice(0, i))));
  if (throughArray) {
    throw new FieldEditError('Fields inside an array cannot be renamed in place — use Edit document');
  }
  if (parent && typeof parent === 'object' && name in parent) throw new FieldEditError(`"${name}" already exists here`);
  return { $rename: { [dotted(path)]: dotted(target) } };
}

/** A field added under `parent` (`[]` = the document itself). */
export function addFieldPath(doc: any, parent: Path, name: string): Path {
  const container = parent.length ? getAt(doc, parent) : doc;
  if (Array.isArray(container)) return [...parent, container.length];
  const key = name.trim();
  if (!key) throw new FieldEditError('Enter a field name');
  if (container && typeof container === 'object' && key in container) throw new FieldEditError(`"${key}" already exists here`);
  const path = [...parent, key];
  guard(path);
  return path;
}

// ── Local patch ─────────────────────────────────────────────────────────────
// After the server accepted an update the row is patched in place instead of
// re-fetching the page: a reload would re-run the query, and a document whose
// edited field is the sort key or part of the filter would jump or vanish from
// under the cursor.

function cloneAlong(doc: any, path: Path): { root: any; parent: any } {
  const root = Array.isArray(doc) ? [...doc] : { ...doc };
  let cur = root;
  for (const seg of path.slice(0, -1)) {
    const next = cur[seg as any];
    const copy = Array.isArray(next) ? [...next] : (next && typeof next === 'object') ? { ...next } : {};
    cur[seg as any] = copy;
    cur = copy;
  }
  return { root, parent: cur };
}

export function patchSet(doc: any, path: Path, value: any): any {
  const { root, parent } = cloneAlong(doc, path);
  parent[path[path.length - 1] as any] = value;
  return root;
}

export function patchRemove(doc: any, path: Path): any {
  const { root, parent } = cloneAlong(doc, path);
  const last = path[path.length - 1];
  if (Array.isArray(parent)) parent.splice(Number(last), 1);
  else delete parent[last as any];
  return root;
}

/** The renamed key keeps its place in the row, so the column does not jump while the page is on screen. */
export function patchRename(doc: any, path: Path, newName: string): any {
  const { root, parent } = cloneAlong(doc, path);
  const last = String(path[path.length - 1]);
  const entries = Object.entries(parent).map(([k, v]) => [k === last ? newName : k, v] as const);
  for (const k of Object.keys(parent)) delete parent[k];
  for (const [k, v] of entries) parent[k] = v;
  return root;
}
