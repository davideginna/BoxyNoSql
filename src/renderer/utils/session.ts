interface Tab {
  id: string;
  type: 'documents' | 'query' | 'aggregation' | 'indexes' | 'stats' | 'schema';
  title: string;
  collection?: string;
  database?: string;
  connectionId?: string;
}

// `connectionIds`: every connection that was connected, tabs or not — without it
// a connection with no open tab was forgotten. Absent in snapshots saved before it existed.
interface Session { tabs: Tab[]; activeTab: string | null; connectionIds?: string[] }

const STORAGE_KEY = 'lastSession';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function saveSession(tabs: Tab[], activeTab: string | null, connectionIds: string[] = []) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTab, connectionIds }));
}

/** Connections to reconnect on startup: the saved ones plus any a tab needs, in that order, deduped. */
export function sessionConnectionIds(session: Session): string[] {
  return [...new Set([
    ...(session.connectionIds ?? []),
    ...session.tabs.map(t => t.connectionId).filter((id): id is string => !!id),
  ])];
}

// Settings → "Reopen last session on startup". On by default; 'false' skips the
// startup reconnect + tab restore. The snapshot keeps being written either way,
// so turning it back on restores whatever was open at the last close.
const RESTORE_KEY = 'restoreSession';

export function loadRestoreSession(): boolean {
  try { return localStorage.getItem(RESTORE_KEY) !== 'false'; } catch { return true; }
}

export function saveRestoreSession(on: boolean) {
  try { localStorage.setItem(RESTORE_KEY, String(on)); } catch {}
}
