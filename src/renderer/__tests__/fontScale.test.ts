import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeFontScale, loadFontScale, saveFontScale, applyFontScale, fontScaleLabel,
  FONT_SCALES, DEFAULT_FONT_SCALE,
} from '../utils/fontScale';

describe('fontScale', () => {
  beforeEach(() => localStorage.clear());

  it('offers 80 / 100 / 120 %, with 100 % as the default', () => {
    expect(FONT_SCALES.map(fontScaleLabel)).toEqual(['80%', '100%', '120%']);
    expect(fontScaleLabel(DEFAULT_FONT_SCALE)).toBe('100%');
  });

  it('accepts only the offered steps', () => {
    expect(normalizeFontScale('1.44')).toBe(1.44);
    expect(normalizeFontScale(0.96)).toBe(0.96);
    expect(normalizeFontScale('1.15')).toBe(DEFAULT_FONT_SCALE);
    expect(normalizeFontScale(null)).toBe(DEFAULT_FONT_SCALE);
    expect(normalizeFontScale('abc')).toBe(DEFAULT_FONT_SCALE);
  });

  it('keeps a stored 1.2 (the old "120%") as the new default, and drops retired steps', () => {
    saveFontScale(1.2);
    expect(loadFontScale()).toBe(DEFAULT_FONT_SCALE);
    for (const old of [0.9, 1, 1.1, 1.3]) {
      saveFontScale(old);
      expect(loadFontScale()).toBe(DEFAULT_FONT_SCALE);
    }
  });

  it('round-trips through localStorage', () => {
    expect(loadFontScale()).toBe(DEFAULT_FONT_SCALE);
    saveFontScale(1.44);
    expect(loadFontScale()).toBe(1.44);
  });

  it('sets --font-scale on <html>', () => {
    applyFontScale(0.96);
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('0.96');
  });
});
