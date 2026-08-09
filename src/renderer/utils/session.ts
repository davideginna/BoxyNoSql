interface Tab {
  id: string;
  type: 'documents' | 'query' | 'aggregation' | 'indexes' | 'stats';
  title: string;
  collection?: string;
  database?: string;
  connectionId?: string;
}

interface Session { tabs: Tab[]; activeTab: string | null }

const STORAGE_KEY = 'lastSession';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function saveSession(tabs: Tab[], activeTab: string | null) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTab }));
}
