import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// Monaco needs a real layout engine and web workers, neither of which jsdom
// has. The editor is a controlled value/onChange box — a textarea is the same
// contract, and what this suite is about is the builder around it.
vi.mock('../components/MonacoQueryEditor', () => ({
  default: ({ value, onChange }: any) => (
    <textarea data-testid="stage-body" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

import AggregationBuilder from '../components/AggregationBuilder';

const invoke = vi.fn(async (channel: string, ..._args: any[]): Promise<any> => {
  if (channel === 'get-documents') return { docs: [{ _id: 1, status: 'paid' }], total: 1 };
  if (channel === 'run-aggregation') return [{ _id: 'paid', count: 2 }];
  if (channel === 'aggregation-stage-counts') return [500, 2];
  return null;
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  (window as any).electron = { on: () => () => {}, invoke };
});

const view = (result: any[] = []) => {
  const setResult = vi.fn();
  const r = render(
    <AggregationBuilder connectionId="c1" database="db" collection="orders" result={result} setResult={setResult} />
  );
  return { ...r, setResult };
};

const bodies = () => screen.getAllByTestId('stage-body') as HTMLTextAreaElement[];
const runBtn = () => screen.getByRole('button', { name: /Run Pipeline/ });
const callsTo = (channel: string) => invoke.mock.calls.filter(c => c[0] === channel);

describe('AggregationBuilder — stages', () => {
  it('starts with one $match stage carrying its template', () => {
    view();
    expect(bodies()).toHaveLength(1);
    expect(screen.getByRole('combobox')).toHaveValue('$match');
  });

  it('swaps the template when the stage type changes on an untouched body', () => {
    view();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '$limit' } });
    expect(bodies()[0].value).toBe('10');
  });

  it('never overwrites a body that was actually written', () => {
    view();
    fireEvent.change(bodies()[0], { target: { value: '{"status":"paid"}' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '$group' } });
    expect(bodies()[0].value).toBe('{"status":"paid"}');
  });

  it('adds, reorders and removes stages', () => {
    view();
    fireEvent.change(bodies()[0], { target: { value: '{"a":1}' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Stage/ }));
    fireEvent.change(bodies()[1], { target: { value: '{"b":2}' } });

    fireEvent.click(screen.getAllByTitle('Move down')[0]);
    expect(bodies().map(b => b.value)).toEqual(['{"b":2}', '{"a":1}']);

    fireEvent.click(screen.getAllByTitle('Remove stage')[0]);
    expect(bodies().map(b => b.value)).toEqual(['{"a":1}']);
  });
});

describe('AggregationBuilder — running', () => {
  it('sends the parsed pipeline', async () => {
    const { setResult } = view();
    fireEvent.change(bodies()[0], { target: { value: '{"status":"paid"}' } });
    fireEvent.click(runBtn());

    await waitFor(() => expect(callsTo('run-aggregation')).toHaveLength(1));
    expect(callsTo('run-aggregation')[0].slice(1)).toEqual(['c1', 'db', 'orders', [{ $match: { status: 'paid' } }]]);
    await waitFor(() => expect(setResult).toHaveBeenCalledWith([{ _id: 'paid', count: 2 }]));
  });

  it('refuses to run a stage with broken JSON, naming the stage', async () => {
    view();
    fireEvent.change(bodies()[0], { target: { value: '{"status":' } });
    fireEvent.click(runBtn());

    expect(await screen.findByText(/Stage 1 \(\$match\)/)).toBeInTheDocument();
    expect(callsTo('run-aggregation')).toHaveLength(0);
  });

  it('flags the offending stage while it is being typed', () => {
    const { container } = view();
    fireEvent.change(bodies()[0], { target: { value: '{oops' } });
    expect(container.querySelector('.stage-invalid')).not.toBeNull();

    fireEvent.change(bodies()[0], { target: { value: '{}' } });
    expect(container.querySelector('.stage-invalid')).toBeNull();
  });

  it('shows how many documents each stage leaves behind', async () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: /Add Stage/ }));
    fireEvent.click(runBtn());

    await waitFor(() => expect(callsTo('aggregation-stage-counts')).toHaveLength(1));
    expect(await screen.findByText('500 docs')).toBeInTheDocument();
    expect(screen.getByText('2 docs')).toBeInTheDocument();
  });

  it('drops the counters as soon as a stage is edited — they belong to the run', async () => {
    view();
    fireEvent.click(runBtn());
    expect(await screen.findByText('500 docs')).toBeInTheDocument();

    fireEvent.change(bodies()[0], { target: { value: '{"a":1}' } });
    expect(screen.queryByText('500 docs')).toBeNull();
  });

  it('keeps the result when only the counters fail', async () => {
    invoke.mockImplementation(async (channel: string): Promise<any> => {
      if (channel === 'get-documents') return { docs: [], total: 0 };
      if (channel === 'run-aggregation') return [{ ok: 1 }];
      if (channel === 'aggregation-stage-counts') throw new Error('counting blew up');
      return null;
    });
    const { setResult } = view();
    fireEvent.click(runBtn());

    await waitFor(() => expect(setResult).toHaveBeenCalledWith([{ ok: 1 }]));
    expect(screen.queryByText(/counting blew up/)).toBeNull();
  });
});

describe('AggregationBuilder — results', () => {
  it('exports only once there is something to export', () => {
    view();
    expect(screen.getByRole('button', { name: /Export/ })).toBeDisabled();
  });

  it('renders the result rows', () => {
    view([{ _id: 'paid', count: 2 }]);
    const table = screen.getByRole('table');
    expect(within(table).getByText('paid')).toBeInTheDocument();
  });
});
