// `src/test/setup.ts` loads the matchers at runtime, but it sits outside
// tsconfig.json's `src/renderer` include — this import is what types them.
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DocumentsView from '../components/DocumentsView';

const OID = 'a'.repeat(24);
const DOC = { _id: { $oid: OID }, name: 'alpha', nested: { a: 1, b: 2 } };

// What `prettyDoc` produces for DOC — 8 lines, no line numbers anywhere in it.
const EXPECTED_JSON = [
  '{',
  `  "_id": ObjectId("${OID}"),`,
  '  "name": "alpha",',
  '  "nested": {',
  '    "a": 1,',
  '    "b": 2',
  '  }',
  '}',
].join('\n');

const invoke = vi.fn(async (channel: string) =>
  channel === 'get-documents' ? { docs: [DOC], total: 1 } : null
);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  (window as any).electron = { on: () => () => {}, invoke };
});

const view = () => render(<DocumentsView connectionId="c1" database="db" collection="col" />);

// Table mode gives a row that can simply be double-clicked to open the editor.
const openEdit = async (container: HTMLElement) => {
  fireEvent.click(screen.getByRole('button', { name: /Table/ }));
  fireEvent.doubleClick(await screen.findByText('alpha'));
  await screen.findByRole('heading', { name: /^Edit —/ });
  return {
    ta: container.querySelector('.json-editor-ta') as HTMLTextAreaElement,
    gutter: () => container.querySelector('.json-editor-gutter') as HTMLPreElement | null,
  };
};

const numbers = (n: number) => Array.from({ length: n }, (_, i) => i + 1).join('\n') + '\n';

describe('DocumentsView — JSON editor line numbers', () => {
  it('shows the gutter by default, with one number per line', async () => {
    const { container } = view();
    const { ta, gutter } = await openEdit(container);

    expect(ta.value).toBe(EXPECTED_JSON);
    expect(gutter()).toHaveTextContent(/^1 2 3 4 5 6 7 8$/);
    expect(gutter()!.textContent).toBe(numbers(8));
  });

  it('keeps the numbers out of the editable value and out of the textarea subtree', async () => {
    const { container } = view();
    const { ta, gutter } = await openEdit(container);

    // The gutter is a sibling of the textarea, never a descendant of it, so a
    // selection or a copy inside the field cannot pick the numbers up.
    expect(ta.contains(gutter())).toBe(false);
    expect(ta.value).not.toMatch(/^\s*\d+\s/m);
    expect(gutter()).toHaveAttribute('aria-hidden', 'true');
  });

  it('renumbers as lines are added and removed', async () => {
    const { container } = view();
    const { ta, gutter } = await openEdit(container);

    fireEvent.change(ta, { target: { value: 'a\nb\nc' } });
    expect(gutter()!.textContent).toBe(numbers(3));

    fireEvent.change(ta, { target: { value: 'a' } });
    expect(gutter()!.textContent).toBe(numbers(1));
  });

  it('drops the gutter when the switch is turned off', async () => {
    const { container } = view();
    const { gutter } = await openEdit(container);
    const header = screen.getByRole('heading', { name: /^Edit —/ }).parentElement!;
    const toggle = within(header).getByRole('checkbox') as HTMLInputElement;

    expect(toggle).toBeChecked();
    fireEvent.click(toggle);

    expect(gutter()).toBeNull();
    expect(toggle).not.toBeChecked();
  });

  it('persists the preference in localStorage and restores it on a remount', async () => {
    const first = view();
    const { gutter } = await openEdit(first.container);
    const header = screen.getByRole('heading', { name: /^Edit —/ }).parentElement!;

    fireEvent.click(within(header).getByRole('checkbox'));
    expect(gutter()).toBeNull();
    expect(localStorage.getItem('docLineNumbers')).toBe('false');

    first.unmount();
    const second = view();
    const reopened = await openEdit(second.container);
    expect(reopened.gutter()).toBeNull();
    expect(within(screen.getByRole('heading', { name: /^Edit —/ }).parentElement!)
      .getByRole('checkbox')).not.toBeChecked();
  });

  it('applies the same switch to the add-document editor', async () => {
    const { container } = view();
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    await screen.findByRole('heading', { name: /Add document/ });

    const gutter = () => container.querySelector('.json-editor-gutter');
    // `openAddDoc` seeds "{\n  \n}" — three lines.
    expect(gutter()!.textContent).toBe(numbers(3));

    const header = screen.getByRole('heading', { name: /Add document/ }).parentElement!;
    fireEvent.click(within(header).getByRole('checkbox'));
    expect(gutter()).toBeNull();
    expect(localStorage.getItem('docLineNumbers')).toBe('false');
  });
});
