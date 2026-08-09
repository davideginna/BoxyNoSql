import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExplainModal from '../components/ExplainModal';

const IXSCAN = {
  queryPlanner: {
    namespace: 'testdb.users',
    winningPlan: {
      stage: 'FETCH',
      inputStage: { stage: 'IXSCAN', keyPattern: { email: 1 }, indexName: 'email_1' },
    },
  },
  executionStats: {
    nReturned: 2, executionTimeMillis: 5, totalKeysExamined: 4, totalDocsExamined: 3,
    executionStages: {
      stage: 'FETCH', nReturned: 2,
      inputStage: { stage: 'IXSCAN', nReturned: 1, indexName: 'email_1', keyPattern: { email: 1 } },
    },
  },
};

const COLLSCAN = {
  queryPlanner: { namespace: 'testdb.users', winningPlan: { stage: 'COLLSCAN' } },
  executionStats: {
    nReturned: 12, executionTimeMillis: 41, totalKeysExamined: 0, totalDocsExamined: 50000,
    executionStages: { stage: 'COLLSCAN', nReturned: 12 },
  },
};

const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
});

const view = (raw: any, what = 'filter') =>
  render(
    <ExplainModal
      what={what}
      namespace="testdb.users"
      load={() => Promise.resolve(raw)}
      onClose={onClose}
    />
  );

describe('ExplainModal', () => {
  it('says what it is explaining and on which collection', async () => {
    view(IXSCAN);
    expect(await screen.findByText(/Explain filter · testdb\.users/)).toBeInTheDocument();
  });

  it('shows the verdict and the four numbers', async () => {
    view(IXSCAN);
    expect(await screen.findByText(/Index email_1 used/)).toBeInTheDocument();

    const metric = (label: string) =>
      screen.getByText(label).closest('.explain-metric')!.querySelector('.explain-metric-value')!;
    expect(metric('returned')).toHaveTextContent('2');
    expect(metric('documents examined')).toHaveTextContent('3');
    expect(metric('index keys examined')).toHaveTextContent('4');
    expect(metric('execution time')).toHaveTextContent('5 ms');
  });

  it('lists the winning plan stages with the index they use', async () => {
    view(IXSCAN);
    expect(await screen.findByText('FETCH')).toBeInTheDocument();
    expect(screen.getByText('IXSCAN')).toBeInTheDocument();
    expect(screen.getByText('email_1')).toBeInTheDocument();
    expect(screen.getByText('{ email: 1 }')).toBeInTheDocument();
  });

  it('flags a collection scan as bad, not as a neutral fact', async () => {
    const { container } = view(COLLSCAN);
    expect(await screen.findByText(/Collection scan/)).toBeInTheDocument();
    expect(container.querySelector('.explain-verdict--bad')).toBeTruthy();
  });

  it('keeps the raw output collapsed until asked, then shows it', async () => {
    view(COLLSCAN);
    await screen.findByText(/Collection scan/);
    expect(document.querySelector('.explain-raw')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Raw explain output/ }));
    expect(document.querySelector('.explain-raw')!.textContent).toContain('totalDocsExamined');
  });

  it('copies the raw output as JSON', async () => {
    view(COLLSCAN);
    await screen.findByText(/Collection scan/);
    fireEvent.click(screen.getByRole('button', { name: /Copy/ }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JSON.stringify(COLLSCAN, null, 2));
  });

  it('reports a refused explain instead of an empty panel', async () => {
    render(
      <ExplainModal
        what="pipeline"
        namespace="testdb.orders"
        load={() => Promise.reject(new Error('Cannot explain a pipeline containing $out'))}
        onClose={onClose}
      />
    );
    expect(await screen.findByText(/Cannot explain a pipeline containing \$out/)).toBeInTheDocument();
    expect(document.querySelector('.explain-metrics')).toBeNull();
  });

  it('explains once, not on every render', async () => {
    const load = vi.fn(async () => IXSCAN);
    const { rerender } = render(
      <ExplainModal what="query" namespace="testdb.users" load={load} onClose={onClose} />
    );
    await screen.findByText(/Index email_1 used/);
    rerender(<ExplainModal what="query" namespace="testdb.users" load={load} onClose={onClose} />);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and on the close button', async () => {
    view(IXSCAN);
    await screen.findByText(/Index email_1 used/);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
