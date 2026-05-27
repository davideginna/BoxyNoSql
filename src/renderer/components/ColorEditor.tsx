import { useState, useEffect } from 'react';
import { PRESET_COLORS } from './ColorPickerPopup';

interface Props {
  value?: string;
  onChange: (c: string | undefined) => void;
  allowClear?: boolean;
  clearLabel?: string;
}

export default function ColorEditor({ value, onChange, allowClear, clearLabel = 'Default' }: Props) {
  const [hex, setHex] = useState(value || '');
  useEffect(() => { setHex(value || ''); }, [value]);
  const valid = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);
  const commit = (s: string) => {
    let v = s.trim();
    if (v && !v.startsWith('#')) v = '#' + v;
    setHex(v);
    if (valid(v)) onChange(v.toLowerCase());
  };
  return (
    <div className="color-editor">
      <div className="ce-swatches">
        {PRESET_COLORS.map(c => (
          <button key={c} type="button" className={`ce-swatch${value === c ? ' selected' : ''}`}
            style={{ background: c }} title={c} onClick={() => onChange(c)} />
        ))}
      </div>
      <div className="ce-row">
        <input type="color" className="ce-native" value={valid(value || '') ? value : '#f1c40f'}
          onChange={e => onChange(e.target.value)} title="Pick color" />
        <input type="text" className="ce-hex" placeholder="#rrggbb" maxLength={7}
          value={hex} onChange={e => commit(e.target.value)} />
        {value
          ? <span className="ce-current" style={{ background: value }} title={value} />
          : <span className="override-hint">{clearLabel === 'Use global' ? 'global' : 'default'}</span>}
        {allowClear && value && (
          <button type="button" className="ce-clear" onClick={() => onChange(undefined)}>{clearLabel}</button>
        )}
      </div>
    </div>
  );
}
