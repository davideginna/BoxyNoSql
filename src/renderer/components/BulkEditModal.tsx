import { useState, useEffect, useMemo } from 'react';
import Icon from './Icon';
import { onEscape } from '../utils/keys';
import {
  buildBulkUpdate, describeBulkEdit, BulkEditError,
  type BulkOp, type BulkValueType,
} from '../utils/bulkEdit';

const OPS: { value: BulkOp; label: string; hint: string }[] = [
  { value: 'set', label: 'Set', hint: 'Write the same value on every selected document' },
  { value: 'rename', label: 'Rename', hint: 'Rename the field, keeping each document’s value' },
  { value: 'unset', label: 'Unset', hint: 'Remove the field from every selected document' },
];

const VALUE_TYPES: { value: BulkValueType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
  { value: 'objectid', label: 'ObjectId' },
  { value: 'json', label: 'JSON' },
  { value: 'null', label: 'Null' },
];

interface Props {
  count: number;
  /** Field names seen in the loaded documents, offered as suggestions. */
  fields: string[];
  onApply: (update: Record<string, any>, description: string) => void | Promise<void>;
  onClose: () => void;
}

/**
 * Set / rename / unset one field across the selection.
 *
 * The update document is shown before it runs: a bulk write is the one place
 * where "what exactly is about to happen" has to be answerable, and the
 * `$set`/`$rename`/`$unset` line answers it exactly.
 */
export default function BulkEditModal({ count, fields, onApply, onClose }: Props) {
  const [op, setOp] = useState<BulkOp>('set');
  const [field, setField] = useState('');
  const [newName, setNewName] = useState('');
  const [value, setValue] = useState('');
  const [valueType, setValueType] = useState<BulkValueType>('string');
  const [busy, setBusy] = useState(false);

  useEffect(() => onEscape(busy ? () => {} : onClose), [onClose, busy]);

  const edit = { op, field, newName, value, valueType };
  const built = useMemo(() => {
    try { return { update: buildBulkUpdate(edit), error: null as string | null }; }
    catch (e: any) { return { update: null, error: e instanceof BulkEditError ? e.message : String(e.message) }; }
  }, [op, field, newName, value, valueType]);

  const apply = async () => {
    if (!built.update) return;
    setBusy(true);
    try { await onApply(built.update, describeBulkEdit(edit, count)); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1700 }}>
      <div className="modal" style={{ width: 480 }}>
        <div className="modal-header">
          <h3>Edit field on {count} document{count === 1 ? '' : 's'}</h3>
          <button className="icon-btn" onClick={onClose} disabled={busy}><Icon name="close" size={14} /></button>
        </div>

        <div className="modal-body bulk-edit-body">
          <div className="view-toggle bulk-op-toggle">
            {OPS.map(o => (
              <button
                key={o.value}
                className={op === o.value ? 'active' : ''}
                title={o.hint}
                onClick={() => setOp(o.value)}
              >{o.label}</button>
            ))}
          </div>
          <p className="modal-hint">{OPS.find(o => o.value === op)!.hint}</p>

          <div className="form-group">
            <label>Field</label>
            <input
              list="bulk-edit-fields"
              value={field}
              onChange={e => setField(e.target.value)}
              placeholder="field name"
              autoFocus
            />
            <datalist id="bulk-edit-fields">
              {fields.filter(f => f !== '_id').map(f => <option key={f} value={f} />)}
            </datalist>
          </div>

          {op === 'rename' && (
            <div className="form-group">
              <label>New name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="new field name" />
            </div>
          )}

          {op === 'set' && (
            <div className="form-group">
              <label>Value</label>
              <div className="bulk-value-row">
                <select value={valueType} onChange={e => setValueType(e.target.value as BulkValueType)}>
                  {VALUE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <input
                  value={value}
                  disabled={valueType === 'null'}
                  onChange={e => setValue(e.target.value)}
                  placeholder={valueType === 'json' ? '{"a": 1}' : valueType === 'date' ? '2026-08-09' : 'value'}
                />
              </div>
            </div>
          )}

          {built.error
            ? <div className="bulk-edit-error">{built.error}</div>
            : <pre className="bulk-edit-preview">{JSON.stringify(built.update, null, 2)}</pre>}
        </div>

        <div className="modal-footer">
          <button className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button onClick={apply} disabled={!built.update || busy}>
            {busy ? 'Applying…' : `Apply to ${count} document${count === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
