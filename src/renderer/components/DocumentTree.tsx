import { useState, useEffect } from 'react';

function ValueDisplay({ value }: { value: any }) {
  if (value === null) return <span className="tree-val-null">null</span>;
  if (typeof value === 'boolean') return <span className="tree-val-bool">{String(value)}</span>;
  if (typeof value === 'number') return <span className="tree-val-num">{value}</span>;
  if (typeof value === 'string') return <span className="tree-val-str">"{value}"</span>;
  return null;
}

function TreeNode({ name, value, depth, expandTick, expandTarget }:
  { name: string; value: any; depth: number; expandTick: number; expandTarget: boolean }) {
  const [open, setOpen] = useState(false);
  const isComplex = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);

  useEffect(() => { if (expandTick > 0) setOpen(expandTarget); }, [expandTick]);

  if (!isComplex) {
    return (
      <div className="tree-leaf" style={{ paddingLeft: depth * 14 + 20 }}>
        <span className="tree-key">{name}</span>
        <span className="tree-sep">: </span>
        <ValueDisplay value={value} />
      </div>
    );
  }

  const entries: [string, any][] = isArray
    ? value.map((v: any, i: number) => [String(i), v])
    : Object.entries(value);
  const summary = isArray ? `Array[${value.length}]` : `{${Object.keys(value).length}}`;

  return (
    <div>
      <div className="tree-branch" style={{ paddingLeft: depth * 14 }} onClick={() => setOpen(o => !o)}>
        <span className="tree-chevron">{open ? '▾' : '▸'}</span>
        <span className="tree-key">{name}</span>
        <span className="tree-sep">: </span>
        {!open && <span className="tree-summary">{summary}</span>}
      </div>
      {open && entries.map(([k, v]) => (
        <TreeNode key={k} name={k} value={v} depth={depth + 1} expandTick={expandTick} expandTarget={expandTarget} />
      ))}
    </div>
  );
}

interface DocTreeProps {
  doc: any;
  selected?: boolean;
  onSelect?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  expandTick: number;
  expandTarget: boolean;
  docExpTick?: number;
  docExpTarget?: boolean;
}

export default function DocumentTree({
  doc, selected, onSelect, onContextMenu,
  expandTick, expandTarget, docExpTick = 0, docExpTarget = true
}: DocTreeProps) {
  const [open, setOpen] = useState(false);
  const [internalTick, setInternalTick] = useState(0);
  const [internalTarget, setInternalTarget] = useState(false);

  useEffect(() => { if (expandTick > 0) setOpen(expandTarget); }, [expandTick]);

  useEffect(() => {
    if (docExpTick > 0) {
      setOpen(true);
      setInternalTarget(docExpTarget);
      setInternalTick(t => t + 1);
    }
  }, [docExpTick]);

  const id = doc._id ? String(doc._id) : 'Document';
  const preview = id.length > 32 ? id.slice(0, 32) + '…' : id;

  return (
    <div
      className={`doc-tree-item${selected ? ' doc-tree-selected' : ''}`}
      onContextMenu={onContextMenu}
    >
      <div
        className="doc-tree-header"
        onClick={e => onSelect?.(e)}
        onDoubleClick={() => setOpen(o => !o)}
        onMouseDown={e => { if (e.shiftKey) e.preventDefault(); }}
      >
        <span className="tree-chevron" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>{open ? '▾' : '▸'}</span>
        <span className="doc-tree-id">{preview}</span>
      </div>
      {open && (
        <div className="doc-tree-body">
          {Object.entries(doc).map(([k, v]) => (
            <TreeNode key={k} name={k} value={v} depth={0} expandTick={internalTick} expandTarget={internalTarget} />
          ))}
        </div>
      )}
    </div>
  );
}
