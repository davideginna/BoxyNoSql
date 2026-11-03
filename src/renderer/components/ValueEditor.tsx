import { useState, useEffect, useMemo, useRef } from 'react';
import Icon from './Icon';
import { onEscape } from '../utils/keys';
import { prettyDoc } from '../utils/editableJson';
import {
  VALUE_KINDS, KIND_LABEL, valueKind, editText, parseEditValue, textForKind, FieldEditError,
  type ValueKind,
} from '../utils/fieldEdit';

const tryParse = (text: string, kind: ValueKind): { value?: any; error: string | null } => {
  try { return { value: parseEditValue(text, kind), error: null }; }
  catch (e: any) { return { error: e instanceof FieldEditError ? e.message : String(e.message) }; }
};

interface InlineProps {
  value: any;
  /** Resolves when the write is done; a rejection keeps the editor open with the message. */
  onCommit: (value: any) => Promise<void>;
  onCancel: () => void;
}

/**
 * The in-place editor of a table cell or a tree value: a text box plus the type
 * it will be saved as. The type starts as the value's own, so an untouched
 * number stays a number; changing it is how a field changes type.
 *
 * Enter saves, Escape (through the shared stack) cancels, and so does leaving
 * the editor — losing an edit is cheaper than writing one nobody confirmed.
 */
export function InlineValueEditor({ value, onCommit, onCancel }: InlineProps) {
  const initialKind = valueKind(value);
  // Containers are edited as JSON on one line; null starts as a string, the
  // usual reason to edit a null being to fill it in.
  const [kind, setKind] = useState<ValueKind>(initialKind === 'null' ? 'string' : initialKind);
  const [text, setText] = useState(() => editText(value));
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => tryParse(text, kind), [text, kind]);
  const error = serverError ?? parsed.error;

  useEffect(() => onEscape(busy ? () => {} : onCancel), [onCancel, busy]);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const commit = async () => {
    if (parsed.error || busy) return;
    setBusy(true);
    try { await onCommit(parsed.value); }
    catch (e: any) { setServerError(e.message); setBusy(false); }
  };

  return (
    <div
      className="inline-editor"
      ref={boxRef}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onBlur={e => {
        // Moving between the box and the type picker is not leaving.
        if (busy || boxRef.current?.contains(e.relatedTarget as Node)) return;
        onCancel();
      }}
    >
      <input
        ref={inputRef}
        className={`inline-editor-input${error ? ' invalid' : ''}`}
        value={text}
        disabled={kind === 'null' || busy}
        title={error ?? 'Enter to save · Esc to cancel'}
        aria-label="Value"
        aria-invalid={!!error}
        onChange={e => { setText(e.target.value); setServerError(null); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          // Arrow keys and Delete belong to the text box, not to the grid under
          // it. Escape is left alone: it reaches the shared stack, which cancels.
          if (e.key !== 'Escape') e.stopPropagation();
        }}
      />
      <select
        className="inline-editor-type"
        value={kind}
        disabled={busy}
        aria-label="Type"
        title="Save the value as this type"
        onChange={e => {
          const k = e.target.value as ValueKind;
          setKind(k); setText(t => textForKind(t, k)); setServerError(null);
          inputRef.current?.focus();
        }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
      >
        {VALUE_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
      </select>
      <button className="inline-editor-btn" title="Save (Enter)" aria-label="Save value"
        disabled={!!parsed.error || busy} onClick={commit}><Icon name="check" size={12} /></button>
      <button className="inline-editor-btn" title="Cancel (Esc)" aria-label="Cancel edit"
        disabled={busy} onClick={onCancel}><Icon name="close" size={12} /></button>
    </div>
  );
}

interface ModalProps {
  title: string;
  /** Field name box: shown for Add field, where the name is still to be chosen. */
  askName?: boolean;
  /** The path the value lives under, for the heading line. */
  where: string;
  value: any;
  /** Builds the update shown before saving; throws for an invalid name. */
  preview: (name: string, value: any) => Record<string, any>;
  onSave: (name: string, value: any) => Promise<void>;
  onClose: () => void;
}

/**
 * The same edit with room: a multi-line box for objects and arrays, a name for
 * Add field, and the update document that is about to run.
 */
export function ValueModal({ title, askName, where, value, preview, onSave, onClose }: ModalProps) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ValueKind>(askName ? 'string' : valueKind(value));
  const [text, setText] = useState(() => {
    const k = valueKind(value);
    return k === 'object' || k === 'array' ? prettyDoc(value) : editText(value);
  });
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => onEscape(busy ? () => {} : onClose), [onClose, busy]);

  const built = useMemo(() => {
    const p = tryParse(text, kind);
    if (p.error) return { error: p.error };
    try { return { update: preview(name, p.value), value: p.value, error: null }; }
    catch (e: any) { return { error: e.message as string }; }
  }, [text, kind, name, preview]);

  const save = async () => {
    if (built.error || busy) return;
    setBusy(true);
    try { await onSave(name, built.value); }
    catch (e: any) { setServerError(e.message); setBusy(false); }
  };

  // A string with line breaks gets the box too: an <input> drops them.
  const multiline = kind === 'object' || kind === 'array' || (kind === 'string' && /[\r\n]/.test(text));

  return (
    <div className="modal-overlay" style={{ zIndex: 1700 }}>
      <div className="modal" style={{ width: 520 }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><Icon name="close" size={14} /></button>
        </div>
        <div className="modal-body bulk-edit-body">
          <p className="modal-hint">{where}</p>
          {askName && (
            <div className="form-group">
              <label>Field name</label>
              <input value={name} autoFocus placeholder="field name" aria-label="Field name"
                onChange={e => { setName(e.target.value); setServerError(null); }} />
            </div>
          )}
          <div className="form-group">
            <label>Value</label>
            <div className="bulk-value-row">
              <select value={kind} aria-label="Type" onChange={e => {
                const k = e.target.value as ValueKind;
                setKind(k); setText(t => textForKind(t, k)); setServerError(null);
              }}>
                {VALUE_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              {!multiline && (
                <input value={text} disabled={kind === 'null'} aria-label="Value" autoFocus={!askName}
                  onChange={e => { setText(e.target.value); setServerError(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') save(); }} />
              )}
            </div>
            {multiline && (
              <textarea className="value-modal-json" value={text} aria-label="Value" spellCheck={false}
                autoFocus={!askName} rows={10}
                onChange={e => { setText(e.target.value); setServerError(null); }}
                onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save(); }} />
            )}
            {multiline && (
              <div className="modal-hint">Ctrl+Enter to save</div>
            )}
          </div>
          {serverError || built.error
            ? <div className="bulk-edit-error">{serverError ?? built.error}</div>
            : <pre className="bulk-edit-preview">{JSON.stringify(built.update, null, 2)}</pre>}
        </div>
        <div className="modal-footer">
          <button className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button onClick={save} disabled={!!built.error || busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
