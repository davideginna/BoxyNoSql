import { useState, useEffect, useMemo } from 'react';
import Icon from './Icon';
import {
  CsvColumnMapping, CsvFieldType, buildCsvDocuments, guessCsvColumnType,
} from '../utils/fileImport';

const TYPE_OPTIONS: { value: CsvFieldType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
  { value: 'objectid', label: 'ObjectId' },
  { value: 'skip', label: 'Skip column' },
];

const PREVIEW_ROWS = 5;

interface Props {
  fileName: string;
  headers: string[];
  rows: string[][];
  /** Set when importing into an already-existing collection — the name is fixed, not editable. */
  defaultColName?: string;
  onImport: (docs: any[], colName: string) => void | Promise<void>;
  onClose: () => void;
}

export default function ImportCsvModal({ fileName, headers, rows, defaultColName, onImport, onClose }: Props) {
  const [colName, setColName] = useState(defaultColName || '');
  const [mapping, setMapping] = useState<CsvColumnMapping[]>(
    () => headers.map((h, i) => ({ field: h.trim(), type: guessCsvColumnType(rows[0]?.[i] ?? '') }))
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const activeCount = mapping.filter(m => m.type !== 'skip' && m.field.trim()).length;
  const preview = useMemo(() => rows.slice(0, PREVIEW_ROWS), [rows]);

  const setField = (i: number, field: string) =>
    setMapping(m => m.map((c, j) => (j === i ? { ...c, field } : c)));
  const setType = (i: number, type: CsvFieldType) =>
    setMapping(m => m.map((c, j) => (j === i ? { ...c, type } : c)));

  const canImport = colName.trim() && activeCount > 0 && !busy;

  const run = async () => {
    if (!canImport) return;
    setBusy(true);
    try {
      const docs = buildCsvDocuments(headers, rows, mapping);
      await onImport(docs, colName.trim());
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1700 }}>
      <div className="modal modal-wide import-csv-modal">
        <div className="modal-header">
          <h3>Import CSV/TSV</h3>
          <span className="import-uri-file"><Icon name="import" size={13} /> {fileName}</span>
        </div>

        <div className="modal-body import-csv-body">
          <div className="import-csv-toprow">
            <label>
              Collection
              <input
                value={colName}
                disabled={!!defaultColName}
                onChange={e => setColName(e.target.value)}
                placeholder="collection name"
              />
            </label>
            <span className="import-csv-count">{rows.length} rows · {activeCount} of {headers.length} columns mapped</span>
          </div>

          <div className="import-csv-table-wrap">
            <table className="import-csv-table">
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i}>
                      <input
                        className="import-csv-field-input"
                        value={mapping[i].field}
                        onChange={e => setField(i, e.target.value)}
                        placeholder={h || `column ${i + 1}`}
                      />
                      <select
                        className="import-csv-type-select"
                        value={mapping[i].type}
                        onChange={e => setType(i, e.target.value as CsvFieldType)}
                      >
                        {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, r) => (
                  <tr key={r} className={r % 2 === 1 ? 'alt' : undefined}>
                    {headers.map((_, i) => (
                      <td key={i} className={mapping[i].type === 'skip' ? 'import-csv-skipped' : undefined}>
                        {row[i] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > PREVIEW_ROWS && (
            <div className="modal-hint">Showing the first {PREVIEW_ROWS} of {rows.length} rows.</div>
          )}
        </div>

        <div className="modal-footer">
          <button className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button onClick={run} disabled={!canImport}>
            {busy ? 'Importing…' : `Import ${rows.length} document${rows.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
