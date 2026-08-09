export interface PinnedCollection { connectionId: string; db: string; col: string }

const STORAGE_KEY = 'pinnedCollections';

export function loadPinned(): PinnedCollection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function savePinned(pins: PinnedCollection[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
}

export function isPinned(pins: PinnedCollection[], connectionId: string, db: string, col: string): boolean {
  return pins.some(p => p.connectionId === connectionId && p.db === db && p.col === col);
}

export function togglePinned(pins: PinnedCollection[], connectionId: string, db: string, col: string): PinnedCollection[] {
  return isPinned(pins, connectionId, db, col)
    ? pins.filter(p => !(p.connectionId === connectionId && p.db === db && p.col === col))
    : [...pins, { connectionId, db, col }];
}
