/**
 * Windowing math for a long document list.
 *
 * Kept pure and DOM-free so the part that decides *which* rows exist can be
 * tested without a layout engine — the measuring and the scroll plumbing live
 * in `components/VirtualRows.tsx`.
 */

export interface VirtualRange {
  /** First rendered index, inclusive. */
  start: number;
  /** Last rendered index, exclusive. */
  end: number;
  /** Filler height standing in for the rows before `start`. */
  padTop: number;
  /** Filler height standing in for the rows from `end` on. */
  padBottom: number;
}

/**
 * Cumulative row tops: `offsets[i]` is where row `i` starts and `offsets[count]`
 * is the height of the whole list — one entry more than there are rows, so the
 * end of the last one is readable too.
 */
export function rowOffsets(count: number, heightAt: (index: number) => number): number[] {
  const offsets = new Array<number>(count + 1);
  offsets[0] = 0;
  for (let i = 0; i < count; i++) {
    const h = heightAt(i);
    offsets[i + 1] = offsets[i] + (h > 0 ? h : 0);
  }
  return offsets;
}

/** Index of the row containing `y`, by binary search over the offsets. */
function rowAt(offsets: number[], y: number): number {
  let lo = 0;
  let hi = offsets.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/**
 * The rows intersecting `[scrollTop, scrollTop + viewport)`, padded by
 * `overscan` rows on each side so a fast scroll does not show blank space.
 */
export function visibleRange(
  offsets: number[],
  scrollTop: number,
  viewport: number,
  overscan = 6,
): VirtualRange {
  const count = offsets.length - 1;
  if (count <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  // A viewport of zero means nothing could be measured: jsdom, a tab that is
  // mounted but `display: none`, the very first render. Render everything —
  // an empty window would leave the list blank with no scrollbar to fix it.
  if (viewport <= 0) return { start: 0, end: count, padTop: 0, padBottom: 0 };

  const top = Math.max(0, scrollTop);
  // The last visible row is the one under the final pixel, not under the edge:
  // a row starting exactly at `top + viewport` is the first one *below* the fold.
  const bottom = Math.max(top, top + viewport - 1);
  const start = Math.max(0, rowAt(offsets, top) - overscan);
  const end = Math.min(count, rowAt(offsets, bottom) + 1 + overscan);
  return { start, end, padTop: offsets[start], padBottom: offsets[count] - offsets[end] };
}
