// Connect / disconnect / refresh / error sound cues. The files live in `assets/audio/` and Vite
// bundles them as hashed assets, so they ship inside `dist/renderer` with no
// extra `build.files` entry. On by default; `localStorage['soundsEnabled']`
// = 'false' turns them off (Appearance settings).
import connectUrl from '../../../assets/audio/connect.mp3';
import disconnectUrl from '../../../assets/audio/disconnect.mp3';
import errorUrl from '../../../assets/audio/error.mp3';
import faaahUrl from '../../../assets/audio/faaah.mp3';
import refreshUrl from '../../../assets/audio/refresh.mp3';

// `faaah` is the About-cube easter egg.
export type SoundName = 'connect' | 'disconnect' | 'error' | 'refresh' | 'faaah';

const URLS: Record<SoundName, string> = {
  connect: connectUrl, disconnect: disconnectUrl, error: errorUrl, refresh: refreshUrl, faaah: faaahUrl,
};
const KEY = 'soundsEnabled';

// A dropped server fails every in-flight call at once; one cue is enough.
const MIN_GAP_MS = 1000;
const lastPlayed: Partial<Record<SoundName, number>> = {};

export function loadSoundsEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== 'false'; } catch { return true; }
}

export function saveSoundsEnabled(on: boolean) {
  try { localStorage.setItem(KEY, String(on)); } catch {}
}

/** Fire-and-forget: a blocked or failed playback must never surface as an error. */
export function playSound(name: SoundName) {
  if (!loadSoundsEnabled()) return;
  const now = Date.now();
  if (now - (lastPlayed[name] ?? 0) < MIN_GAP_MS) return;
  lastPlayed[name] = now;
  try { void new Audio(URLS[name]).play().catch(() => {}); } catch {}
}
