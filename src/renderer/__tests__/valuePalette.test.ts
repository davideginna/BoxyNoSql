import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VALUE_PALETTE, CSS_VAR, type AppTheme, type ValueColor } from '../utils/valuePalette';

const css = readFileSync(resolve(process.cwd(), 'src/renderer/index.css'), 'utf8');

/** The declaration block of a theme: the first `:root` that defines --val-str for dark. */
function themeBlock(t: AppTheme): string {
  const start = t === 'dark'
    ? css.lastIndexOf(':root', css.indexOf('--val-str'))
    : css.indexOf(`body.theme-${t} {`);
  return css.slice(start, css.indexOf('\n}', start));
}

function cssColor(t: AppTheme, v: string): string | undefined {
  return themeBlock(t).match(new RegExp(`${v}:\\s*(#[0-9a-fA-F]{6});`))?.[1]?.toLowerCase();
}

// WCAG relative luminance / contrast ratio.
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const THEMES = Object.keys(VALUE_PALETTE) as AppTheme[];
const KINDS = Object.keys(CSS_VAR) as ValueColor[];

describe('value colours', () => {
  for (const t of THEMES) {
    describe(t, () => {
      it('match the CSS variables, so the editor and the tree agree', () => {
        for (const k of KINDS) expect(cssColor(t, CSS_VAR[k]), `${t} ${CSS_VAR[k]}`).toBe(VALUE_PALETTE[t][k]);
      });

      it('stay readable on the theme backgrounds (≥ 4.5:1)', () => {
        const bgs = ['--bg-primary', '--bg-secondary'].map(v => cssColor(t, v)!);
        for (const k of KINDS) {
          for (const bg of bgs) {
            expect(contrast(VALUE_PALETTE[t][k], bg), `${t} ${k} on ${bg}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      });

      it('give every kind of value its own colour', () => {
        const colours = KINDS.map(k => VALUE_PALETTE[t][k]);
        expect(new Set(colours).size).toBe(colours.length);
      });
    });
  }
});
