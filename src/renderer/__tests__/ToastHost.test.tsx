import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ToastHost from '../components/ToastHost';
import { showToast, makeToast, pushToast, dismissToast, DEFAULT_TOAST_MS, type Toast } from '../toast';

describe('toast list', () => {
  const t = (id: number): Toast => ({ id, message: `m${id}`, kind: 'info', duration: 0 });

  it('puts the newest on top', () => {
    expect(pushToast([t(1)], t(2)).map(x => x.id)).toEqual([2, 1]);
  });

  it('keeps the screen from filling up', () => {
    const list = [t(4), t(3), t(2), t(1)];
    expect(pushToast(list, t(5), 4).map(x => x.id)).toEqual([5, 4, 3, 2]);
  });

  it('dismisses by id', () => {
    expect(dismissToast([t(1), t(2)], 1).map(x => x.id)).toEqual([2]);
  });

  it('defaults to info and to the standard duration', () => {
    const made = makeToast({ message: 'hi' });
    expect(made).toMatchObject({ message: 'hi', kind: 'info', duration: DEFAULT_TOAST_MS });
  });

  it('gives every toast its own id', () => {
    expect(makeToast({ message: 'a' }).id).not.toBe(makeToast({ message: 'a' }).id);
  });
});

describe('ToastHost', () => {
  beforeEach(() => { vi.useFakeTimers(); render(<ToastHost />); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders nothing until something is posted', () => {
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows what showToast posts, from anywhere', () => {
    act(() => showToast('Database "testdb" copied from "prod"'));
    expect(screen.getByText('Database "testdb" copied from "prod"')).toBeInTheDocument();
  });

  it('goes away on its own', () => {
    act(() => showToast('bye'));
    expect(screen.getByText('bye')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(DEFAULT_TOAST_MS); });
    expect(screen.queryByText('bye')).toBeNull();
  });

  it('goes away on click, before its time', () => {
    act(() => showToast('click me'));
    fireEvent.click(screen.getByText('click me'));
    expect(screen.queryByText('click me')).toBeNull();
  });

  it('stays put when the duration is 0', () => {
    act(() => showToast({ message: 'sticky', duration: 0 }));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByText('sticky')).toBeInTheDocument();
  });

  it('stacks several, newest first', () => {
    act(() => { showToast('first'); showToast('second'); });
    const messages = screen.getAllByRole('button').map(b => b.textContent);
    expect(messages[0]).toContain('second');
    expect(messages[1]).toContain('first');
  });

  it('carries the kind into the class, so errors read as errors', () => {
    act(() => showToast({ message: 'boom', kind: 'error' }));
    expect(screen.getByText('boom').closest('button')).toHaveClass('toast-error');
  });
});
