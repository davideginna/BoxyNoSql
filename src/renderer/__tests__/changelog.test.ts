import { describe, it, expect, beforeEach } from 'vitest';
import { parseChangelog, sectionsSince, getLastSeenVersion, setLastSeenVersion } from '../utils/changelog';

const SAMPLE = `# Changelog

## [1.6.0] - 2026-09-03

### Added
- Fold/collapse in the editor

### Fixed
- ObjectId no longer red-squiggles

## [1.5.1] - 2026-08-09

### Fixed
- Smaller installers

## [1.5.0] - 2026-08-09

### Added
- Several connections open at once
`;

describe('parseChangelog', () => {
  it('splits on the Keep-a-Changelog version headings, newest first', () => {
    const sections = parseChangelog(SAMPLE);
    expect(sections.map(s => s.version)).toEqual(['1.6.0', '1.5.1', '1.5.0']);
  });

  it('captures the date from the heading', () => {
    const sections = parseChangelog(SAMPLE);
    expect(sections[0].date).toBe('2026-09-03');
  });

  it('keeps everything up to the next heading as the body, trimmed', () => {
    const sections = parseChangelog(SAMPLE);
    expect(sections[0].body).toBe('### Added\n- Fold/collapse in the editor\n\n### Fixed\n- ObjectId no longer red-squiggles');
  });

  it('is empty for a file with no version headings', () => {
    expect(parseChangelog('# Changelog\n\nNothing here yet.\n')).toEqual([]);
  });
});

describe('sectionsSince', () => {
  const sections = parseChangelog(SAMPLE);

  it('is empty with no last-seen version — nothing to diff against', () => {
    expect(sectionsSince(sections, null)).toEqual([]);
  });

  it('returns everything strictly newer than the last-seen version', () => {
    expect(sectionsSince(sections, '1.5.1').map(s => s.version)).toEqual(['1.6.0']);
  });

  it('is empty when the last-seen version is already the newest', () => {
    expect(sectionsSince(sections, '1.6.0')).toEqual([]);
  });

  it('falls back to just the latest section for an unrecognized version', () => {
    expect(sectionsSince(sections, '0.9.0').map(s => s.version)).toEqual(['1.6.0']);
  });
});

describe('last-seen version storage', () => {
  beforeEach(() => localStorage.clear());

  it('is null when nothing was ever saved', () => {
    expect(getLastSeenVersion()).toBeNull();
  });

  it('round-trips whatever was saved', () => {
    setLastSeenVersion('1.6.0');
    expect(getLastSeenVersion()).toBe('1.6.0');
  });
});
