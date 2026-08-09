import { describe, it, expect, vi, afterEach } from 'vitest';
import { isEscapeKey, isRunKey, onEscape, onRunKey, SWALLOW_ESCAPE } from '../utils/keys';

const press = (key: string, mods: Partial<KeyboardEventInit> = {}) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key, ...mods }));

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); });
const track = <T extends () => void>(c: T) => { cleanups.push(c); return c; };

describe('isEscapeKey', () => {
  it('is Escape and nothing else', () => {
    expect(isEscapeKey({ key: 'Escape' })).toBe(true);
    expect(isEscapeKey({ key: 'Esc' })).toBe(false);
    expect(isEscapeKey({ key: 'Enter' })).toBe(false);
  });
});

describe('isRunKey', () => {
  it('accepts Alt+Enter — the one that works everywhere', () => {
    expect(isRunKey({ key: 'Enter', altKey: true })).toBe(true);
  });

  it('still accepts Ctrl+Enter and Cmd+Enter', () => {
    expect(isRunKey({ key: 'Enter', ctrlKey: true })).toBe(true);
    expect(isRunKey({ key: 'Enter', metaKey: true })).toBe(true);
  });

  it('leaves a plain Enter alone — it types a newline', () => {
    expect(isRunKey({ key: 'Enter' })).toBe(false);
  });

  it('ignores the shifted variants, which mean something else in editors', () => {
    expect(isRunKey({ key: 'Enter', altKey: true, shiftKey: true })).toBe(false);
  });

  it('is not any other key with a modifier', () => {
    expect(isRunKey({ key: 'r', ctrlKey: true })).toBe(false);
  });
});

describe('onEscape', () => {
  it('fires on Escape, wherever the focus is', () => {
    const spy = vi.fn();
    track(onEscape(spy));
    press('Escape');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('ignores every other key', () => {
    const spy = vi.fn();
    track(onEscape(spy));
    press('Enter');
    press('a');
    expect(spy).not.toHaveBeenCalled();
  });

  it('stops listening once cleaned up', () => {
    const spy = vi.fn();
    onEscape(spy)();
    press('Escape');
    expect(spy).not.toHaveBeenCalled();
  });

  it('gives the key to the innermost handler only', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    track(onEscape(outer));
    const closeInner = onEscape(inner);
    press('Escape');
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();

    // Once the inner dialog is gone the one behind it gets Escape back.
    closeInner();
    press('Escape');
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('lets a modal swallow the key rather than pass it down the stack', () => {
    const outer = vi.fn();
    track(onEscape(outer));
    track(onEscape(SWALLOW_ESCAPE));
    press('Escape');
    expect(outer).not.toHaveBeenCalled();
  });
});

describe('onRunKey', () => {
  it('fires on Alt+Enter and on Ctrl+Enter', () => {
    const spy = vi.fn();
    track(onRunKey(spy));
    press('Enter', { altKey: true });
    press('Enter', { ctrlKey: true });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('leaves a bare Enter to the field that has focus', () => {
    const spy = vi.fn();
    track(onRunKey(spy));
    press('Enter');
    expect(spy).not.toHaveBeenCalled();
  });
});
