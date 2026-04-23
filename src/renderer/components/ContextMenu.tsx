import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  shortcut?: string;
  onClick: () => void;
  separator?: false;
  disabled?: boolean;
}
export interface ContextMenuSep { separator: true; }
export type ContextMenuEntry = ContextMenuItem | ContextMenuSep;

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = el.getBoundingClientRect();
    if (rect.right > vw) el.style.left = `${vw - rect.width - 4}px`;
    if (rect.bottom > vh) el.style.top = `${vh - rect.height - 4}px`;
  });

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ position: 'fixed', top: y, left: x, zIndex: 9999 }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="ctx-sep" />
        ) : (
          <button
            key={i}
            className="ctx-item"
            disabled={(item as ContextMenuItem).disabled}
            onClick={() => { (item as ContextMenuItem).onClick(); onClose(); }}
          >
            <span>{(item as ContextMenuItem).label}</span>
            {(item as ContextMenuItem).shortcut && (
              <span className="ctx-shortcut">{(item as ContextMenuItem).shortcut}</span>
            )}
          </button>
        )
      )}
    </div>
  );
}
