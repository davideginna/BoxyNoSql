export type ColorMode = 'mono' | 'connection' | 'custom';

export const DEFAULT_CONNECTION_COLOR = '#f1c40f'; // yellow

export interface IconSettings {
  db: ColorMode;
  dbCustom: string;
  col: ColorMode;
  colCustom: string;
}

export const DEFAULT_ICON_SETTINGS: IconSettings = {
  db: 'custom',
  dbCustom: '#2ecc71',  // green
  col: 'custom',
  colCustom: '#f1c40f', // yellow
};

export function loadIconSettings(): IconSettings {
  try {
    const raw = localStorage.getItem('iconSettings');
    if (raw) return { ...DEFAULT_ICON_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_ICON_SETTINGS;
}

export function saveIconSettings(s: IconSettings) {
  localStorage.setItem('iconSettings', JSON.stringify(s));
}

interface ConnLike { color?: string; iconDbColor?: string; iconColColor?: string }

// Returns the stroke color for an icon, or undefined to mean "monochrome" (currentColor).
export function resolveIconColor(kind: 'db' | 'col', conn: ConnLike, s: IconSettings): string | undefined {
  const override = kind === 'db' ? conn.iconDbColor : conn.iconColColor;
  if (override) return override;
  const mode = kind === 'db' ? s.db : s.col;
  if (mode === 'mono') return undefined;
  if (mode === 'connection') return conn.color || DEFAULT_CONNECTION_COLOR;
  return kind === 'db' ? s.dbCustom : s.colCustom;
}
