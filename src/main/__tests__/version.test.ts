import { describe, it, expect } from 'vitest';
import { compareVersions, isNewer } from '../version';

describe('compareVersions', () => {
  it('compares each numeric segment', () => {
    expect(compareVersions('1.3.0', '1.2.9')).toBe(1);
    expect(compareVersions('1.2.9', '1.3.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
  });

  it('ignores a leading v from git tags', () => {
    expect(compareVersions('v1.3.0', '1.2.0')).toBe(1);
    expect(compareVersions('v1.2.0', 'v1.2.0')).toBe(0);
  });

  it('treats missing segments as zero', () => {
    expect(compareVersions('1.3', '1.3.0')).toBe(0);
    expect(compareVersions('2', '1.9.9')).toBe(1);
  });

  it('ranks a release above its own prereleases', () => {
    expect(compareVersions('1.3.0', '1.3.0-beta.1')).toBe(1);
    expect(compareVersions('1.3.0-beta.1', '1.3.0')).toBe(-1);
    expect(compareVersions('1.3.0-beta.2', '1.3.0-beta.1')).toBe(1);
  });
});

describe('isNewer', () => {
  it('is true only for a strictly greater version', () => {
    expect(isNewer('1.3.0', '1.2.0')).toBe(true);
    expect(isNewer('1.2.0', '1.2.0')).toBe(false);
    expect(isNewer('1.1.0', '1.2.0')).toBe(false);
  });

  it('does not offer a prerelease as an upgrade over the matching release', () => {
    expect(isNewer('1.2.0-rc.1', '1.2.0')).toBe(false);
  });
});
