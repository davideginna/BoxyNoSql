import { describe, it, expect, beforeEach } from 'vitest';
import {
  UpdateStatus, shouldShow, formatBytes, formatSpeed,
  getCheckOnStartup, setCheckOnStartup, getSkippedVersion, setSkippedVersion,
} from '../utils/updates';

const available = (version: string, manual: boolean): UpdateStatus => ({
  state: 'available', version, notes: '', url: '', canAutoInstall: true, manual,
});

describe('shouldShow', () => {
  it('reports everything back when the user asked for the check', () => {
    expect(shouldShow({ state: 'checking', manual: true }, null)).toBe(true);
    expect(shouldShow({ state: 'up-to-date', version: '1.2.0', manual: true }, null)).toBe(true);
    expect(shouldShow({ state: 'error', message: 'boom', manual: true }, null)).toBe(true);
  });

  it('stays silent on an automatic check that found nothing or failed', () => {
    expect(shouldShow({ state: 'checking', manual: false }, null)).toBe(false);
    expect(shouldShow({ state: 'up-to-date', version: '1.2.0', manual: false }, null)).toBe(false);
    expect(shouldShow({ state: 'error', message: 'offline', manual: false }, null)).toBe(false);
  });

  it('interrupts on startup only for a version the user has not skipped', () => {
    expect(shouldShow(available('1.3.0', false), null)).toBe(true);
    expect(shouldShow(available('1.3.0', false), '1.2.5')).toBe(true);
    expect(shouldShow(available('1.3.0', false), '1.3.0')).toBe(false);
  });

  it('shows a skipped version again when the user checks manually', () => {
    expect(shouldShow(available('1.3.0', true), '1.3.0')).toBe(true);
  });

  it('always shows download progress, which only follows a user action', () => {
    expect(shouldShow(
      { state: 'downloading', percent: 12, transferred: 1, total: 2, bytesPerSecond: 3 }, '1.3.0'
    )).toBe(true);
    expect(shouldShow({ state: 'downloaded', version: '1.3.0' }, '1.3.0')).toBe(true);
  });
});

describe('preferences', () => {
  beforeEach(() => localStorage.clear());

  it('checks on startup unless explicitly turned off', () => {
    expect(getCheckOnStartup()).toBe(true);
    setCheckOnStartup(false);
    expect(getCheckOnStartup()).toBe(false);
    setCheckOnStartup(true);
    expect(getCheckOnStartup()).toBe(true);
  });

  it('remembers and clears a skipped version', () => {
    expect(getSkippedVersion()).toBeNull();
    setSkippedVersion('1.3.0');
    expect(getSkippedVersion()).toBe('1.3.0');
    setSkippedVersion(null);
    expect(getSkippedVersion()).toBeNull();
  });
});

describe('formatBytes', () => {
  it('scales to the right unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });

  it('handles zero and nonsense input', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });
});

describe('formatSpeed', () => {
  it('is empty until there is a measured rate', () => {
    expect(formatSpeed(0)).toBe('');
    expect(formatSpeed(1024)).toBe('1.0 KB/s');
  });
});
