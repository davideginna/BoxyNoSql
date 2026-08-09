import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CommandPalette from '../components/CommandPalette';
import type { PaletteItem } from '../utils/palette';

const makeItems = (run = vi.fn()): PaletteItem[] => [
  { id: 'a', kind: 'collection', label: 'users', sublabel: 'prod / testdb', run },
  { id: 'b', kind: 'collection', label: 'orders', sublabel: 'prod / testdb', run },
  { id: 'c', kind: 'database', label: 'testdb', sublabel: 'prod', run },
  { id: 'd', kind: 'action', label: 'Refresh tree', keywords: 'f5 reload', run },
];

const open = (items = makeItems(), onClose = vi.fn()) => {
  render(<CommandPalette items={items} onClose={onClose} />);
  return { input: screen.getByRole('textbox'), onClose };
};

const rows = () => screen.getAllByRole('button').map(b => b.textContent);
const selected = () => document.querySelector('.cp-item.selected')?.textContent ?? '';

describe('CommandPalette', () => {
  it('lists everything before anything is typed', () => {
    open();
    expect(rows()).toHaveLength(4);
    expect(screen.getByText('Refresh tree')).toBeInTheDocument();
  });

  it('filters as you type, fuzzily', () => {
    const { input } = open();
    fireEvent.change(input, { target: { value: 'usr' } });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toContain('users');
  });

  it('finds an action through keywords that are not shown', () => {
    const { input } = open();
    fireEvent.change(input, { target: { value: 'f5' } });
    expect(rows()[0]).toContain('Refresh tree');
    expect(screen.queryByText(/reload/)).toBeNull();
  });

  it('says so when nothing matches', () => {
    const { input } = open();
    fireEvent.change(input, { target: { value: 'zzzz' } });
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });

  it('moves the highlight with the arrows and wraps around', () => {
    const { input } = open();
    expect(selected()).toContain('users');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(selected()).toContain('orders');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(selected()).toContain('Refresh tree');
  });

  it('runs the highlighted row on Enter and closes', () => {
    const run = vi.fn();
    const onClose = vi.fn();
    const { input } = open(makeItems(run), onClose);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('runs on click too', () => {
    const run = vi.fn();
    open(makeItems(run));
    fireEvent.click(screen.getByText('orders'));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('resets the highlight when the query changes', () => {
    const { input } = open();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.change(input, { target: { value: 'r' } });
    expect(selected()).toBe(rows()[0]);
  });

  it('does nothing on Enter when nothing matches', () => {
    const run = vi.fn();
    const onClose = vi.fn();
    const { input } = open(makeItems(run), onClose);

    fireEvent.change(input, { target: { value: 'zzzz' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(run).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const { onClose } = open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
