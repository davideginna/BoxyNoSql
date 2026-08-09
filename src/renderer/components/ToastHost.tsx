import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import {
  registerToasts, makeToast, pushToast, dismissToast, type Toast, type ToastOpts,
} from '../toast';

const ICON = { info: 'info', success: 'check', error: 'warn' } as const;

/** Renders whatever `showToast` posts. Mounted once, next to `DialogModal`. */
export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const drop = (id: number) => {
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
    setToasts(list => dismissToast(list, id));
  };

  useEffect(() => {
    registerToasts((opts: ToastOpts) => {
      const toast = makeToast(opts);
      setToasts(list => pushToast(list, toast));
      // 0 means "until clicked" — a message worth keeping on screen.
      if (toast.duration > 0) {
        timers.current.set(toast.id, setTimeout(() => drop(toast.id), toast.duration));
      }
    });
    const pending = timers.current;
    return () => { pending.forEach(clearTimeout); pending.clear(); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-host">
      {toasts.map(t => (
        <button key={t.id} className={`toast toast-${t.kind}`} onClick={() => drop(t.id)} title="Dismiss">
          <Icon name={ICON[t.kind]} size={14} />
          <span className="toast-message">{t.message}</span>
          <Icon name="close" size={11} />
        </button>
      ))}
    </div>
  );
}
