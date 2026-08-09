import { useEffect } from 'react';
import Icon from './Icon';
import { isEscapeKey } from '../utils/keys';

interface ShortcutGroup {
  title: string;
  items: { keys: string[]; label: string }[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Global',
    items: [
      { keys: ['F1'], label: 'Show this cheat sheet' },
      { keys: ['F5'], label: 'Refresh the database/collection tree' },
      { keys: ['Ctrl', 'R'], label: 'Refresh the database/collection tree' },
      { keys: ['Ctrl', 'M'], label: 'Open the connection manager' },
      { keys: ['Ctrl', ','], label: 'Open settings' },
      { keys: ['Ctrl', 'W'], label: 'Close the active tab' },
      { keys: ['Ctrl', '1-9'], label: 'Switch to tab 1-9' },
    ],
  },
  {
    title: 'Documents view',
    items: [
      { keys: ['Ctrl', 'D'], label: 'Add a new document' },
      { keys: ['Ctrl', 'A'], label: 'Select all loaded documents' },
      { keys: ['Ctrl', 'C'], label: 'Copy selected documents as JSON' },
      { keys: ['Ctrl', 'V'], label: 'Paste documents from the clipboard' },
      { keys: ['Delete'], label: 'Delete the selected documents' },
      { keys: ['Ctrl', 'J'], label: 'Edit the selected document' },
      { keys: ['F3'], label: 'View the selected document (read-only)' },
      { keys: ['Ctrl', 'F'], label: 'Find within the open document editor/viewer' },
      { keys: ['Ctrl', 'Enter'], label: 'Save (inside the add/edit document editor)' },
      { keys: ['Esc'], label: 'Close the open document editor/viewer' },
    ],
  },
  {
    title: 'Query editor',
    items: [
      { keys: ['Ctrl', 'Enter'], label: 'Run the query' },
      { keys: ['Ctrl', 'Space'], label: 'Show completions' },
    ],
  },
  {
    title: 'Sidebar (collection focused)',
    items: [
      { keys: ['Enter'], label: 'Open the collection' },
      { keys: ['F2'], label: 'Rename the collection' },
      { keys: ['Delete'], label: 'Drop the collection' },
      { keys: ['Ctrl', 'D'], label: 'Duplicate the collection' },
      { keys: ['Ctrl', 'C'], label: 'Copy the collection name' },
    ],
  },
  {
    title: 'Connection manager',
    items: [
      { keys: ['Enter'], label: 'Connect/disconnect the focused connection' },
      { keys: ['Alt', 'E'], label: 'Edit the focused connection' },
      { keys: ['Esc'], label: 'Close the connection manager' },
    ],
  },
];

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (isEscapeKey(e) || e.key === 'F1') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="modal-overlay" style={{ zIndex: 1900 }} onClick={e => { e.stopPropagation(); onClose(); }}>
      <div className="modal modal-wide shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Keyboard shortcuts</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={15} /></button>
        </div>
        <div className="modal-body shortcuts-body">
          {GROUPS.map(group => (
            <div className="shortcuts-group" key={group.title}>
              <div className="shortcuts-group-title">{group.title}</div>
              {group.items.map((item, i) => (
                <div className="shortcuts-row" key={i}>
                  <span className="shortcuts-keys">
                    {item.keys.map((k, j) => <span className="kbd" key={j}>{k}</span>)}
                  </span>
                  <span className="shortcuts-label">{item.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
