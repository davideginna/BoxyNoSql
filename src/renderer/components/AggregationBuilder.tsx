import { useState } from 'react';

const STAGES = [
  '$match', '$project', '$group', '$sort', '$limit', '$skip',
  '$unwind', '$lookup', '$addFields', '$facet', '$count', '$geoNear'
];

interface AggregationBuilderProps {
  connectionId: string;
  database: string;
  collection: string;
  result: any[];
  setResult: (result: any[]) => void;
}

export default function AggregationBuilder({ connectionId, database, collection, result, setResult }: AggregationBuilderProps) {
  const [stages, setStages] = useState<{ stage: string; value: string }[]>([
    { stage: '$match', value: '{}' }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addStage = () => {
    setStages([...stages, { stage: '$match', value: '{}' }]);
  };

  const removeStage = (index: number) => {
    setStages(stages.filter((_, i) => i !== index));
  };

  const updateStage = (index: number, field: 'stage' | 'value', value: string) => {
    const newStages = [...stages];
    newStages[index] = { ...newStages[index], [field]: value };
    setStages(newStages);
  };

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const pipeline = stages.map(s => ({
        [s.stage]: JSON.parse(s.value || '{}')
      }));
      const res = await (window as any).electron.invoke('run-aggregation', connectionId, database, collection, pipeline);
      setResult(res);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="aggregation-builder">
      <div className="toolbar">
        <button onClick={addStage}>+ Add Stage</button>
        <button onClick={handleRun} disabled={loading}>
          {loading ? 'Running...' : '▶ Run Pipeline'}
        </button>
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div className="pipeline-stages" style={{ width: 400, overflowY: 'auto', paddingRight: 8 }}>
          {stages.map((stage, index) => (
            <div key={index} className="pipeline-stage">
              <div className="pipeline-stage-header">
                <span style={{ fontSize: 12, color: '#888' }}>Stage {index + 1}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <select
                    value={stage.stage}
                    onChange={e => updateStage(index, 'stage', e.target.value)}
                  >
                    {STAGES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    className="icon-btn"
                    onClick={() => removeStage(index)}
                    style={{ padding: '2px 6px' }}
                  >
                    ×
                  </button>
                </div>
              </div>
              <textarea
                value={stage.value}
                onChange={e => updateStage(index, 'value', e.target.value)}
                placeholder={`{"field": "value"}`}
              />
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflow: 'auto', borderLeft: '1px solid #3c3c3c' }}>
          {error && (
            <div style={{ padding: 12, color: '#f48771', fontFamily: 'monospace' }}>
              Error: {error}
            </div>
          )}
          {result.length > 0 && (
            <div className="document-table">
              <table>
                <thead>
                  <tr>
                    {Object.keys(result[0]).map(key => (
                      <th key={key}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.map((doc, idx) => (
                    <tr key={idx}>
                      {Object.keys(result[0]).map(key => (
                        <td key={key} style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'monospace' }}>
                          {typeof doc[key] === 'object' ? JSON.stringify(doc[key]) : String(doc[key] ?? 'null')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
