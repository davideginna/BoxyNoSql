interface StatsViewProps {
  stats: any;
}

const mb = (n: any) => (typeof n === 'number' ? `${(n / 1024 / 1024).toFixed(2)} MB` : '—');
const num = (n: any) => (n === undefined || n === null ? '—' : String(n));

export default function StatsView({ stats }: StatsViewProps) {
  if (!stats) {
    return (
      <div className="tab-pane active" style={{ padding: 24, color: '#888' }}>
        Loading stats...
      </div>
    );
  }

  const StatRow = ({ label, value }: { label: string; value: any }) => (
    <div style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #3c3c3c' }}>
      <span style={{ color: '#888', width: 200 }}>{label}</span>
      <span style={{ fontFamily: 'monospace' }}>{String(value)}</span>
    </div>
  );

  const wt = stats.wiredTiger;
  const lsmSize = wt?.LSM?.['size of all LSM objects'];
  const cacheBytes = wt?.cache?.['bytes currently in the cache'];

  return (
    <div className="tab-pane active" style={{ padding: 24 }}>
      <h3 style={{ marginBottom: 16 }}>Collection Statistics</h3>
      <div>
        <StatRow label="Documents" value={num(stats.count)} />
        <StatRow label="Size" value={mb(stats.size)} />
        <StatRow label="Storage Size" value={mb(stats.storageSize)} />
        <StatRow label="Indexes" value={num(stats.nindexes)} />
        <StatRow label="Total Index Size" value={mb(stats.totalIndexSize)} />
        <StatRow label="Average Object Size" value={num(stats.avgObjSize)} />
        <StatRow label="Capped" value={stats.capped ? 'Yes' : 'No'} />
      </div>

      {wt && (
        <>
          <h3 style={{ marginTop: 24, marginBottom: 16 }}>WiredTiger Stats</h3>
          <div>
            {typeof lsmSize === 'number' && <StatRow label="LSM Size" value={mb(lsmSize)} />}
            {typeof cacheBytes === 'number' && <StatRow label="Cache Bytes" value={mb(cacheBytes)} />}
            {typeof lsmSize !== 'number' && typeof cacheBytes !== 'number' && (
              <div style={{ color: '#888', fontSize: 12 }}>No WiredTiger stats available.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
