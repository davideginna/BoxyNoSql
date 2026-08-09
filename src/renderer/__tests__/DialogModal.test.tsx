import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DialogModal from '../components/DialogModal';
import { showConfirm } from '../dialog';

beforeEach(() => { render(<DialogModal />); });

const typedField = () => screen.getByLabelText(/to confirm/);

describe('DialogModal — typed confirmation', () => {
  it('keeps the destructive button locked until the name is typed exactly', async () => {
    const answer = showConfirm({ message: 'Drop it?', danger: true, confirmText: 'Drop', requireTyped: 'users' });
    const btn = await screen.findByRole('button', { name: 'Drop' });

    expect(btn).toBeDisabled();

    fireEvent.change(typedField(), { target: { value: 'user' } });
    expect(btn).toBeDisabled();

    // Same letters, wrong case — still locked.
    fireEvent.change(typedField(), { target: { value: 'Users' } });
    expect(btn).toBeDisabled();

    fireEvent.change(typedField(), { target: { value: 'users' } });
    expect(btn).toBeEnabled();

    fireEvent.click(btn);
    await expect(answer).resolves.toBe(true);
  });

  it('shows what is about to be destroyed', async () => {
    showConfirm({ message: 'Drop it?', confirmText: 'Drop', requireTyped: 'db1', impact: '≈1,204 documents in 3 collections' });
    expect(await screen.findByText('≈1,204 documents in 3 collections')).toBeInTheDocument();
  });

  it('takes Enter from the field only once the name matches', async () => {
    const answer = showConfirm({ message: 'Drop it?', confirmText: 'Drop', requireTyped: 'users' });
    await screen.findByRole('button', { name: 'Drop' });

    fireEvent.keyDown(typedField(), { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Drop' })).toBeInTheDocument();  // still open

    fireEvent.change(typedField(), { target: { value: 'users' } });
    fireEvent.keyDown(typedField(), { key: 'Enter' });
    await expect(answer).resolves.toBe(true);
  });

  it('cancels on Escape from the field', async () => {
    const answer = showConfirm({ message: 'Drop it?', confirmText: 'Drop', requireTyped: 'users' });
    await screen.findByRole('button', { name: 'Drop' });

    fireEvent.keyDown(typedField(), { key: 'Escape' });
    await expect(answer).resolves.toBe(false);
  });

  it('leaves an ordinary confirmation alone — no field, button ready', async () => {
    showConfirm({ message: 'Sure?', confirmText: 'OK' });
    const btn = await screen.findByRole('button', { name: 'OK' });

    expect(btn).toBeEnabled();
    expect(screen.queryByLabelText(/to confirm/)).toBeNull();
  });

  it('starts each dialog with an empty field, never a leftover match', async () => {
    const first = showConfirm({ message: 'Drop it?', confirmText: 'Drop', requireTyped: 'users' });
    await screen.findByRole('button', { name: 'Drop' });
    fireEvent.change(typedField(), { target: { value: 'users' } });
    fireEvent.click(screen.getByRole('button', { name: 'Drop' }));
    await expect(first).resolves.toBe(true);

    showConfirm({ message: 'Drop it?', confirmText: 'Drop', requireTyped: 'users' });
    const btn = await screen.findByRole('button', { name: 'Drop' });
    expect(typedField()).toHaveValue('');
    expect(btn).toBeDisabled();
  });
});
