// `src/test/setup.ts` loads the matchers at runtime, but it sits outside
// tsconfig.json's `src/renderer` include — this import is what types them.
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
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

// Mutable so a test can pretend the collection is bigger than one page.
let docTotal = 1;

// args after the channel: (connectionId, db, collection, filter, limit, skip, sort, projection)
const invoke = vi.fn(async (channel: string, ...args: any[]) => {
  // The save dialog is native, so an export in a test always "cancels".
  if (channel.startsWith('export-')) return { canceled: true };
  if (channel !== 'get-documents') return null;
  // Apply the exclusion projection the way the real handler does, so a test can
  // tell a projected row apart from the stored document.
  const projection = args[7];
  const doc = projection
    ? Object.fromEntries(Object.entries(DOC).filter(([k]) => !(k in projection)))
    : DOC;
  return { docs: [doc], total: docTotal };
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  docTotal = 1;
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
    const toggle = within(header).getByRole('checkbox', { name: /Line numbers/i }) as HTMLInputElement;

    expect(toggle).toBeChecked();
    fireEvent.click(toggle);

    expect(gutter()).toBeNull();
    expect(toggle).not.toBeChecked();
  });

  it('persists the preference in localStorage and restores it on a remount', async () => {
    const first = view();
    const { gutter } = await openEdit(first.container);
    const header = screen.getByRole('heading', { name: /^Edit —/ }).parentElement!;

    fireEvent.click(within(header).getByRole('checkbox', { name: /Line numbers/i }));
    expect(gutter()).toBeNull();
    expect(localStorage.getItem('docLineNumbers')).toBe('false');

    first.unmount();
    const second = view();
    const reopened = await openEdit(second.container);
    expect(reopened.gutter()).toBeNull();
    expect(within(screen.getByRole('heading', { name: /^Edit —/ }).parentElement!)
      .getByRole('checkbox', { name: /Line numbers/i })).not.toBeChecked();
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

// `get-documents` args: (channel, connectionId, db, collection, filter, limit, skip, sort, projection)
const lastLoad = (): any[] => invoke.mock.calls.filter(c => c[0] === 'get-documents').at(-1)!;
const lastSort = () => lastLoad()[7];
const lastProjection = () => lastLoad()[8];
const lastSkip = () => lastLoad()[6];

// The default view is the tree, which renders values quoted.
const loaded = () => screen.findByText(/alpha/);

const showTable = async () => {
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: /Table/ }));
  return await screen.findByRole('columnheader', { name: /^name/ });
};

describe('DocumentsView — column sort', () => {
  it('starts unsorted, so no sort reaches the server', async () => {
    view();
    await loaded();
    expect(lastSort()).toBeNull();
  });

  it('cycles a column ascending → descending → unsorted', async () => {
    view();
    const th = await showTable();

    fireEvent.click(th);
    expect(lastSort()).toEqual({ name: 1 });

    fireEvent.click(th);
    expect(lastSort()).toEqual({ name: -1 });

    fireEvent.click(th);
    expect(lastSort()).toBeNull();
  });

  it('adds a second key on shift-click and keeps the precedence order', async () => {
    view();
    const nameTh = await showTable();
    fireEvent.click(nameTh);
    fireEvent.click(screen.getByRole('columnheader', { name: /^_id/ }), { shiftKey: true });

    expect(Object.entries(lastSort())).toEqual([['name', 1], ['_id', 1]]);
  });

  it('goes back to the first page — a re-sorted result is a different page', async () => {
    docTotal = 100;
    view();
    const th = await showTable();
    fireEvent.click(screen.getByRole('button', { name: '›' }));
    await waitFor(() => expect(lastSkip()).toBe(20));

    fireEvent.click(th);
    expect(lastSkip()).toBe(0);
  });

  it('drops a key from the toolbar chip', async () => {
    view();
    const th = await showTable();
    fireEvent.click(th);

    fireEvent.click(screen.getByRole('button', { name: /^name/ }));
    expect(lastSort()).toBeNull();
  });
});

