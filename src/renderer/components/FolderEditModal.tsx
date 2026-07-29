import { useState, useEffect } from 'react';
import ColorEditor from './ColorEditor';
import Icon from './Icon';

interface Folder { id: string; name: string; color?: string; order?: number; parentId?: string; }

interface Props {
  folder: Folder;
  connectionCount: number;
  onSave: (folder: Folder, applyToConnections: boolean) => void;
  onClose: () => void;
}

export default function FolderEditModal({ folder, connectionCount, onSave, onClose }: Props) {
  const [name, setName] = useState(folder.name);
  const [color, setColor] = useState<string | undefined>(folder.color);
  const [applyToConns, setApplyToConns] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const save = () => {
    onSave({ ...folder, name: name.trim() || folder.name, color }, applyToConns);
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1700 }}>
      <div className="modal" style={{ width: 440 }}>
        <div className="modal-header">
          <h3>Edit Folder</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={15} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Name</label>
            <input type="text" value={name} autoFocus onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); }} />
          </div>
          <div className="form-group">
            <label>Folder color</label>
            <ColorEditor value={color} allowClear clearLabel="Default" onChange={setColor} />
          </div>
          {connectionCount > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={applyToConns} onChange={e => setApplyToConns(e.target.checked)} />
              Apply this color to all {connectionCount} connection{connectionCount === 1 ? '' : 's'} in this folder
            </label>
          )}
        </div>
        <div className="modal-footer">
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
