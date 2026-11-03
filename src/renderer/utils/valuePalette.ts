/**
 * One colour per kind of value — key, string, number, boolean, null, ObjectId,
 * date — for each app theme. The same colours are the `--tree-key` / `--val-*`
 * variables in index.css (the tree and the table); this copy is what Monaco
 * gets, because a Monaco theme takes literal hex values, not CSS variables.
 * `valuePalette.test.ts` reads index.css and fails if the two drift apart.
 *
 * Every colour is ≥ 4.5:1 against its theme's editor and panel backgrounds,
 * and no two kinds share a colour within a theme.
 */
export type AppTheme = 'dark' | 'light' | 'hc' | 'solarized';
export type ValueColor = 'key' | 'str' | 'num' | 'bool' | 'null' | 'oid' | 'date';

export const VALUE_PALETTE: Record<AppTheme, Record<ValueColor, string>> = {
  dark:      { key: '#7ab0c8', str: '#ce9178', num: '#b5cea8', bool: '#569cd6', null: '#8f8f8f', oid: '#f0705f', date: '#c586c0' },
  light:     { key: '#001080', str: '#a31515', num: '#067049', bool: '#0000ff', null: '#6e6e6e', oid: '#795e26', date: '#af00db' },
  hc:        { key: '#3794ff', str: '#ffd700', num: '#89d185', bool: '#6fc3df', null: '#a0a0a0', oid: '#f48771', date: '#d670d6' },
  solarized: { key: '#cfa21a', str: '#35b5ab', num: '#ef80b6', bool: '#5aaae6', null: '#93a1a1', oid: '#ec7a45', date: '#9da1ea' },
};

/** CSS variable per colour, as index.css names them. */
export const CSS_VAR: Record<ValueColor, string> = {
  key: '--tree-key', str: '--val-str', num: '--val-num', bool: '--val-bool',
  null: '--val-null', oid: '--val-oid', date: '--val-date',
};
