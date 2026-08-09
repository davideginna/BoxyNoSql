/**
 * Wording and matching for the typed confirmation on destructive actions.
 *
 * The point of typing the name is that muscle memory cannot get you through
 * it, so the match is deliberately exact apart from surrounding whitespace —
 * no case folding, no fuzzy matching.
 */

export interface DropImpact {
  /** Only set for a database — a collection is one by definition. */
  collections?: number;
  documents: number;
  /** Counts come from collection metadata, so they can lag slightly. */
  estimated?: boolean;
}

export function matchesTyped(typed: string, expected: string): boolean {
  return typed.trim() === expected;
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/**
 * "1,204 documents in 3 collections" — what is about to be destroyed, spelled
 * out before the user commits to it.
 */
export function impactLine(impact: DropImpact | null): string {
  if (!impact) return '';
  const approx = impact.estimated ? '≈' : '';
  const docs = `${approx}${plural(impact.documents, 'document')}`;
  return impact.collections === undefined
    ? docs
    : `${docs} in ${plural(impact.collections, 'collection')}`;
}
