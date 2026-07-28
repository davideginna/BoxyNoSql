interface StatsViewProps {
  stats: any;
}

const mb = (n: any) => (typeof n === 'number' ? `${(n / 1024 / 1024).toFixed(2)} MB` : '—');
const num = (n: any) => (n === undefined || n === null ? '—' : String(n));

export default function StatsView({ stats }: StatsViewProps) {
  if (!stats) {
    return (
      <div className="tab-pane active stats-loading">
        Loading stats...
      </div>
    );
  }

  const StatRow = ({ label, value }: { label: string; value: any }) => (
    <div className="stats-row">
      <span className="stats-label">{label}</span>
      <span className="stats-value">{String(value)}</span>
    </div>
  );

  const wt = stats.wiredTiger;
  const lsmSize = wt?.LSM?.['size of all LSM objects'];
  const cacheBytes = wt?.cache?.['bytes currently in the cache'];

  return (
    <div className="tab-pane active stats-view">
      <h3 className="stats-heading">Collection Statistics</h3>
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
          <h3 className="stats-heading second">WiredTiger Stats</h3>
          <div>
            {typeof lsmSize === 'number' && <StatRow label="LSM Size" value={mb(lsmSize)} />}
            {typeof cacheBytes === 'number' && <StatRow label="Cache Bytes" value={mb(cacheBytes)} />}
            {typeof lsmSize !== 'number' && typeof cacheBytes !== 'number' && (
              <div className="stats-note">No WiredTiger stats available.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
