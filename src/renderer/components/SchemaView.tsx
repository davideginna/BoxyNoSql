import { useState, useEffect } from 'react';
import Icon from './Icon';
import { TYPE_COLORS } from '../utils/buildFilter';
import { analyzeSchema, presencePercent, type SchemaReport, type SchemaType } from '../utils/schema';

const SAMPLE_SIZES = [100, 500, 1000, 5000];

/** `null` has no entry in the query-builder palette; everything else does. */
const typeColor = (type: SchemaType) =>
  type === 'null' ? 'var(--val-null)' : (TYPE_COLORS as Record<string, string>)[type] ?? 'var(--text-secondary)';

interface Props {
  connectionId: string;
  database: string;
  collection: string;
}

/**
 * What is actually in a collection, inferred from a `$sample`.
 *
 * The sample is taken server-side and the counting happens in `utils/schema.ts`
 * — `$sample` is one round trip, whereas asking the server for per-field
 * statistics would be a pipeline per field.
 */
export default function SchemaView({ connectionId, database, collection }: Props) {
  const [size, setSize] = useState(500);
  const [report, setReport] = useState<SchemaReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async (sampleSize: number) => {
    setLoading(true); setError(null);
    try {
      const docs = await (window as any).electron.invoke(
        'run-aggregation', connectionId, database, collection, [{ $sample: { size: sampleSize } }],
      );
      setReport(analyzeSchema(docs || []));
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  };

  // Re-sampling on every collection switch would fire a pipeline per tab
  // change, so the first sample is explicit; only the collection resets it.
  useEffect(() => { setReport(null); setError(null); }, [connectionId, database, collection]);

  return (
    <div className="tab-pane active pane-col">
      <div className="toolbar">
        <button onClick={() => analyze(size)} disabled={loading}>
          {loading ? 'Sampling…' : <><Icon name="play" size={12} /> Analyze</>}
        </button>
        <span className="toolbar-label toolbar-limit-label">Sample:</span>
        <select
          className="agg-stage-select"
          value={size}
          onChange={e => setSize(Number(e.target.value))}
        >
          {SAMPLE_SIZES.map(n => <option key={n} value={n}>{n} documents</option>)}
        </select>
        <span className="qt-meta">
          {report && `${report.fields.length} field${report.fields.length !== 1 ? 's' : ''} in ${report.sampled} sampled · `}
          {database}.{collection}
        </span>
      </div>

      <div className="schema-body">
        {error && <div className="pane-error">Error: {error}</div>}
        {!error && !report && !loading && (
          <div className="pane-empty">Sample the collection to see its fields, their types and how often they appear</div>
        )}
        {report && report.fields.length === 0 && !loading && (
          <div className="pane-empty">No documents in the sample</div>
        )}
        {report && report.fields.length > 0 && (
          <div className="document-table">
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Types</th>
                  <th>Present</th>
                  <th>Examples</th>
                </tr>
              </thead>
              <tbody>
                {report.fields.map(field => {
                  const percent = presencePercent(field, report.sampled);
                  return (
                    <tr key={field.path}>
                      <td className="schema-path">{field.path}</td>
                      <td>
                        <span className="schema-types">
                          {field.types.map(t => (
                            <span
                              key={t.type}
                              className="schema-type-chip"
                              style={{ background: typeColor(t.type) }}
                              title={`${t.count} of ${field.present} values`}
                            >{t.type}</span>
                          ))}
                        </span>
                      </td>
                      <td>
                        {/* Bar first, number second: which fields are optional
                            is the thing you scan this column for. */}
                        <span className="schema-presence" title={`${field.present} of ${report.sampled} documents`}>
                          <span className="schema-bar"><span className="schema-bar-fill" style={{ width: `${percent}%` }} /></span>
                          {percent}%
                        </span>
                      </td>
                      <td className="schema-examples">{field.examples.join(' · ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
