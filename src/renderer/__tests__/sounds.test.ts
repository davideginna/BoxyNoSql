import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { playSound, loadSoundsEnabled, saveSoundsEnabled } from '../utils/sounds';

// jsdom has no media playback, so Audio is replaced with a recorder.
const played: string[] = [];
let play: ReturnType<typeof vi.fn>;
let testNo = 0;

beforeEach(() => {
  localStorage.clear();
  played.length = 0;
  play = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('Audio', vi.fn(function (this: any, src: string) { played.push(src); this.play = play; }));
  // The 1s same-sound gap is module state: start every test far from the last one.
  // The clock only moves forward, so each test lands a minute past the last.
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 60_000 * ++testNo);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('sounds', () => {
  it('are enabled by default and persist the toggle', () => {
    expect(loadSoundsEnabled()).toBe(true);
    saveSoundsEnabled(false);
    expect(loadSoundsEnabled()).toBe(false);
    saveSoundsEnabled(true);
    expect(loadSoundsEnabled()).toBe(true);
  });

  it('plays a distinct file per sound', () => {
    playSound('connect');
    playSound('disconnect');
    playSound('error');
    playSound('refresh');
    playSound('faaah');
    expect(played).toHaveLength(5);
    expect(new Set(played).size).toBe(5);
    expect(played[0]).toMatch(/connect.*\.mp3/);
    expect(played[3]).toMatch(/refresh.*\.mp3/);
    expect(played[4]).toMatch(/faaah.*\.mp3/);
  });

  it('stays silent when disabled', () => {
    saveSoundsEnabled(false);
    playSound('connect');
    playSound('error');
    expect(played).toHaveLength(0);
  });

  it('drops the same sound repeated within a second, not a different one', () => {
    playSound('error');
    playSound('error');
    playSound('connect');
    expect(played).toHaveLength(2);
    vi.advanceTimersByTime(1000);
    playSound('error');
    expect(played).toHaveLength(3);
  });

  it('swallows a rejected or throwing playback', async () => {
    play.mockRejectedValueOnce(new Error('NotAllowedError'));
    expect(() => playSound('connect')).not.toThrow();
    await Promise.resolve();
    vi.stubGlobal('Audio', vi.fn(() => { throw new Error('no audio'); }));
    expect(() => playSound('disconnect')).not.toThrow();
  });
});
