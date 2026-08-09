/**
 * Matching for the command palette.
 *
 * Subsequence matching, not substring: `usr` has to find `users` and `tdb.usr`
 * has to find `testdb.users`. Ranking is what makes that usable — a match at a
 * word start beats one in the middle, and a run of consecutive characters beats
 * a scattered one, so typing `co` puts `collections` above `connection colors`.
 */

export type PaletteKind = 'connection' | 'database' | 'collection' | 'action';

export interface PaletteItem {
  id: string;
  kind: PaletteKind;
  label: string;
  /** Shown next to the label: the path, the connection, a shortcut. */
  sublabel?: string;
  /** Extra text that should match but is not worth showing. */
  keywords?: string;
  run: () => void;
}

const WORD_BOUNDARY = /[\s./\-_:|]/;

/**
 * Score of `query` against `text`, or -1 when it does not match at all.
 * Higher is better; 0 is a legitimate (poor) match.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();

  let score = 0;
  let ti = 0;
  let previousHit = -2;
  for (const char of q) {
    if (char === ' ') continue;  // spaces only separate the terms the user typed
    const hit = t.indexOf(char, ti);
    if (hit === -1) return -1;
    // Consecutive characters are the strongest signal that this is the word.
    if (hit === previousHit + 1) score += 6;
    // A hit at the start of the text, or right after a separator, beats one
    // buried inside a word.
    if (hit === 0) score += 8;
    else if (WORD_BOUNDARY.test(t[hit - 1])) score += 4;
    score += 1;
    previousHit = hit;
    ti = hit + 1;
  }
  // Short texts are more likely to be what was meant: `users` over `users_audit`.
  return score - Math.min(t.length / 10, 4);
}

/** Best match for the query across the label, the sublabel and the keywords. */
export function scoreItem(query: string, item: PaletteItem): number {
  const label = fuzzyScore(query, item.label);
  // A hit in the label is worth more than one in the path or the keywords.
  const sub = item.sublabel ? fuzzyScore(query, item.sublabel) - 3 : -1;
  const keys = item.keywords ? fuzzyScore(query, item.keywords) - 4 : -1;
  const full = fuzzyScore(query, `${item.sublabel ? item.sublabel + ' ' : ''}${item.label}`) - 1;
  return Math.max(label, sub, keys, full);
}

/**
 * Ranked matches. An empty query keeps the caller's own order, which is how
 * the palette shows actions first before anything is typed.
 */
export function filterItems(items: PaletteItem[], query: string, limit = 50): PaletteItem[] {
  if (!query.trim()) return items.slice(0, limit);
  return items
    .map((item, index) => ({ item, index, score: scoreItem(query, item) }))
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(x => x.item);
}

/** Index after moving `delta` rows, wrapping at both ends. */
export function moveSelection(current: number, delta: number, count: number): number {
  if (count === 0) return 0;
  return ((current + delta) % count + count) % count;
}
