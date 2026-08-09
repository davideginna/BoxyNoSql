/**
 * Bulk field edit: set, rename or unset one field across a selection.
 *
 * The update document is built here, away from the modal, so what gets sent to
 * `updateMany` is unit-testable and can be shown to the user before it runs —
 * a bulk write is the one place where "what exactly is about to happen" has to
 * be answerable.
 */

export type BulkOp = 'set' | 'rename' | 'unset';

export type BulkValueType = 'string' | 'number' | 'boolean' | 'date' | 'objectid' | 'json' | 'null';

export interface BulkEdit {
  op: BulkOp;
  field: string;
  /** `set` only — raw text from the form, parsed by `parseTypedValue`. */
  value?: string;
  valueType?: BulkValueType;
  /** `rename` only. */
  newName?: string;
}

export class BulkEditError extends Error {}

/** Text from the form → the value that goes into the update, extended-JSON style. */
export function parseTypedValue(raw: string, type: BulkValueType): any {
  const text = raw.trim();
  switch (type) {
    case 'null':
      return null;
    case 'number': {
      const n = Number(text);
      if (text === '' || Number.isNaN(n)) throw new BulkEditError(`"${raw}" is not a number`);
      return n;
    }
    case 'boolean': {
      if (/^(true|1|yes)$/i.test(text)) return true;
      if (/^(false|0|no)$/i.test(text)) return false;
      throw new BulkEditError(`"${raw}" is not true or false`);
    }
    case 'date': {
      const d = new Date(text);
      if (Number.isNaN(d.getTime())) throw new BulkEditError(`"${raw}" is not a date`);
      // Extended JSON, revived to a real Date by `fromExtJSON` in the main process.
      return { $date: d.toISOString() };
    }
    case 'objectid': {
      if (!/^[0-9a-fA-F]{24}$/.test(text)) throw new BulkEditError(`"${raw}" is not a 24-character ObjectId`);
      return { $oid: text };
    }
    case 'json':
      try { return JSON.parse(text); } catch (e: any) { throw new BulkEditError(`Invalid JSON: ${e.message}`); }
    case 'string':
    default:
      return raw;
  }
}

/**
 * The Mongo update document. Throws `BulkEditError` on anything the form
 * should not have let through — the modal shows the message instead of the
 * preview.
 */
export function buildBulkUpdate(edit: BulkEdit): Record<string, any> {
  const field = edit.field.trim();
  if (!field) throw new BulkEditError('Choose a field');
  if (field === '_id') throw new BulkEditError('`_id` cannot be changed');

  if (edit.op === 'unset') return { $unset: { [field]: '' } };

  if (edit.op === 'rename') {
    const target = (edit.newName ?? '').trim();
    if (!target) throw new BulkEditError('Enter the new field name');
    if (target === '_id') throw new BulkEditError('`_id` cannot be changed');
    if (target === field) throw new BulkEditError('The new name is the same as the old one');
    return { $rename: { [field]: target } };
  }

  return { $set: { [field]: parseTypedValue(edit.value ?? '', edit.valueType ?? 'string') } };
}

/** One line describing what is about to happen, for the confirmation. */
export function describeBulkEdit(edit: BulkEdit, count: number): string {
  const docs = `${count} document${count === 1 ? '' : 's'}`;
  switch (edit.op) {
    case 'unset': return `Remove field "${edit.field}" from ${docs}`;
    case 'rename': return `Rename field "${edit.field}" to "${(edit.newName ?? '').trim()}" on ${docs}`;
    default: return `Set field "${edit.field}" on ${docs}`;
  }
}
