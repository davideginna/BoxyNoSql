import { useState, useEffect, useMemo } from 'react';
import { detectType, type FieldType } from '../utils/buildFilter';
import Icon from './Icon';
import { oidTitle } from '../utils/objectId';
import { valueKind, KIND_LABEL, containerSummary, type Path } from '../utils/fieldEdit';
import { InlineValueEditor } from './ValueEditor';

const PREVIEW_FIELDS = 4;
const PREVIEW_STR_MAX = 28;

// One-line rendition of a value for the collapsed document header. Returns the
// same colour classes the expanded tree uses, so the preview reads as a
// condensed version of what you get when you open the row.
function previewValue(v: any): { text: string; cls: string; title?: string } {
  if (v === null || v === undefined) return { text: 'null', cls: 'tree-val-null' };
  if (typeof v === 'boolean') return { text: String(v), cls: 'tree-val-bool' };
  if (typeof v === 'number') return { text: String(v), cls: 'tree-val-num' };
  if (typeof v === 'string') {
    const t = v.length > PREVIEW_STR_MAX ? v.slice(0, PREVIEW_STR_MAX) + '…' : v;
    return { text: `"${t}"`, cls: 'tree-val-str' };
  }
  if (typeof v === 'object' && '$oid' in v) return { text: `ObjectId(…${String(v.$oid).slice(-6)})`, cls: 'tree-val-oid', title: oidTitle(v) };
  if (typeof v === 'object' && '$date' in v) return { text: `ISODate(${v.$date})`, cls: 'tree-val-date' };
  if (Array.isArray(v)) return { text: `Array[${v.length}]`, cls: 'tree-summary' };
  return { text: `{${Object.keys(v).length}}`, cls: 'tree-summary' };
}

function ValueDisplay({ value }: { value: any }) {
  if (value === null) return <span className="tree-val-null">null</span>;
  if (typeof value === 'boolean') return <span className="tree-val-bool">{String(value)}</span>;
  if (typeof value === 'number') return <span className="tree-val-num">{value}</span>;
  if (typeof value === 'string') return <span className="tree-val-str">"{value}"</span>;
  if (value && typeof value === 'object' && '$oid' in value)
    return <span className="tree-val-oid" title={oidTitle(value)}>ObjectId("{value.$oid}")</span>;
  if (value && typeof value === 'object' && '$date' in value)
    return <span className="tree-val-date">ISODate("{value.$date}")</span>;
  return null;
}

/** A leaf as a filter condition: its type and the value as the filter box would hold it. */
function leafFilter(value: any): { type: FieldType; value: string } {
  const type = detectType(value);
  const str = value === null ? ''
    : (typeof value === 'object' && '$oid' in value) ? value.$oid
    : (typeof value === 'object' && '$date' in value) ? String(value.$date)
    : String(value);
  return { type, value: str };
}

/**
 * Hooks into the filter panel. Dragging is how a field reaches the filter, but
 * nothing on a plain tree row says so and the drop target only exists while
 * the panel is open — so a drag reports itself (the panel opens and lights up
 * its drop zone) and each leaf also gets a one-click "filter on this value".
 */
export interface FilterHooks {
  onAddFilter?: (field: string, type: FieldType, value: string) => void;
  onFieldDrag?: (dragging: boolean) => void;
}

/**
 * In-place editing, owned by `DocumentsView` (one editor open at a time across
 * the whole list). Without `onStartEdit` the tree is read-only and a
 * double-click on a leaf filters on it instead.
 */
export interface EditHooks {
  editingPath?: Path | null;
  onStartEdit?: (path: Path) => void;
  onCommitEdit?: (path: Path, value: any) => Promise<void>;
  onCancelEdit?: () => void;
  onFieldContextMenu?: (e: React.MouseEvent, path: Path, value: any) => void;
}

type Hooks = FilterHooks & EditHooks;

const samePath = (a: Path | null | undefined, b: Path) =>
  !!a && a.length === b.length && a.every((s, i) => String(s) === String(b[i]));

