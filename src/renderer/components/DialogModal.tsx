import { useState, useEffect, useRef } from 'react';
import { registerDialogs, ConfirmOpts, InputOpts } from '../dialog';
import Icon from './Icon';

type PendingConfirm = { opts: ConfirmOpts; resolve: (v: boolean) => void };
type PendingInput = { opts: InputOpts; resolve: (v: string | null) => void };

export default function DialogModal() {
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [input, setInput] = useState<PendingInput | null>(null);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    registerDialogs(
      (opts) => new Promise<boolean>(resolve => setConfirm({ opts, resolve })),
      (opts) => new Promise<string | null>(resolve => {
        setInputVal(opts.defaultValue || '');
        setInput({ opts, resolve });
        setTimeout(() => inputRef.current?.focus(), 50);
      }),
    );
  }, []);

  useEffect(() => {
    if (input) setTimeout(() => inputRef.current?.select(), 60);
  }, [input]);

  const resolveConfirm = (v: boolean) => {
    confirm?.resolve(v);
    setConfirm(null);
  };

  const resolveInput = (v: string | null) => {
    input?.resolve(v);
    setInput(null);
    setInputVal('');
  };

  if (!confirm && !input) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 2000 }}
      onClick={() => { resolveConfirm(false); resolveInput(null); }}
    >
      {confirm && (
        <div className="modal" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
          {confirm.opts.title && (
            <div className="modal-header">
              <h3>{confirm.opts.title}</h3>
            </div>
          )}
          <div className="modal-body" style={{ paddingBottom: 8 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {confirm.opts.danger && <span className="dialog-icon-error"><Icon name="warn" size={20} /></span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', margin: 0 }}>
                  {confirm.opts.message}
                </p>
                {confirm.opts.detail && (
                  <p style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: '8px 0 0', fontFamily: 'monospace' }}>
                    {confirm.opts.detail}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            {!confirm.opts.hideCancel && (
              <button className="secondary" autoFocus onClick={() => resolveConfirm(false)}>Cancel</button>
            )}
            <button
              autoFocus={confirm.opts.hideCancel}
              style={confirm.opts.danger && !confirm.opts.hideCancel ? { background: 'var(--error)' } : {}}
              onClick={() => resolveConfirm(true)}
              onKeyDown={e => { if (e.key === 'Enter') resolveConfirm(true); if (e.key === 'Escape') resolveConfirm(false); }}
            >
              {confirm.opts.confirmText || 'Confirm'}
            </button>
          </div>
        </div>
      )}
      {input && (
        <div className="modal" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
          {input.opts.title && (
            <div className="modal-header">
              <h3>{input.opts.title}</h3>
            </div>
          )}
          <div className="modal-body">
            <p style={{ fontSize: 13, marginBottom: 10, color: 'var(--text-secondary)' }}>
              {input.opts.message}
            </p>
            <input
              ref={inputRef}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              placeholder={input.opts.placeholder}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '7px 10px', borderRadius: 4, fontSize: 13 }}
              onKeyDown={e => {
                if (e.key === 'Enter') resolveInput(inputVal.trim() || null);
                if (e.key === 'Escape') resolveInput(null);
              }}
            />
          </div>
          <div className="modal-footer">
            <button className="secondary" onClick={() => resolveInput(null)}>Cancel</button>
            <button onClick={() => resolveInput(inputVal.trim() || null)}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}