describe('DocumentsView — field visibility', () => {
  const openFieldsMenu = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Fields/ }));
    return await screen.findByText(/shift-click a column header to add a second key/);
  };

  it('hides a field with an exclusion projection and remembers it per collection', async () => {
    const first = view();
    await loaded();
    await openFieldsMenu();

    fireEvent.click(screen.getByRole('checkbox', { name: 'name' }));
    expect(lastProjection()).toEqual({ name: 0 });
    expect(JSON.parse(localStorage.getItem('hiddenFields')!)).toEqual({ 'c1|db|col': ['name'] });

    // Remount: the saved projection is applied on the very first load.
    first.unmount();
    vi.clearAllMocks();
    view();
    await waitFor(() => expect(lastProjection()).toEqual({ name: 0 }));
  });

  it('keeps a hidden field listed so it can be brought back', async () => {
    localStorage.setItem('hiddenFields', JSON.stringify({ 'c1|db|col': ['gone'] }));
    view();
    await loaded();
    await openFieldsMenu();

    const box = screen.getByRole('checkbox', { name: 'gone' }) as HTMLInputElement;
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(lastProjection()).toBeNull();
  });

  it('refuses to hide _id — edit and delete key off it', async () => {
    view();
    await loaded();
    await openFieldsMenu();

    expect(screen.getByRole('checkbox', { name: '_id' })).toBeDisabled();
  });

  it('re-reads the whole document before editing, so a save cannot drop hidden fields', async () => {
    localStorage.setItem('hiddenFields', JSON.stringify({ 'c1|db|col': ['nested'] }));
    const { container } = view();
    await showTable();
    expect(screen.queryByRole('columnheader', { name: /^nested/ })).toBeNull();

    fireEvent.doubleClick(screen.getByText('alpha'));
    await screen.findByRole('heading', { name: /^Edit —/ });

    const ta = container.querySelector('.json-editor-ta') as HTMLTextAreaElement;
    expect(ta.value).toBe(EXPECTED_JSON);

    const reread = lastLoad();
    expect(reread[4]).toEqual({ _id: { $oid: OID } });
    expect(reread[8]).toBeNull();
  });

  it('sorts from the popover, which is the only sort UI in tree mode', async () => {
    view();
    await loaded();
    await openFieldsMenu();

    const row = screen.getByRole('checkbox', { name: 'name' }).closest('.fields-menu-row')!;
    const desc = within(row as HTMLElement).getByRole('button', { name: /DESC/ });
    // The button says which way it sorts, and the tooltip says what that means.
    expect(desc).toHaveAttribute('title', expect.stringContaining('newest first'));

    fireEvent.click(desc);
    expect(lastSort()).toEqual({ name: -1 });

    // Clicking the same direction again clears it.
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /DESC/ }));
    expect(lastSort()).toBeNull();
  });
});

describe('DocumentsView — query history', () => {
  const openHistory = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /History/ }));
    return await screen.findByText('Recent');
  };

  const seedEntry = (name?: string) => localStorage.setItem('queryHistory', JSON.stringify([{
    id: 'e1',
    kind: 'filter',
    scope: 'c1|db|col',
    body: JSON.stringify({ matchAll: true, conditions: [{ field: 'name', op: 'eq', value: 'alpha', type: 'string' }] }),
    label: '{"name":{"$eq":"alpha"}}',
    ...(name ? { name } : {}),
    at: Date.now(),
  }]));

  it('records the filter that was run, and not an empty one', async () => {
    view();
    await loaded();

    // Reset runs an empty filter — that is what the Reset button is for.
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }));
    await openHistory();
    expect(screen.getByText(/Nothing run yet/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    // Add a condition through the query builder, then run it.
    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));
    fireEvent.doubleClick(screen.getByText(/Drag field here/));
    fireEvent.click(screen.getAllByRole('button', { name: /Run/ })[0]);

    await openHistory();
    expect(screen.queryByText(/Nothing run yet/)).toBeNull();
  });

  it('re-runs a recalled filter and repopulates the builder', async () => {
    seedEntry();
    view();
    await loaded();
    await openHistory();

    fireEvent.click(screen.getByTitle('{"name":{"$eq":"alpha"}}'));

    await waitFor(() => expect(lastLoad()[4]).toEqual({ name: { $eq: 'alpha' } }));
    // The builder is reopened with the condition, ready to be tweaked.
    expect(screen.getByDisplayValue('alpha')).toBeInTheDocument();
  });

  it('lists a saved query by name, apart from the history', async () => {
    seedEntry('Alphas only');
    view();
    await loaded();
    await openHistory();

    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Alphas only')).toBeInTheDocument();
    expect(screen.getByText(/Nothing run yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /History \(1★\)/ })).toBeInTheDocument();
  });
});


describe('DocumentsView — export', () => {
  const lastExport = () => invoke.mock.calls.filter(c => c[0] === 'export-documents').at(-1)![1] as any;

  const openExport = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Export/ }));
    return await screen.findAllByRole('button', { name: 'NDJSON' });
  };

  it('exports the current view with its filter, sort and hidden fields', async () => {
    localStorage.setItem('hiddenFields', JSON.stringify({ 'c1|db|col': ['nested'] }));
    view();
    const th = await showTable();
    fireEvent.click(th);

    // First group is the current view, second is the whole collection.
    fireEvent.click((await openExport())[0]);

    expect(lastExport()).toMatchObject({
      connectionId: 'c1', dbName: 'db', collection: 'col', format: 'ndjson',
      sort: { name: 1 }, projection: { nested: 0 }, filtered: false,
    });
  });

  it('exports the whole collection ignoring filter, sort and projection', async () => {
    localStorage.setItem('hiddenFields', JSON.stringify({ 'c1|db|col': ['nested'] }));
    view();
    const th = await showTable();
    fireEvent.click(th);

    fireEvent.click((await openExport())[1]);

    expect(lastExport()).toMatchObject({ format: 'ndjson', filter: {}, sort: null, projection: null });
  });

  it('offers all three formats for both scopes', async () => {
    view();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));

    for (const f of ['JSON', 'NDJSON', 'CSV']) {
      expect(await screen.findAllByRole('button', { name: f })).toHaveLength(2);
    }
  });
});

