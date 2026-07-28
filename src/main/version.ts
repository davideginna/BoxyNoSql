/**
 * Semver-ish comparison, kept free of any `electron` import so it stays unit
 * testable. Enough for the tags this project publishes (`v1.2.0`,
 * `v1.3.0-beta.1`); it does not implement the full semver spec.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre = ''] = v.trim().replace(/^v/i, '').split('-');
    return { nums: core.split('.').map(n => parseInt(n, 10) || 0), pre };
  };
  const pa = parse(a), pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  // A release outranks any prerelease of the same core version (1.2.0 > 1.2.0-rc.1).
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  return pa.pre > pb.pre ? 1 : -1;
}

export function isNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}
