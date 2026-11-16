import { useState, useEffect, useRef } from 'react';
import { filterSuggestions, moveHighlight } from '../utils/suggest';

interface Props {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

/**
 * Text input with a filtered drop-down of suggestions. Free text is always
 * allowed — the list only helps.
 *
 * Focus or click opens the whole list; typing filters it (`filterSuggestions`).
 * ArrowUp/ArrowDown move the highlight, Enter picks it, Escape closes the menu,
 * Tab and a click outside close it too.
 *
 * Escape is stopped on the input rather than pushed on the `onEscape` stack:
 * a modal that re-registers its handler on every render (UsersRolesModal does)
 * would land above ours after the first keystroke and close the whole dialog.
 * React handles keydown at the root, below `document` where the stack listens,
 * so stopPropagation keeps the key from reaching it.
 */
export default function SuggestInput({ value, onChange, suggestions, placeholder, className, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  // What the list is filtered by: null right after opening (show everything,
  // even when the field already holds a value), the typed text afterwards.
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = filterSuggestions(suggestions, query ?? '');

  const openMenu = () => {
    if (open) return;
    setOpen(true);
    setQuery(null);
    setHighlight(-1);
  };
  const close = () => { setOpen(false); setHighlight(-1); };
  const pick = (s: string) => { onChange(s); close(); };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (highlight < 0 || !menuRef.current) return;
    const item = menuRef.current.children[highlight] as HTMLElement | undefined;
    item?.scrollIntoView?.({ block: 'nearest' });
  }, [highlight]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { openMenu(); return; }
      setHighlight(h => moveHighlight(h, e.key === 'ArrowDown' ? 1 : -1, filtered.length));
    } else if (e.key === 'Enter' && open && highlight >= 0 && highlight < filtered.length) {
      e.preventDefault();
      pick(filtered[highlight]);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close();
    }
  };

  return (
    <div ref={rootRef} className="field-suggest">
      <input
        value={value}
        placeholder={placeholder}
        className={className}
        aria-label={rest['aria-label']}
        autoComplete="off"
        spellCheck={false}
        onChange={e => {
          onChange(e.target.value);
          setQuery(e.target.value);
          setHighlight(-1);
          setOpen(true);
        }}
        onFocus={openMenu}
        onClick={openMenu}
        onKeyDown={onKeyDown}
      />
      {open && filtered.length > 0 && (
        <div ref={menuRef} className="field-suggest-menu" role="listbox">
          {filtered.map((s, i) => (
            <div key={s}
              role="option"
              aria-selected={i === highlight}
              className={`field-suggest-item${i === highlight ? ' active' : ''}`}
              // mousedown, not click: keeps the focus in the input and beats the outside-click close.
              onMouseDown={e => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setHighlight(i)}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}
