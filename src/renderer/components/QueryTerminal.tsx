import { useState } from 'react';

interface QueryTerminalProps {
  connectionId: string;
  database: string;
  collection: string;
  result: any[];
  setResult: (result: any[]) => void;
}

export default function QueryTerminal({ connectionId, database, collection, result, setResult }: QueryTerminalProps) {
  const [query, setQuery] = useState(`db.collection("${collection}").find({}).limit(100)`);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await (window as any).electron.invoke('run-query', connectionId, database, collection, query);
      setResult(Array.isArray(result) ? result : [result]);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleClear = () => {
    setResult([]);
    setError(null);
  };

  return (
    <div className="tab-pane active" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="toolbar">
        <button onClick={handleRun} disabled={loading}>
          {loading ? 'Running...' : '▶ Run Query'}
        </button>
        <button className="secondary" onClick={handleClear}>Clear</button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>
          {database}.{collection}
        </span>
      </div>
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
        <div style={{ flex: 1, padding: 12 }}>
          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              width: '100%',
              height: '100%',
              background: '#1e1e1e',
              border: '1px solid #3c3c3c',
              color: '#cccccc',
              fontFamily: 'Consolas, Monaco, monospace',
              fontSize: 13,
              padding: 12,
              resize: 'none'
            }}
            placeholder="Enter query..."
          />
        </div>
        <div style={{ flex: 1, overflow: 'auto', borderTop: '1px solid #3c3c3c' }}>
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
