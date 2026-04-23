interface StatsViewProps {
  stats: any;
}

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

  return (
    <div className="tab-pane active" style={{ padding: 24 }}>
      <h3 style={{ marginBottom: 16 }}>Collection Statistics</h3>
      <div>
        <StatRow label="Documents" value={stats.count} />
        <StatRow label="Size" value={`${(stats.size / 1024 / 1024).toFixed(2)} MB`} />
        <StatRow label="Storage Size" value={`${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`} />
        <StatRow label="Indexes" value={stats.nindexes} />
        <StatRow label="Total Index Size" value={`${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`} />
        <StatRow label="Average Object Size" value={stats.avgObjSize} />
        <StatRow label="Objects per Scan" value={stats.objsPerScan} />
      </div>

      <h3 style={{ marginTop: 24, marginBottom: 16 }}>WiredTiger Stats</h3>
      <div>
        <StatRow label="LSM Size" value={`${(stats.wiredTiger?.['LSM']['size of all LSM objects'] ?? 0) / 1024 / 1024} MB`} />
      </div>
    </div>
  );
}
