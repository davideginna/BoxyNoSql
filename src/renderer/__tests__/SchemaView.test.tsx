import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import SchemaView from '../components/SchemaView';

const DOCS = [
  { _id: { $oid: 'a'.repeat(24) }, name: 'alpha', age: 30, nickname: 'al' },
  { _id: { $oid: 'b'.repeat(24) }, name: 'beta', age: 'unknown' },
  { _id: { $oid: 'c'.repeat(24) }, name: 'gamma', age: 41 },
];

const invoke = vi.fn(async (channel: string, ..._args: any[]): Promise<any> =>
  channel === 'run-aggregation' ? DOCS : null
);

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).electron = { on: () => () => {}, invoke };
});

const view = () => render(<SchemaView connectionId="c1" database="db" collection="users" />);
const analyze = () => fireEvent.click(screen.getByRole('button', { name: /Analyze/ }));
const row = (path: string) => screen.getByText(path).closest('tr')!;

describe('SchemaView', () => {
  it('samples nothing until asked — a tab switch should not fire a pipeline', () => {
    view();
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByText(/Sample the collection/)).toBeInTheDocument();
  });

  it('samples server-side with $sample of the chosen size', async () => {
    view();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1000' } });
    analyze();

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke.mock.calls[0].slice(1)).toEqual(['c1', 'db', 'users', [{ $sample: { size: 1000 } }]]);
  });

  it('lists every field with its types and how often it appears', async () => {
    view();
    analyze();

    expect(await screen.findByText('name')).toBeInTheDocument();
    expect(within(row('name')).getByText('string')).toBeInTheDocument();
    expect(within(row('name')).getByText('100%')).toBeInTheDocument();

    // A field on 1 of 3 documents is the thing this view exists to show.
    expect(within(row('nickname')).getByText('33%')).toBeInTheDocument();
  });

  it('shows both types of a mixed field', async () => {
    view();
    analyze();

    await screen.findByText('age');
    const ageRow = within(row('age'));
    expect(ageRow.getByText('number')).toBeInTheDocument();
    expect(ageRow.getByText('string')).toBeInTheDocument();
  });

  it('shows example values', async () => {
    view();
    analyze();
    expect(await screen.findByText(/alpha · beta · gamma/)).toBeInTheDocument();
  });

  it('reports the error instead of an empty table', async () => {
    invoke.mockImplementation(async () => { throw new Error('sample blew up'); });
    view();
    analyze();
    expect(await screen.findByText(/sample blew up/)).toBeInTheDocument();
  });

  it('says so when the collection is empty', async () => {
    invoke.mockImplementation(async () => []);
    view();
    analyze();
    expect(await screen.findByText(/No documents in the sample/)).toBeInTheDocument();
  });
});
