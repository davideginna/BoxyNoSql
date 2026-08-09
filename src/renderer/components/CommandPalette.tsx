import { useState, useEffect, useRef, useMemo } from 'react';
import Icon, { IconName } from './Icon';
import { onEscape } from '../utils/keys';
import { filterItems, moveSelection, type PaletteItem, type PaletteKind } from '../utils/palette';

const KIND_ICON: Record<PaletteKind, IconName> = {
  connection: 'plug',
  database: 'database',
  collection: 'collection',
  action: 'bolt',
};

const KIND_LABEL: Record<PaletteKind, string> = {
  connection: 'Connection',
  database: 'Database',
  collection: 'Collection',
  action: 'Action',
};

interface Props {
  items: PaletteItem[];
  onClose: () => void;
}

/**
 * Ctrl+P. One list over everything reachable — connections, the databases and
 * collections of whatever is connected, and the actions that otherwise need a
 * menu — so nothing has to be found by walking the tree.
 *
 * Collections only appear for databases that have been expanded at least once:
 * the renderer knows the names it has listed, and listing every database of
 * every connection to fill a palette would hit the servers on every keystroke.
 */
export default function CommandPalette({ items, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => filterItems(items, query), [items, query]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => onEscape(onClose), [onClose]);
  // A new query means a new list; keeping the old index would leave the
  // highlight on whatever happens to be in that row now.
  useEffect(() => { setSelected(0); }, [query]);

  // Follow the highlight when it moves off screen (or wraps to the other end).
  useEffect(() => {
    const row = listRef.current?.querySelector('.cp-item.selected');
    // Optional call: jsdom has no scrollIntoView, and neither does an element
    // that was removed between the render and this effect.
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [selected, matches]);

  const runSelected = () => {
    const item = matches[selected];
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => moveSelection(s, 1, matches.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => moveSelection(s, -1, matches.length)); }
    else if (e.key === 'Enter') { e.preventDefault(); runSelected(); }
  };

  return (
    <div className="modal-overlay cp-overlay" style={{ zIndex: 2500 }} onClick={onClose}>
      <div className="cp-panel" onClick={e => e.stopPropagation()}>
        <div className="cp-input-row">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            className="cp-input"
            value={query}
            placeholder="Go to a connection, database, collection or action…"
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="cp-count">{matches.length}</span>
        </div>
        <div className="cp-list" ref={listRef}>
          {matches.length === 0 && <div className="cp-empty">Nothing matches “{query}”</div>}
          {matches.map((item, i) => (
            <button
              key={item.id}
              className={`cp-item${i === selected ? ' selected' : ''}`}
              // Mouse selection follows the pointer, so clicking always runs
              // the row under the cursor and not the one the keyboard left.
              onMouseMove={() => setSelected(i)}
              onClick={() => { onClose(); item.run(); }}
            >
              <Icon name={KIND_ICON[item.kind]} size={14} />
              <span className="cp-label">{item.label}</span>
              {item.sublabel && <span className="cp-sub">{item.sublabel}</span>}
              <span className="cp-kind">{KIND_LABEL[item.kind]}</span>
            </button>
          ))}
        </div>
        <div className="cp-foot">
          <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> move</span>
          <span><kbd className="kbd">Enter</kbd> open</span>
          <span><kbd className="kbd">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
