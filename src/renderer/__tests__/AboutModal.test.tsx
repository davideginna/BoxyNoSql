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
