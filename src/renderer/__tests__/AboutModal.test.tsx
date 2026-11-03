import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../utils/sounds', () => ({ playSound: vi.fn() }));
import { playSound } from '../utils/sounds';
import AboutModal from '../components/AboutModal';

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).electron = { on: () => () => {}, invoke: vi.fn().mockResolvedValue(null) };
});

describe('AboutModal — easter egg', () => {
  it('the spinning cube says faaah when clicked', () => {
    render(<AboutModal onClose={vi.fn()} onCheckUpdates={vi.fn()} onViewChangelog={vi.fn()} />);
    fireEvent.click(screen.getByRole('img', { name: 'BoxyNoSql logo' }));
    expect(playSound).toHaveBeenCalledWith('faaah');
  });

  it('is silent until found', () => {
    render(<AboutModal onClose={vi.fn()} onCheckUpdates={vi.fn()} onViewChangelog={vi.fn()} />);
    expect(playSound).not.toHaveBeenCalled();
  });
});

describe('AboutModal — easter egg spin', () => {
  it('ramps up, holds, then settles back to normal speed', async () => {
    const { spinBoostRate, SPIN_PEAK, SPIN_TOTAL } = await import('../components/AboutModal');
    expect(spinBoostRate(0)).toBe(1);
    expect(spinBoostRate(100)).toBeGreaterThan(1);
    expect(spinBoostRate(1000)).toBe(SPIN_PEAK);
    const late = spinBoostRate(SPIN_TOTAL - 100);
    expect(late).toBeGreaterThan(1);
    expect(late).toBeLessThan(SPIN_PEAK);
    expect(spinBoostRate(SPIN_TOTAL)).toBe(1);
    // A second click mid-boost starts from the current speed, never back at 1.
    expect(spinBoostRate(1, 6)).toBeGreaterThanOrEqual(6);
  });

  it('speeds up the running spin on click and brings it back to 1', () => {
    const anim = { playbackRate: 1 };
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { frames.push(cb); return frames.length; });
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    render(<AboutModal onClose={vi.fn()} onCheckUpdates={vi.fn()} onViewChangelog={vi.fn()} />);
    const cube = screen.getByRole('img', { name: 'BoxyNoSql logo' });
    (cube as any).getAnimations = () => [anim];
    fireEvent.click(cube);

    frames.shift()!(1000);
    expect(anim.playbackRate).toBe(8);
    frames.shift()!(60_000);
    expect(anim.playbackRate).toBe(1);
    expect(frames).toHaveLength(0); // stops scheduling once settled
    raf.mockRestore(); now.mockRestore();
  });
});