/** Key | Value | Type — the three cells every row of the tree has. */
function TypeCell({ value }: { value: any }) {
  return <span className="tg-type">{KIND_LABEL[valueKind(value)]}</span>;
}

/**
 * `filterPath` is `path` without array indices: `tags.0` filters on `tags`,
 * `items.2.name` on `items.name` — Mongo matches either against every element,
 * which is what "find documents with this value" means. `inArray` marks a
 * direct array element, filtered with the array operators.
 */
function TreeNode({ name, path, segs, filterPath, inArray, value, depth, expandTick, expandTarget, hooks }:
  { name: string; path: string; segs: Path; filterPath: string; inArray: boolean; value: any; depth: number; expandTick: number; expandTarget: boolean; hooks: Hooks }) {
  const [open, setOpen] = useState(false);
  const isOid = value !== null && typeof value === 'object' && '$oid' in value;
  const isDate = value !== null && typeof value === 'object' && '$date' in value;
  const isComplex = !isOid && !isDate && value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);

  useEffect(() => { if (expandTick > 0) setOpen(expandTarget); }, [expandTick]);

  if (!isComplex) {
    const filterOn = () => {
      const f = leafFilter(value);
      return inArray ? { field: filterPath, type: 'array' as FieldType, value: f.value } : { field: filterPath, ...f };
    };
    const editing = samePath(hooks.editingPath, segs);
    const canEdit = !!hooks.onStartEdit && segs[0] !== '_id';
    return (
      <div
        className={`tree-leaf tree-grid-row${editing ? ' editing' : ''}`}
        draggable={!editing}
        title={canEdit
          ? `Double-click to edit · drag ${filterPath} into the filter to search on it`
          : hooks.onAddFilter
            ? `Drag ${filterPath} into the filter, or double-click it, to search on it`
            : `Drag ${filterPath} into the filter to search on it`}
        onDragStart={e => {
          e.stopPropagation();
          e.dataTransfer.setData('qb-field', JSON.stringify(filterOn()));
          e.dataTransfer.effectAllowed = 'copy';
          hooks.onFieldDrag?.(true);
        }}
        onDragEnd={() => hooks.onFieldDrag?.(false)}
        onContextMenu={hooks.onFieldContextMenu && (e => hooks.onFieldContextMenu!(e, segs, value))}
        onDoubleClick={(canEdit || hooks.onAddFilter) ? (e => {
          e.stopPropagation();
          window.getSelection()?.removeAllRanges();
          if (canEdit) { hooks.onStartEdit!(segs); return; }
          const f = filterOn(); hooks.onAddFilter!(f.field, f.type, f.value);
        }) : undefined}
      >
        <span className="tg-key" style={{ paddingLeft: depth * 14 + 20 }}>
          <span className="tree-key">{name}</span>
        </span>
        <span className="tg-val">
          {editing
            ? <InlineValueEditor value={value} onCommit={v => hooks.onCommitEdit!(segs, v)} onCancel={() => hooks.onCancelEdit?.()} />
            : <>
              <ValueDisplay value={value} />
              {hooks.onAddFilter && (
                <button
                  className="tree-filter-btn"
                  title={inArray ? `Filter: ${filterPath} contains this value` : `Filter: ${filterPath} = this value`}
                  aria-label={`Filter on ${filterPath}`}
                  onClick={e => { e.stopPropagation(); const f = filterOn(); hooks.onAddFilter!(f.field, f.type, f.value); }}
                ><Icon name="filter" size={11} /></button>
              )}
            </>}
        </span>
        <TypeCell value={value} />
      </div>
    );
  }

  const entries: [string, any][] = isArray
    ? value.map((v: any, i: number) => [String(i), v])
    : Object.entries(value);
  return (
    <div>
      <div
        className="tree-branch tree-grid-row"
        onClick={() => setOpen(o => !o)}
        onContextMenu={hooks.onFieldContextMenu && (e => hooks.onFieldContextMenu!(e, segs, value))}
      >
        <span className="tg-key" style={{ paddingLeft: depth * 14 }}>
          <span className="tree-chevron">{open ? '▾' : '▸'}</span>
          <span className="tree-key">{name}</span>
        </span>
        <span className="tg-val"><span className="tree-summary">{containerSummary(value)}</span></span>
        <TypeCell value={value} />
      </div>
      {open && entries.map(([k, v]) => (
        <TreeNode
          key={k} name={k}
          path={path ? `${path}.${k}` : k}
          segs={[...segs, isArray ? Number(k) : k]}
          filterPath={isArray ? filterPath : (filterPath ? `${filterPath}.${k}` : k)}
          inArray={isArray}
          value={v} depth={depth + 1}
          expandTick={expandTick} expandTarget={expandTarget} hooks={hooks}
        />
      ))}
    </div>
  );
}

