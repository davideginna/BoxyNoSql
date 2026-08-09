/**
 * The two shortcuts that have to behave the same everywhere: Escape cancels,
 * Alt+Enter (or Ctrl/Cmd+Enter) runs.
 *
 * Both are deliberately *not* guarded by `isTypingTarget()`: cancelling out of
 * a dialog and running the thing you are typing are exactly the cases where
 * the focus is inside a field.
 */

interface KeyLike {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export function isEscapeKey(e: KeyLike): boolean {
  return e.key === 'Escape';
}

/**
 * Run. `Alt+Enter` is the one that works in every view, including inside a
 * Monaco editor where the browser would otherwise swallow a plain Enter;
 * `Ctrl/Cmd+Enter` is kept because the query terminal shipped with it.
 */
export function isRunKey(e: KeyLike): boolean {
  return e.key === 'Enter' && (!!e.altKey || !!e.ctrlKey || !!e.metaKey) && !e.shiftKey;
}

type Cleanup = () => void;

/**
 * Escape handlers form a stack: only the innermost one runs. Without that, a
 * confirmation opened on top of a modal would take one Escape and close both,
 * since every dialog listens on `document`.
 *
 * To swallow the key instead of acting on it — a modal that is busy writing
 * must not let Escape fall through to whatever is behind it — register a
 * no-op: it still takes its place on the stack.
 */
const escapeStack: ((e: KeyboardEvent) => void)[] = [];
let escapeBound = false;

function dispatchEscape(e: KeyboardEvent) {
  if (!isEscapeKey(e)) return;
  escapeStack[escapeStack.length - 1]?.(e);
}

export const SWALLOW_ESCAPE = () => {};

export function onEscape(handler: (e: KeyboardEvent) => void): Cleanup {
  const entry = handler;
  escapeStack.push(entry);
  if (!escapeBound) {
    document.addEventListener('keydown', dispatchEscape);
    escapeBound = true;
  }
  return () => {
    const i = escapeStack.lastIndexOf(entry);
    if (i !== -1) escapeStack.splice(i, 1);
  };
}

/**
 * Document-level Alt+Enter / Ctrl+Enter. Not stacked: a view registers it only
 * while it owns the screen, and running is not a "close the top thing" action.
 */
export function onRunKey(handler: (e: KeyboardEvent) => void): Cleanup {
  const listener = (e: KeyboardEvent) => { if (isRunKey(e)) handler(e); };
  document.addEventListener('keydown', listener);
  return () => document.removeEventListener('keydown', listener);
}
