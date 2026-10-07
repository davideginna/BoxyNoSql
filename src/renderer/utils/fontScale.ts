// UI text size. Every font size in index.css goes through the `--fs-*` tokens,
// which multiply by `--font-scale`, so one custom property rescales the whole
// type scale (paddings stay put — rows grow with their line height).
// Stored in `localStorage['fontScale']`.
//
// The multiplier and the label are not the same number: the token px values
// read small, so "100%" — the default — is a 1.2 multiplier, and the other two
// steps are ±20% of that. Keeping 1.2 as the stored value also means anyone who
// had picked the old "120%" lands on today's default unchanged.

export const BASE_FONT_SCALE = 1.2;
export const FONT_SCALES = [0.96, 1.2, 1.44] as const;
export const DEFAULT_FONT_SCALE = BASE_FONT_SCALE;
const KEY = 'fontScale';

/** What the setting shows for a multiplier: relative to the default, not to the raw tokens. */
export function fontScaleLabel(scale: number): string {
  return `${Math.round((scale / BASE_FONT_SCALE) * 100)}%`;
}

export function normalizeFontScale(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return (FONT_SCALES as readonly number[]).includes(n) ? n : DEFAULT_FONT_SCALE;
}

export function loadFontScale(): number {
  try { return normalizeFontScale(localStorage.getItem(KEY)); } catch { return DEFAULT_FONT_SCALE; }
}

export function saveFontScale(scale: number) {
  try { localStorage.setItem(KEY, String(scale)); } catch {}
}

export function applyFontScale(scale: number) {
  document.documentElement.style.setProperty('--font-scale', String(scale));
}
