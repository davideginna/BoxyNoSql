import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { rowOffsets, visibleRange, type VirtualRange } from '../utils/virtualList';

/**
 * Below this many rows the list is rendered whole. Windowing costs a measure
 * pass and two filler rows, and a page this small never blocked anything;
 * leaving it alone also keeps table columns auto-sizing the way they always
 * did, which is what people see on a default limit of 20.
 */
export const VIRTUAL_MIN = 200;

interface VirtualOptions {
  /** The element that scrolls — `.document-table` or `.tree-view-container`. */
  scrollerRef: RefObject<HTMLElement>;
  /** The element the rows are children of; its top is where row 0 starts. */
  listRef: RefObject<HTMLElement>;
  count: number;
  /** Height assumed for rows that have never been on screen. */
  estimate: number;
  /** Changing this drops the measured heights: a new page of documents puts
   *  different rows behind the same indices. */
  resetKey: unknown;
  overscan?: number;
}

export interface VirtualWindow extends VirtualRange {
  /** Ref for row `index` — the hook measures whatever it is handed. */
  rowRef: (index: number) => (el: HTMLElement | null) => void;
  /** True while this list is being windowed at all. */
  windowed: boolean;
}

const whole = (count: number): VirtualRange => ({ start: 0, end: count, padTop: 0, padBottom: 0 });

const same = (a: VirtualRange, b: VirtualRange) =>
  a.start === b.start && a.end === b.end && a.padTop === b.padTop && a.padBottom === b.padBottom;

/**
 * Keeps only the rows near the viewport in the DOM.
 *
 * Heights are **measured**, not assumed: table rows are uniform but tree rows
 * are not — a document that gets expanded is suddenly twenty lines tall — and a
 * fixed-height virtualizer would put every row below it in the wrong place.
 * Rows that have never been rendered use `estimate`, which is only ever wrong
 * about rows nobody has looked at yet; the moment one scrolls into view it is
 * measured and the offsets below it settle.
 *
 * The trade-off of unmounting is that a tree row loses the expansion state it
 * held internally when it scrolls out. "Expand all" / "Collapse all" survive —
 * both are driven from here by a tick that re-applies on mount — but a chevron
 * clicked by hand does not.
 */
export function useVirtualRows(opts: VirtualOptions): VirtualWindow {
  const { scrollerRef, listRef, count, estimate, resetKey, overscan = 6 } = opts;
  const heights = useRef(new Map<number, number>());
  const elements = useRef(new Map<number, HTMLElement>());
  const offsets = useRef<number[]>([]);
  const [range, setRange] = useState<VirtualRange>(() => whole(count));

  const windowed = count > VIRTUAL_MIN;

  const rebuild = useCallback(() => {
    const known = heights.current;
    offsets.current = rowOffsets(count, i => known.get(i) ?? estimate);
  }, [count, estimate]);

  const apply = useCallback(() => {
    const scroller = scrollerRef.current;
    const list = listRef.current;
    const viewport = windowed && scroller && list ? scroller.clientHeight : 0;
    if (viewport <= 0) {
      setRange(prev => (same(prev, whole(count)) ? prev : whole(count)));
      return;
    }
    if (offsets.current.length !== count + 1) rebuild();
    // Rows do not start at the top of the scroller: the table's sit under a
    // sticky header, the tree's under the container padding. Reading both rects
    // gives that offset without either component having to declare it.
    const listTop = list!.getBoundingClientRect().top
      - scroller!.getBoundingClientRect().top + scroller!.scrollTop;
    const next = visibleRange(offsets.current, scroller!.scrollTop - listTop, viewport, overscan);
    setRange(prev => (same(prev, next) ? prev : next));
  }, [windowed, count, overscan, rebuild, scrollerRef, listRef]);

  const measure = useCallback(() => {
    let changed = false;
    elements.current.forEach((el, i) => {
      const h = el.offsetHeight;
      if (h > 0 && heights.current.get(i) !== h) { heights.current.set(i, h); changed = true; }
    });
    if (changed) rebuild();
  }, [rebuild]);

  useLayoutEffect(() => { heights.current.clear(); }, [resetKey]);

  // Every render: what is on screen now is what can be measured now, and the
  // first pass has nothing but `estimate` to go on. Measuring is skipped for a
  // list that is not windowed — reading `offsetHeight` off every row of a short
  // list on every keystroke in the query builder is a reflow for nothing, and
  // `apply` short-circuits without touching the DOM in that case.
  useLayoutEffect(() => {
    if (windowed) measure();
    apply();
  });

  useEffect(() => {
    const scroller = scrollerRef.current;
    const list = listRef.current;
    if (!windowed || !scroller) return;
    const onScroll = () => apply();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    // Size changes that are not scrolls: the window, the query builder opening,
    // the tab coming back on screen, and — via the list — a tree row expanding.
    // jsdom has no ResizeObserver, which is fine: it has no viewport either.
    const ro = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => { measure(); apply(); });
    ro?.observe(scroller);
    if (list) ro?.observe(list);
    return () => { scroller.removeEventListener('scroll', onScroll); ro?.disconnect(); };
  }, [windowed, apply, measure, scrollerRef, listRef]);

  // A fresh callback per render so React detaches the rows that just left the
  // window; the map is what `measure` walks, so it has to stay honest.
  const rowRef = useCallback((index: number) => (el: HTMLElement | null) => {
    if (el) elements.current.set(index, el);
    else elements.current.delete(index);
  }, []);

  return { ...range, rowRef, windowed };
}

/**
 * Stands in for the rows that are not rendered, so the scrollbar reflects the
 * whole list. Inside a `<tbody>` it has to be a row, hence `colSpan`.
 */
export function VirtualSpacer({ height, colSpan }: { height: number; colSpan?: number }) {
  if (height <= 0) return null;
  return colSpan === undefined
    ? <div className="doc-spacer" style={{ height }} aria-hidden="true" />
    : <tr className="doc-spacer-row" aria-hidden="true"><td colSpan={colSpan} style={{ height }} /></tr>;
}
