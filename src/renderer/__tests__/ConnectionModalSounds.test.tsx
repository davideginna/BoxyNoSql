import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../utils/sounds', () => ({ playSound: vi.fn() }));
import { playSound } from '../utils/sounds';
import ConnectionModal from '../components/ConnectionModal';

const CONNECTION = { id: '1', name: 'local', uri: 'mongodb://localhost:27017' };

function withTestResult(result: unknown) {
  (window as any).electron = {
    on: () => () => {},
    invoke: vi.fn((ch: string) => Promise.resolve(ch === 'test-connection' ? result : null)),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('ConnectionModal — test connection sound', () => {
  it('plays the error sound when the test fails', async () => {
    withTestResult({ success: false, error: 'Server selection timed out' });
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Test Connection/i }));
    await waitFor(() => expect(screen.getByText(/timed out/)).toBeInTheDocument());
    expect(playSound).toHaveBeenCalledWith('error');
  });

  it('plays the success sound when the test succeeds', async () => {
    withTestResult({ success: true });
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Test Connection/i }));
    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
    expect(playSound).toHaveBeenCalledWith('success');
    expect(playSound).not.toHaveBeenCalledWith('error');
  });
});
