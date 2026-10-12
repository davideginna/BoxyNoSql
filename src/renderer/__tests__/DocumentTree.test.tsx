import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DocumentTree from '../components/DocumentTree';

const ISO = '2022-04-26T16:18:05.988Z';
const DOC = { _id: { $oid: 'a'.repeat(24) }, insertDate: { $date: ISO } };

describe('DocumentTree — dates', () => {
  it('previews a date as ISODate in the collapsed header', () => {
    render(<DocumentTree doc={DOC} expandTick={0} expandTarget={false} />);
    expect(screen.getByText(`ISODate(${ISO})`)).toBeInTheDocument();
  });

  it('shows a date as an ISODate leaf, not as a nested $date key', () => {
    const { container } = render(<DocumentTree doc={DOC} expandTick={1} expandTarget />);
    expect(screen.getByText(`ISODate("${ISO}")`)).toBeInTheDocument();
    expect(container.textContent).not.toContain('$date');
  });

  it('drags a date into the filter as a date with its ISO value', () => {
    render(<DocumentTree doc={DOC} expandTick={1} expandTarget />);
    const leaf = screen.getByText(`ISODate("${ISO}")`).closest('.tree-leaf')!;
    const data: Record<string, string> = {};
    fireEvent.dragStart(leaf, { dataTransfer: { setData: (k: string, v: string) => { data[k] = v; }, effectAllowed: '' } });
    expect(JSON.parse(data['qb-field'])).toEqual({ field: 'insertDate', type: 'date', value: ISO });
  });
});

describe('DocumentTree — filter hooks', () => {
  const DOC2 = { _id: { $oid: 'a'.repeat(24) }, name: 'alpha', profile: { city: 'Rome' } };

  it('says a leaf can be dragged into the filter', () => {
    render(<DocumentTree doc={DOC2} expandTick={1} expandTarget />);
    const leaf = screen.getByText('"alpha"').closest('.tree-leaf')!;
    expect(leaf).toHaveAttribute('draggable', 'true');
    expect(leaf.getAttribute('title')).toMatch(/Drag name into the filter/);
  });

  it('reports the drag start and end, so the filter panel can open for the drop', () => {
    const onFieldDrag = vi.fn();
    render(<DocumentTree doc={DOC2} expandTick={1} expandTarget onFieldDrag={onFieldDrag} />);
    const leaf = screen.getByText('"alpha"').closest('.tree-leaf')!;
    fireEvent.dragStart(leaf, { dataTransfer: { setData: () => {}, effectAllowed: '' } });
    expect(onFieldDrag).toHaveBeenLastCalledWith(true);
    fireEvent.dragEnd(leaf);
    expect(onFieldDrag).toHaveBeenLastCalledWith(false);
  });

  it('the funnel adds a condition on that field and value, with the dotted path for nested fields', () => {
    const onAddFilter = vi.fn();
    render(<DocumentTree doc={DOC2} expandTick={1} expandTarget onAddFilter={onAddFilter} />);
    fireEvent.click(screen.getByText('profile')); // open the subdocument
    fireEvent.click(screen.getByRole('button', { name: 'Filter on profile.city' }));
    expect(onAddFilter).toHaveBeenCalledWith('profile.city', 'string', 'Rome');
    fireEvent.click(screen.getByRole('button', { name: 'Filter on name' }));
    expect(onAddFilter).toHaveBeenLastCalledWith('name', 'string', 'alpha');
  });

  it('shows no funnel when nobody listens', () => {
    render(<DocumentTree doc={DOC2} expandTick={1} expandTarget />);
    expect(screen.queryByRole('button', { name: /Filter on/ })).toBeNull();
  });
});

describe('DocumentTree — ObjectId info', () => {
  const OID = '6262a7cd1f2b3c4d5e6f7a8b';
  const DOC3 = { _id: { $oid: OID }, ref: { $oid: OID } };

  it('the collapsed header _id says when it was created', () => {
    render(<DocumentTree doc={DOC3} expandTick={0} expandTarget={false} />);
    expect(screen.getByText(OID).getAttribute('title')).toMatch(/Created: .*2022-04-22T13:04:13Z/);
  });

  it('an ObjectId field shows machine, pid and counter on hover', () => {
    render(<DocumentTree doc={DOC3} expandTick={1} expandTarget />);
    const title = screen.getAllByText(`ObjectId("${OID}")`)[0].getAttribute('title')!;
    expect(title).toContain('Machine: 0x1f2b3c');
    expect(title).toContain('PID: 0x4d5e');
    expect(title).toContain('Counter: 0x6f7a8b');
  });
});
