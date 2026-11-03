import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { VALUE_PALETTE, type AppTheme } from '../utils/valuePalette';

/** The editor themes the views ask for — one per app theme. */
export type MonacoThemeName = 'vs-dark' | 'vs' | 'hc-black' | 'boxy-solarized';

const APP_THEME: Record<MonacoThemeName, AppTheme> = {
  'vs-dark': 'dark', vs: 'light', 'hc-black': 'hc', 'boxy-solarized': 'solarized',
};
const BASE: Record<MonacoThemeName, monaco.editor.BuiltinTheme> = {
  'vs-dark': 'vs-dark', vs: 'vs', 'hc-black': 'hc-black', 'boxy-solarized': 'vs-dark',
};

// Monaco ships no solarized theme: without these the editor stayed blue-grey
// inside an otherwise teal UI.
const SOLARIZED_RULES: monaco.editor.ITokenThemeRule[] = [
  { token: '', foreground: 'eee8d5', background: '002b36' },
  { token: 'comment', foreground: '586e75', fontStyle: 'italic' },
  { token: 'string', foreground: '2aa198' },
  { token: 'number', foreground: 'd33682' },
  { token: 'keyword', foreground: '859900' },
  { token: 'identifier', foreground: 'eee8d5' },
  { token: 'delimiter', foreground: '93a1a1' },
];
const SOLARIZED_COLORS: monaco.editor.IColors = {
  'editor.background': '#002b36',
  'editor.foreground': '#eee8d5',
  'editorLineNumber.foreground': '#586e75',
  'editorLineNumber.activeForeground': '#b58900',
  'editorCursor.foreground': '#b58900',
  'editor.selectionBackground': '#0d5766',
  'editor.lineHighlightBackground': '#073642',
  'editorSuggestWidget.background': '#073642',
  'editorSuggestWidget.border': '#0d4a58',
  'editorSuggestWidget.selectedBackground': '#0d5766',
};

/** Theme names actually registered with Monaco (built-ins cannot be redefined). */
export const registeredName = (t: MonacoThemeName) => `boxy-${APP_THEME[t]}`;

let defined = false;
function defineThemes() {
  if (defined) return;
  defined = true;
  for (const t of Object.keys(APP_THEME) as MonacoThemeName[]) {
    const p = VALUE_PALETTE[APP_THEME[t]];
    const c = (hex: string) => hex.slice(1);
    // Tokens of the `boxy-json` language below; every other language keeps
    // the base theme's colours.
    const valueRules: monaco.editor.ITokenThemeRule[] = [
      { token: 'key.boxy-json', foreground: c(p.key) },
      { token: 'string.boxy-json', foreground: c(p.str) },
      { token: 'number.boxy-json', foreground: c(p.num) },
      { token: 'boolean.boxy-json', foreground: c(p.bool) },
      { token: 'null.boxy-json', foreground: c(p.null), fontStyle: 'italic' },
      { token: 'objectid.boxy-json', foreground: c(p.oid) },
      { token: 'date.boxy-json', foreground: c(p.date) },
    ];
    monaco.editor.defineTheme(registeredName(t), {
      base: BASE[t],
      inherit: true,
      rules: t === 'boxy-solarized' ? [...SOLARIZED_RULES, ...valueRules] : valueRules,
      colors: t === 'boxy-solarized' ? SOLARIZED_COLORS : {},
    });
  }
}

/** Monaco has one theme for the whole window: every editor goes through here. */
export function applyMonacoTheme(t: MonacoThemeName) {
  defineThemes();
  monaco.editor.setTheme(registeredName(t));
}

/** The view's editor theme, from the app theme class on <body>. */
export function currentMonacoTheme(): MonacoThemeName {
  const cl = document.body.classList;
  return cl.contains('theme-light') ? 'vs'
    : cl.contains('theme-hc') ? 'hc-black'
    : cl.contains('theme-solarized') ? 'boxy-solarized'
    : 'vs-dark';
}

/**
 * The document dialect — JSON plus shell-style `ObjectId("…")` / `ISODate("…")`
 * (see utils/editableJson.ts) — with a token per kind of value, so a key, a
 * string, a number, a boolean, null, an ObjectId and a date each get their own
 * colour. Monaco's own `json` tokenizer cannot do that: it has no idea what
 * `ObjectId(…)` is and colours keys and strings alike in most themes.
 */
export const DOC_LANGUAGE = 'boxy-json';
let registered = false;
export function ensureDocLanguage() {
  if (registered) return;
  registered = true;
  monaco.languages.register({ id: DOC_LANGUAGE });
  monaco.languages.setMonarchTokensProvider(DOC_LANGUAGE, {
    tokenPostfix: '.boxy-json',
    tokenizer: {
      root: [
        [/\s+/, ''],
        [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'key'],
        [/(?:ObjectId)\(\s*["'][^"']*["']\s*\)/, 'objectid'],
        [/(?:ISODate|new Date)\(\s*["'][^"']*["']\s*\)/, 'date'],
        [/"(?:[^"\\]|\\.)*"/, 'string'],
        [/"(?:[^"\\]|\\.)*$/, 'string'],
        [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
        [/\b(?:true|false)\b/, 'boolean'],
        [/\bnull\b/, 'null'],
        [/[{}[\]]/, '@brackets'],
        [/[,:]/, 'delimiter'],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration(DOC_LANGUAGE, {
    brackets: [['{', '}'], ['[', ']']],
    autoClosingPairs: [
      { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '"', close: '"', notIn: ['string'] },
    ],
    surroundingPairs: [{ open: '{', close: '}' }, { open: '[', close: ']' }, { open: '"', close: '"' }],
  });
}