describe('DocumentsView — read-only connection', () => {
  const readOnlyView = () =>
    render(<DocumentsView connectionId="c1" database="db" collection="col" readOnly />);

  it('offers nothing that writes', async () => {
    readOnlyView();
    await loaded();

    expect(screen.getByRole('button', { name: /Add/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Paste/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Export/ })).toBeEnabled();
  });

  it('says why the button is dead', async () => {
    readOnlyView();
    await loaded();
    expect(screen.getByRole('button', { name: /Add/ })).toHaveAttribute('title', 'This connection is read-only');
  });

  it('ignores Ctrl+D too — the shortcut is the same action', async () => {
    readOnlyView();
    await loaded();

    fireEvent.keyDown(window, { key: 'd', ctrlKey: true });
    expect(screen.queryByRole('heading', { name: /Add document/ })).toBeNull();
  });

  it('leaves the writes alone on a normal connection', async () => {
    view();
    await loaded();
    expect(screen.getByRole('button', { name: /Add/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Paste/ })).toBeEnabled();
  });
});

describe('DocumentsView — bulk field edit', () => {
  // `showConfirm` falls back to window.confirm with no DialogModal mounted.
  beforeEach(() => { window.confirm = () => true; });

  const selectAll = async () => {
    await showTable();
    fireEvent.click(screen.getAllByRole('checkbox')[0]);   // header checkbox
    return screen.getByRole('button', { name: /Edit field/ });
  };

  // Scoped to the modal: the view behind it has its own selects and inputs.
  const openBulkEdit = async () => {
    fireEvent.click(await selectAll());
    const heading = await screen.findByRole('heading', { name: /Edit field on 1 document/ });
    return within(heading.closest('.modal') as HTMLElement);
  };

  it('offers the button only while something is selected', async () => {
    view();
    await showTable();
    expect(screen.queryByRole('button', { name: /Edit field/ })).toBeNull();

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(screen.getByRole('button', { name: /Edit field/ })).toBeInTheDocument();
  });

  it('shows the update document before it runs', async () => {
    view();
    const modal = await openBulkEdit();

    fireEvent.change(modal.getByPlaceholderText('field name'), { target: { value: 'status' } });
    fireEvent.change(modal.getByPlaceholderText('value'), { target: { value: 'paid' } });

    expect(modal.getByText(/"\$set"/)).toBeInTheDocument();
    expect(modal.getByText(/"paid"/)).toBeInTheDocument();
  });

  it('sends the update for the selected ids', async () => {
    view();
    const modal = await openBulkEdit();

    fireEvent.change(modal.getByPlaceholderText('field name'), { target: { value: 'age' } });
    // The field input is a combobox too (it has a datalist), so pick the type
    // select by what it currently shows.
    fireEvent.change(modal.getByDisplayValue('String'), { target: { value: 'number' } });
    fireEvent.change(modal.getByPlaceholderText('value'), { target: { value: '30' } });
    fireEvent.click(modal.getByRole('button', { name: /Apply to 1 document/ }));

    await waitFor(() => expect(invoke.mock.calls.some(c => c[0] === 'bulk-update-documents')).toBe(true));
    const call = invoke.mock.calls.find(c => c[0] === 'bulk-update-documents')!;
    expect(call.slice(1)).toEqual(['c1', 'db', 'col', [OID], { $set: { age: 30 } }]);
  });

  it('blocks the apply button while the form is not valid', async () => {
    view();
    const modal = await openBulkEdit();

    // No field name yet.
    expect(modal.getByRole('button', { name: /Apply to/ })).toBeDisabled();
    expect(modal.getByText(/Choose a field/)).toBeInTheDocument();

    fireEvent.change(modal.getByPlaceholderText('field name'), { target: { value: '_id' } });
    expect(modal.getByText(/`_id` cannot be changed/)).toBeInTheDocument();
    expect(modal.getByRole('button', { name: /Apply to/ })).toBeDisabled();
  });

  it('switches to unset without asking for a value', async () => {
    view();
    const modal = await openBulkEdit();

    fireEvent.change(modal.getByPlaceholderText('field name'), { target: { value: 'temp' } });
    fireEvent.click(modal.getByRole('button', { name: 'Unset' }));

    expect(modal.queryByPlaceholderText('value')).toBeNull();
    expect(modal.getByText(/"\$unset"/)).toBeInTheDocument();
  });

  it('is disabled on a read-only connection', async () => {
    render(<DocumentsView connectionId="c1" database="db" collection="col" readOnly />);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /Table/ }));
    fireEvent.click((await screen.findAllByRole('checkbox'))[0]);

    expect(screen.getByRole('button', { name: /Edit field/ })).toBeDisabled();
  });
});
