export interface ConfirmOpts {
  title?: string;
  message: string;
  danger?: boolean;
  confirmText?: string;
}

export interface InputOpts {
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
}

type ConfirmFn = (opts: ConfirmOpts) => Promise<boolean>;
type InputFn = (opts: InputOpts) => Promise<string | null>;

let _confirm: ConfirmFn | null = null;
let _input: InputFn | null = null;

export function registerDialogs(confirmFn: ConfirmFn, inputFn: InputFn) {
  _confirm = confirmFn;
  _input = inputFn;
}

export function showConfirm(opts: ConfirmOpts | string): Promise<boolean> {
  const o = typeof opts === 'string' ? { message: opts } : opts;
  return _confirm ? _confirm(o) : Promise.resolve(window.confirm(o.message));
}

export function showInput(opts: InputOpts | string, defaultValue?: string): Promise<string | null> {
  const o = typeof opts === 'string' ? { message: opts, defaultValue } : opts;
  return _input ? _input(o) : Promise.resolve(window.prompt(o.message, o.defaultValue) ?? null);
}
