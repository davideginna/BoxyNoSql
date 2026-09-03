export interface ChangelogSection {
  version: string;
  date: string;
  body: string;
}

const HEADING_RE = /^## \[([^\]]+)\] - (.+)$/;

/** Splits `CHANGELOG.md`'s Keep-a-Changelog `## [x.y.z] - date` headings into
 *  sections, newest first (the file's own order). */
export function parseChangelog(raw: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  let current: ChangelogSection | null = null;
  let body: string[] = [];

  const flush = () => {
    if (current) sections.push({ ...current, body: body.join('\n').trim() });
  };

  for (const line of raw.split('\n')) {
    const m = HEADING_RE.exec(line);
    if (m) {
      flush();
      current = { version: m[1], date: m[2], body: '' };
      body = [];
    } else if (current) {
      body.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Everything newer than `lastSeenVersion`, for the "what's new since you last
 * opened this" popup. Matched by exact version string, not semver compare —
 * the file is already newest-first, so "newer than X" is just "everything
 * before X's own heading". An unrecognized `lastSeenVersion` (a very old
 * install, or a trimmed changelog) falls back to just the latest section
 * rather than the whole file or nothing.
 */
export function sectionsSince(sections: ChangelogSection[], lastSeenVersion: string | null): ChangelogSection[] {
  if (!lastSeenVersion) return [];
  const idx = sections.findIndex(s => s.version === lastSeenVersion);
  if (idx === -1) return sections.slice(0, 1);
  return sections.slice(0, idx);
}

const KEY_LAST_SEEN = 'lastSeenChangelogVersion';

export const getLastSeenVersion = (): string | null => localStorage.getItem(KEY_LAST_SEEN);
export const setLastSeenVersion = (version: string) => localStorage.setItem(KEY_LAST_SEEN, version);
