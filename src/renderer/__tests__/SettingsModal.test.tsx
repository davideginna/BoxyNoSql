import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SettingsModal from '../components/SettingsModal';
import { FONT_SCALES } from '../utils/fontScale';

const SETTINGS = { db: 'mono', col: 'mono', dbCustom: '#3498db', colCustom: '#3498db' } as any;

function setup(over: Partial<React.ComponentProps<typeof SettingsModal>> = {}) {
  const props = {
    settings: SETTINGS, onChange: vi.fn(),
    fontScale: 1, onFontScale: vi.fn(),
    soundsEnabled: true, onSoundsEnabled: vi.fn(),
    onClose: vi.fn(), ...over,
  };
  render(<SettingsModal {...props} />);
  return props;
}

describe('SettingsModal — text size and sounds', () => {
  it('offers every scale step as a percentage and reports the pick as a number', () => {
    const props = setup({ fontScale: 1.2 });
    const select = screen.getByDisplayValue('100%') as HTMLSelectElement;
    expect([...select.options].map(o => o.textContent)).toEqual(['80%', '100%', '120%']);
    expect([...select.options].map(o => parseFloat(o.value))).toEqual([...FONT_SCALES]);
    fireEvent.change(select, { target: { value: '1.44' } });
    expect(props.onFontScale).toHaveBeenCalledWith(1.44);
  });

  it('toggles sounds', () => {
    const props = setup({ soundsEnabled: true });
    const box = screen.getByRole('checkbox', { name: /Play sounds/i });
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(props.onSoundsEnabled).toHaveBeenCalledWith(false);
  });
});
