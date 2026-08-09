import { describe, it, expect } from 'vitest';
import { rowOffsets, visibleRange } from '../utils/virtualList';

// 1000 rows of 20px: row i spans [20i, 20i+20).
const uniform = (count = 1000, h = 20) => rowOffsets(count, () => h);

describe('rowOffsets', () => {
  it('starts at zero and ends at the total height', () => {
    const offsets = uniform(5);
    expect(offsets).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('accumulates uneven heights', () => {
    expect(rowOffsets(3, i => [10, 50, 5][i])).toEqual([0, 10, 60, 65]);
  });

  it('treats a missing or negative height as zero rather than moving rows up', () => {
    expect(rowOffsets(3, i => [10, -8, NaN][i])).toEqual([0, 10, 10, 10]);
  });

  it('has one entry for an empty list', () => {
    expect(rowOffsets(0, () => 20)).toEqual([0]);
  });
});

describe('visibleRange — which rows are mounted', () => {
  it('renders the rows under the viewport plus the overscan', () => {
    // Viewport [400, 700) covers rows 20..34, ±2 rows of overscan.
    expect(visibleRange(uniform(), 400, 300, 2)).toMatchObject({ start: 18, end: 37 });
  });

  it('pads with the exact height of the rows it skipped', () => {
    const r = visibleRange(uniform(), 400, 300, 2);
    expect(r.padTop).toBe(18 * 20);
    expect(r.padBottom).toBe((1000 - 37) * 20);
    // Filler + rendered rows always add up to the full list height.
    expect(r.padTop + (r.end - r.start) * 20 + r.padBottom).toBe(1000 * 20);
  });

  it('honours a larger overscan', () => {
    expect(visibleRange(uniform(), 400, 300, 10)).toMatchObject({ start: 10, end: 45 });
  });

  it('follows uneven row heights', () => {
    // A tall expanded row in the middle: rows 0..3 are 10px, row 4 is 200px.
    const offsets = rowOffsets(10, i => (i === 4 ? 200 : 10));
    expect(visibleRange(offsets, 40, 50, 0)).toMatchObject({ start: 4, end: 5, padTop: 40 });
    expect(visibleRange(offsets, 240, 20, 0)).toMatchObject({ start: 5, end: 7, padTop: 240 });
  });
});

describe('visibleRange — clamping', () => {
  it('does not start before the first row', () => {
    expect(visibleRange(uniform(), 0, 300, 6)).toMatchObject({ start: 0, padTop: 0 });
  });

  it('treats a negative scroll offset (rubber-band) as the top', () => {
    expect(visibleRange(uniform(), -120, 300, 6)).toEqual(visibleRange(uniform(), 0, 300, 6));
  });

  it('does not end past the last row', () => {
    const r = visibleRange(uniform(), 19_700, 300, 6);
    expect(r.end).toBe(1000);
    expect(r.padBottom).toBe(0);
  });

  it('stays inside the list when the viewport is taller than the content', () => {
    expect(visibleRange(uniform(10), 0, 5000, 6)).toMatchObject({ start: 0, end: 10, padTop: 0, padBottom: 0 });
  });

  it('clamps a scroll offset past the end to the last row', () => {
    expect(visibleRange(uniform(10), 99_999, 100, 0)).toMatchObject({ start: 9, end: 10, padBottom: 0 });
  });
});

describe('visibleRange — degenerate input', () => {
  it('renders nothing for an empty list', () => {
    expect(visibleRange(rowOffsets(0, () => 20), 0, 500)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 });
  });

  it('renders everything when the viewport cannot be measured', () => {
    // jsdom and `display: none` tabs both report a height of zero. Windowing
    // against that would mount no rows at all and leave no scrollbar to fix it.
    expect(visibleRange(uniform(), 0, 0)).toEqual({ start: 0, end: 1000, padTop: 0, padBottom: 0 });
    expect(visibleRange(uniform(), 900, -1)).toEqual({ start: 0, end: 1000, padTop: 0, padBottom: 0 });
  });

  it('handles a single row', () => {
    expect(visibleRange(uniform(1), 0, 500, 6)).toMatchObject({ start: 0, end: 1, padTop: 0, padBottom: 0 });
  });
});
