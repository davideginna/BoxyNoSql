/**
 * Transient status messages. Same shape as `dialog.ts`: module-level functions
 * that `ToastHost` registers itself into on mount, so any component can post
 * one without threading a prop through the tree.
 *
 * Nothing blocks — a toast that is never seen is fine. Anything the user must
 * acknowledge belongs in `showAlert`, not here.
 */

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastOpts {
  message: string;
  kind?: ToastKind;
  /** Milliseconds on screen. 0 keeps it until it is clicked. */
  duration?: number;
}

export interface Toast extends ToastOpts {
  id: number;
  kind: ToastKind;
  duration: number;
}

export const DEFAULT_TOAST_MS = 4000;

let _show: ((opts: ToastOpts) => void) | null = null;

export function registerToasts(show: (opts: ToastOpts) => void) {
  _show = show;
}

export function showToast(opts: ToastOpts | string) {
  const o = typeof opts === 'string' ? { message: opts } : opts;
  _show?.(o);
}

let seq = 0;

export function makeToast(opts: ToastOpts): Toast {
  return {
    kind: 'info',
    duration: DEFAULT_TOAST_MS,
    ...opts,
    id: ++seq,
  };
}

/** Newest first, and never more than `max` on screen at once. */
export function pushToast(list: Toast[], toast: Toast, max = 4): Toast[] {
  return [toast, ...list].slice(0, max);
}

export function dismissToast(list: Toast[], id: number): Toast[] {
  return list.filter(t => t.id !== id);
}
