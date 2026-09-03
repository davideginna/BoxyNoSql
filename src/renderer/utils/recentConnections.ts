/**
 * "Remove from recents" on the welcome screen's recent-connection cards.
 *
 * There is no separate history log — `MainContent` derives the recent list
 * live from each connection's `lastConnectedAt` (see CLAUDE.md). So hiding a
 * card can't delete a history *entry*; instead it records the timestamp that
 * was on screen when dismissed. A card stays hidden only while
 * `lastConnectedAt` hasn't moved past that mark — the next real connect bumps
 * it and the card reappears, the same way clearing one browser-history visit
 * doesn't stop a later visit from being logged.
 */
export type HiddenRecents = Record<string, number>;

const STORAGE_KEY = 'hiddenRecents';

export function loadHiddenRecents(): HiddenRecents {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveHiddenRecents(hidden: HiddenRecents) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden));
}

export function isHiddenRecent(hidden: HiddenRecents, connectionId: string, lastConnectedAt: number | undefined): boolean {
  const hiddenAt = hidden[connectionId];
  return hiddenAt != null && lastConnectedAt != null && hiddenAt >= lastConnectedAt;
}

export function hideRecent(hidden: HiddenRecents, connectionId: string, lastConnectedAt: number): HiddenRecents {
  return { ...hidden, [connectionId]: lastConnectedAt };
}