interface DocTreeProps extends FilterHooks, EditHooks {
  doc: any;
  /** 1-based position in the whole result, shown before the id. */
  index?: number;
  selected?: boolean;
  onSelect?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  expandTick: number;
  expandTarget: boolean;
  docExpTick?: number;
  docExpTarget?: boolean;
}

export default function DocumentTree({
  doc, index, selected, onSelect, onContextMenu,
  expandTick, expandTarget, docExpTick = 0, docExpTarget = true, onAddFilter, onFieldDrag,
  editingPath, onStartEdit, onCommitEdit, onCancelEdit, onFieldContextMenu,
}: DocTreeProps) {
  const hooks = useMemo<Hooks>(
    () => ({ onAddFilter, onFieldDrag, editingPath, onStartEdit, onCommitEdit, onCancelEdit, onFieldContextMenu }),
    [onAddFilter, onFieldDrag, editingPath, onStartEdit, onCommitEdit, onCancelEdit, onFieldContextMenu],
  );
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

  const rawId = doc._id;
  const id = rawId == null ? 'Document' : (typeof rawId === 'object' && '$oid' in rawId) ? rawId.$oid : String(rawId);
  const preview = id.length > 32 ? id.slice(0, 32) + '…' : id;

  // First few non-_id fields, so a collapsed list says something about its
  // documents instead of showing a column of identical-looking ObjectIds.
  const previewFields = useMemo(
    () => Object.entries(doc)
      .filter(([k]) => k !== '_id')
      .slice(0, PREVIEW_FIELDS)
      .map(([k, v]) => ({ key: k, ...previewValue(v) })),
    [doc]
  );

  return (
    <div
      className={`doc-tree-item${selected ? ' doc-tree-selected' : ''}`}
      onContextMenu={onContextMenu}
    >
      <div
        className="doc-tree-header tree-grid-row"
        onClick={e => onSelect?.(e)}
        onDoubleClick={() => setOpen(o => !o)}
        onMouseDown={e => { if (e.shiftKey) e.preventDefault(); }}
      >
        <span className="tg-key">
          <span className="tree-chevron" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>{open ? '▾' : '▸'}</span>
          {index != null && <span className="doc-tree-index">({index})</span>}
          <span className="doc-tree-id" title={oidTitle(rawId)}>{preview}</span>
        </span>
        <span className="tg-val">
        {open && <span className="tree-summary">{containerSummary(doc)}</span>}
        {!open && previewFields.length > 0 && (
          <span className="doc-tree-preview">
            {previewFields.map(f => (
              <span key={f.key} className="doc-preview-field">
                <span className="tree-key">{f.key}</span>
                <span className="tree-sep">: </span>
                <span className={f.cls} title={f.title}>{f.text}</span>
              </span>
            ))}
          </span>
        )}
        </span>
        <span className="tg-type">Document</span>
      </div>
      {open && (
        <div className="doc-tree-body">
          {Object.entries(doc).map(([k, v]) => (
            <TreeNode key={k} name={k} path={k} segs={[k]} filterPath={k} inArray={false} value={v} depth={0} expandTick={internalTick} expandTarget={internalTarget} hooks={hooks} />
          ))}
        </div>
      )}
    </div>
  );
}
