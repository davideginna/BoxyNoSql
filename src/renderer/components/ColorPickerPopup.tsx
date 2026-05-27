import { useState, useRef, useEffect } from 'react';

export const PRESET_COLORS = [
  '#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db',
  '#9b59b6','#e91e63','#795548','#607d8b','#00bcd4','#8bc34a',
];

interface Props {
  value?: string;
  onChange: (c: string | undefined) => void;
  allowClear?: boolean;
  clearLabel?: string;
  size?: number;
  title?: string;
}

function normalizeHex(s: string): string | null {
  let v = s.trim();
  if (!v.startsWith('#')) v = '#' + v;
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}

export default function ColorPickerPopup({ value, onChange, allowClear, clearLabel = 'Use default', size = 16, title }: Props) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value || '#3498db');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setHex(value || '#3498db'); }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const commitHex = (s: string) => {
    setHex(s);
    const n = normalizeHex(s);
    if (n) onChange(n);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        title={title || 'Pick color'}
        className="cp-trigger"
        style={{ width: size, height: size, background: value || 'var(--text-secondary)' }}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
      />
      {open && (
        <div className="cp-popup" onClick={e => e.stopPropagation()}>
          <div className="cp-swatches">
            {PRESET_COLORS.map(c => (
              <button
                key={c} type="button"
                className={`cp-swatch${value === c ? ' selected' : ''}`}
                style={{ background: c }}
                onClick={() => { onChange(c); setOpen(false); }}
              />
            ))}
          </div>
          <div className="cp-hex-row">
            <input
              type="color"
              value={normalizeHex(hex) || '#3498db'}
              onChange={e => commitHex(e.target.value)}
              className="cp-native"
              title="Color picker"
            />
            <input
              type="text"
              className="cp-hex-input"
              value={hex}
              placeholder="#rrggbb"
              maxLength={7}
              onChange={e => commitHex(e.target.value)}
            />
          </div>
          {allowClear && (
            <button type="button" className="cp-clear" onClick={() => { onChange(undefined); setOpen(false); }}>
              {clearLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
