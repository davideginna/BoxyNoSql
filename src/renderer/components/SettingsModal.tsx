import { useEffect } from 'react';
import { onEscape } from '../utils/keys';
import { ColorMode, IconSettings } from '../utils/iconColors';
import ColorPickerPopup from './ColorPickerPopup';
import Icon from './Icon';

interface Props {
  settings: IconSettings;
  onChange: (s: IconSettings) => void;
  onClose: () => void;
}

const MODES: { value: ColorMode; label: string }[] = [
  { value: 'mono', label: 'Monochrome' },
  { value: 'connection', label: 'Connection color' },
  { value: 'custom', label: 'Custom' },
];

function IconColorRow({
  label, mode, custom, onMode, onCustom, preview,
}: {
  label: string;
  mode: ColorMode;
  custom: string;
  onMode: (m: ColorMode) => void;
  onCustom: (c: string) => void;
  preview: React.ReactNode;
}) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {preview}
        <select value={mode} onChange={e => onMode(e.target.value as ColorMode)} style={{ flex: 1 }}>
          {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        {mode === 'custom' && (
          <ColorPickerPopup value={custom} size={24} onChange={c => onCustom(c || '#3498db')} />
        )}
      </div>
    </div>
  );
}

function DbPreview({ color }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke={color || 'currentColor'}
      strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <ellipse cx="8" cy="3.3" rx="5" ry="2" />
      <path d="M3 3.3v9.4c0 1.1 2.2 2 5 2s5-0.9 5-2V3.3" />
      <path d="M3 8c0 1.1 2.2 2 5 2s5-0.9 5-2" />
    </svg>
  );
}

function ColPreview({ color }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke={color || 'currentColor'}
      strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="2" width="10" height="12" rx="1.5" />
      <line x1="5.5" y1="5.5" x2="10.5" y2="5.5" />
      <line x1="5.5" y1="8" x2="10.5" y2="8" />
      <line x1="5.5" y1="10.5" x2="9" y2="10.5" />
    </svg>
  );
}

export default function SettingsModal({ settings, onChange, onClose }: Props) {
  useEffect(() => onEscape(onClose), [onClose]);

  // Preview color when mode is 'connection' uses a sample hue so the user sees it's colored.
  const dbPreviewColor = settings.db === 'mono' ? undefined
    : settings.db === 'custom' ? settings.dbCustom : '#2ecc71';
  const colPreviewColor = settings.col === 'mono' ? undefined
    : settings.col === 'custom' ? settings.colCustom : '#2ecc71';

  return (
    <div className="modal-overlay" style={{ zIndex: 1600 }} onClick={onClose}>
      <div className="modal" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Appearance</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={15} /></button>
        </div>
        <div className="modal-body">
          <p className="modal-intro">
            Icon colors in the database tree. Per-connection overrides live in each connection's form.
          </p>
          <IconColorRow
            label="Database icon"
            mode={settings.db}
            custom={settings.dbCustom}
            onMode={m => onChange({ ...settings, db: m })}
            onCustom={c => onChange({ ...settings, dbCustom: c })}
            preview={<DbPreview color={dbPreviewColor} />}
          />
          <IconColorRow
            label="Collection icon"
            mode={settings.col}
            custom={settings.colCustom}
            onMode={m => onChange({ ...settings, col: m })}
            onCustom={c => onChange({ ...settings, colCustom: c })}
            preview={<ColPreview color={colPreviewColor} />}
          />
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
