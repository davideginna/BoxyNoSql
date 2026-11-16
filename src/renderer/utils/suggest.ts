/**
 * Filtering for `SuggestInput`'s drop-down: case-insensitive, entries that
 * start with the typed text first, then the ones that merely contain it, each
 * group in its original order (so built-in roles stay ahead of custom ones).
 * Empty text keeps the whole list — that is what opening the menu shows.
 */
export function filterSuggestions(items: string[], text: string): string[] {
  const q = text.trim().toLowerCase();
  if (!q) return items;
  const starts: string[] = [];
  const contains: string[] = [];
  for (const item of items) {
    const lower = item.toLowerCase();
    if (lower.startsWith(q)) starts.push(item);
    else if (lower.includes(q)) contains.push(item);
  }
  return [...starts, ...contains];
}

/** Next highlighted index for ArrowUp/ArrowDown, wrapping; -1 means nothing highlighted. */
export function moveHighlight(current: number, delta: 1 | -1, count: number): number {
  if (count === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}
