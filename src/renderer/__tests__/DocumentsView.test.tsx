// `src/test/setup.ts` loads the matchers at runtime, but it sits outside
// tsconfig.json's `src/renderer` include — this import is what types them.
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { forwardRef } from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

// Monaco needs a real layout engine and web workers, neither of which jsdom
// has (same call as AggregationBuilder.test.tsx). The add/edit-document editor
// is a controlled value/onChange box plus a couple of keyboard shortcuts — a
// textarea with the same props recorded as data attributes covers what this
// suite needs to assert, without pulling Monaco's DOM into the picture. Line
// numbering / folding themselves are Monaco's own behaviour now, not this
// app's — no longer this file's concern (see PIANO_TEST.md 7.24 for the
// manual check).
vi.mock('../components/MonacoJsonEditor', () => ({
  default: forwardRef(({ value, onChange, lineNumbers, wrap, className, onSave, onFindShortcut }: any, ref: any) => (
    <textarea
      data-testid="doc-json-editor"
      data-line-numbers={String(!!lineNumbers)}
      data-wrap={String(!!wrap)}
      className={className}
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.ctrlKey && e.key === 'Enter') onSave?.();
        if (e.ctrlKey && e.key === 'f') onFindShortcut?.();
      }}
    />
  )),
}));

import DocumentsView, { TABLE_ROW_ESTIMATE, TREE_ROW_ESTIMATE } from '../components/DocumentsView';

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
// How many documents the fake collection holds; a page is capped by the limit.
// Document 0 is always DOC, so the single-document tests read the same.
let docCount = 1;

const oidAt = (i: number) => (i === 0 ? OID : i.toString(16).padStart(24, '0'));
const docAt = (i: number) =>
  i === 0 ? DOC : { ...DOC, _id: { $oid: oidAt(i) }, name: `row-${i}` };

// args after the channel: (connectionId, db, collection, filter, limit, skip, sort, projection)
const invoke = vi.fn(async (channel: string, ...args: any[]) => {
  // The save dialog is native, so an export in a test always "cancels".
  if (channel.startsWith('export-')) return { canceled: true };
  if (channel !== 'get-documents') return null;
  // Apply the exclusion projection the way the real handler does, so a test can
  // tell a projected row apart from the stored document.
  const projection = args[7];
  const limit = Math.max(1, Number(args[4]) || 1);
  const docs = Array.from({ length: Math.min(docCount, limit) }, (_, i) => {
    const doc = docAt(i);
    return projection
      ? Object.fromEntries(Object.entries(doc).filter(([k]) => !(k in projection)))
      : doc;
  });
  return { docs, total: docTotal };
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  docTotal = 1;
  docCount = 1;
  (window as any).electron = { on: () => () => {}, invoke };
});

const view = () => render(<DocumentsView connectionId="c1" database="db" collection="col" />);

// Table mode gives a row that can simply be double-clicked to open the editor.
const openEdit = async (_container: HTMLElement) => {
  fireEvent.click(screen.getByRole('button', { name: /Table/ }));
  fireEvent.doubleClick(await screen.findByText('alpha'));
  await screen.findByRole('heading', { name: /^Edit —/ });
  return { ta: screen.getByTestId('doc-json-editor') as HTMLTextAreaElement };
};

describe('DocumentsView — JSON editor line numbers', () => {
  it('opens the editor with the document JSON and line numbers on by default', async () => {
    const { container } = view();
    const { ta } = await openEdit(container);

    expect(ta.value).toBe(EXPECTED_JSON);
    expect(ta).toHaveAttribute('data-line-numbers', 'true');
  });

  it('drops the toggle when the switch is turned off', async () => {
    const { container } = view();
    const { ta } = await openEdit(container);
    const header = screen.getByRole('heading', { name: /^Edit —/ }).parentElement!;
    const toggle = within(header).getByRole('checkbox', { name: /Line numbers/i }) as HTMLInputElement;

    expect(toggle).toBeChecked();
    fireEvent.click(toggle);

    expect(ta).toHaveAttribute('data-line-numbers', 'false');
    expect(toggle).not.toBeChecked();
  });

  it('persists the preference in localStorage and restores it on a remount', async () => {
    const first = view();
    const { ta } = await openEdit(first.container);
    const header = screen.getByRole('heading', { name: /^Edit —/ }).parentElement!;

    fireEvent.click(within(header).getByRole('checkbox', { name: /Line numbers/i }));
    expect(ta).toHaveAttribute('data-line-numbers', 'false');
    expect(localStorage.getItem('docLineNumbers')).toBe('false');

    first.unmount();
    const second = view();
    const reopened = await openEdit(second.container);
    expect(reopened.ta).toHaveAttribute('data-line-numbers', 'false');
    expect(within(screen.getByRole('heading', { name: /^Edit —/ }).parentElement!)
      .getByRole('checkbox', { name: /Line numbers/i })).not.toBeChecked();
  });

  it('applies the same switch to the add-document editor', async () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    await screen.findByRole('heading', { name: /Add document/ });

    const ta = screen.getByTestId('doc-json-editor');
    // `openAddDoc` seeds "{\n  \n}".
    expect(ta).toHaveValue('{\n  \n}');
    expect(ta).toHaveAttribute('data-line-numbers', 'true');

    const header = screen.getByRole('heading', { name: /Add document/ }).parentElement!;
    fireEvent.click(within(header).getByRole('checkbox'));
    expect(ta).toHaveAttribute('data-line-numbers', 'false');
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
    view();
    await showTable();
    expect(screen.queryByRole('columnheader', { name: /^nested/ })).toBeNull();

    fireEvent.doubleClick(screen.getByText('alpha'));
    await screen.findByRole('heading', { name: /^Edit —/ });

    expect(screen.getByTestId('doc-json-editor')).toHaveValue(EXPECTED_JSON);

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

/**
 * jsdom has no layout engine: every element reports a height of zero, which is
 * exactly the case the virtualizer degrades on — it renders every row. That
 * degrade path is what keeps the other tests in this file working, and the
 * first test below pins it. The rest need windowing to actually engage, so
 * `fakeLayout` hands jsdom a viewport, a row height and a working `scrollTop`.
 */
// The faked rows are exactly as tall as the component assumes an unmeasured row
// to be, so a filler standing in for rows that were never rendered is the same
// size as the rows themselves and the assertions can be exact.
const ROW_H = TABLE_ROW_ESTIMATE;
const VIEWPORT = 480;

function fakeLayout() {
  const scrollTops = new WeakMap<Element, number>();
  const saved = {
    clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')!,
    offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!,
    scrollTop: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!,
    rect: HTMLElement.prototype.getBoundingClientRect,
  };

  Object.defineProperty(Element.prototype, 'clientHeight', {
    configurable: true,
    get(this: Element) {
      const scroller = this.classList.contains('document-table')
        || this.classList.contains('tree-view-container');
      return scroller ? VIEWPORT : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains('doc-tree-row')) return TREE_ROW_ESTIMATE;
      return this.tagName === 'TR' ? ROW_H : 0;
    },
  });
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get(this: Element) { return scrollTops.get(this) ?? 0; },
    set(this: Element, v: number) { scrollTops.set(this, v); },
  });
  // The scroller is pinned at the top of the viewport; everything inside it
  // rides its scroll offset, which is how the hook works out where row 0 is.
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const scroller = this.closest('.document-table, .tree-view-container');
    const top = !scroller || scroller === this ? 0 : -(scroller as HTMLElement).scrollTop;
    return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON() {} } as DOMRect;
  };

  return () => {
    Object.defineProperty(Element.prototype, 'clientHeight', saved.clientHeight);
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', saved.offsetHeight);
    Object.defineProperty(Element.prototype, 'scrollTop', saved.scrollTop);
    HTMLElement.prototype.getBoundingClientRect = saved.rect;
  };
}

const PAGE = 500;

// Raising the limit is what makes a page big enough to need windowing, so the
// tests go through the toolbar input rather than seeding state behind it.
const runWithLimit = async (n: number) => {
  fireEvent.change(screen.getByTitle(/Documents per page/), { target: { value: String(n) } });
  fireEvent.click(screen.getAllByRole('button', { name: /Run/ })[0]);
  await waitFor(() => expect(lastLoad()[5]).toBe(n));
};

describe('DocumentsView — long result sets', () => {
  beforeEach(() => { docCount = 5000; docTotal = 5000; });

  const dataRows = (c: HTMLElement) => c.querySelectorAll('tbody tr:not(.doc-spacer-row)');
  const spacerPx = (c: HTMLElement) =>
    [...c.querySelectorAll('.doc-spacer-row td, .doc-spacer')]
      .reduce((sum, el) => sum + parseFloat((el as HTMLElement).style.height || '0'), 0);

  it('renders every row when there is no viewport to measure', async () => {
    // No `fakeLayout` here: this is plain jsdom, and a mounted-but-hidden tab
    // looks the same. Windowing against a zero height would mount nothing.
    const { container } = view();
    await showTable();
    await runWithLimit(PAGE);

    await waitFor(() => expect(dataRows(container)).toHaveLength(PAGE));
    expect(spacerPx(container)).toBe(0);
  });

  describe('with a measurable viewport', () => {
    let restore: () => void;
    beforeEach(() => { restore = fakeLayout(); window.confirm = () => true; });
    afterEach(() => restore());

    const bigTable = async () => {
      const rendered = view();
      await showTable();
      await runWithLimit(PAGE);
      await waitFor(() => expect(dataRows(rendered.container).length).toBeLessThan(PAGE));
      return rendered.container;
    };

    const scrollTo = (container: HTMLElement, y: number) => {
      const scroller = container.querySelector('.document-table, .tree-view-container') as HTMLElement;
      scroller.scrollTop = y;
      fireEvent.scroll(scroller);
    };

    it('keeps only the rows near the viewport in the DOM', async () => {
      const container = await bigTable();

      // 480px of viewport at 28px a row is 18 rows, plus the overscan.
      expect(dataRows(container).length).toBeGreaterThanOrEqual(18);
      expect(dataRows(container).length).toBeLessThan(50);
      expect(screen.getByText('alpha')).toBeInTheDocument();
      expect(screen.queryByText('row-400')).toBeNull();
    });

    it('stands in for the rows it left out, so the scrollbar still spans the page', async () => {
      const container = await bigTable();
      expect(spacerPx(container) + dataRows(container).length * ROW_H).toBe(PAGE * ROW_H);
    });

    it('swaps in the rows around a new scroll offset', async () => {
      const container = await bigTable();
      scrollTo(container, 200 * ROW_H);

      expect(screen.getByText('row-200')).toBeInTheDocument();
      expect(screen.queryByText('alpha')).toBeNull();
      expect(spacerPx(container) + dataRows(container).length * ROW_H).toBe(PAGE * ROW_H);
    });

    it('selects the whole page from the header checkbox, not just what is mounted', async () => {
      const container = await bigTable();
      expect(dataRows(container).length).toBeLessThan(PAGE);

      fireEvent.click(screen.getAllByRole('checkbox')[0]);
      expect(screen.getByText(`${PAGE} selected`)).toBeInTheDocument();
    });

    it('selects the whole page on Ctrl+A too', async () => {
      await bigTable();
      fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
      expect(screen.getByText(`${PAGE} selected`)).toBeInTheDocument();
    });

    it('shift-clicks a range across rows that were never mounted', async () => {
      const container = await bigTable();
      fireEvent.click(screen.getByText('row-5').closest('tr')!);
      expect(screen.getByText('1 selected')).toBeInTheDocument();

      scrollTo(container, 333 * ROW_H);
      // Row 5 is long gone from the DOM; the range is still 5…340 because
      // selection is keyed by the index into `documents`.
      expect(screen.queryByText('row-5')).toBeNull();
      fireEvent.click(screen.getByText('row-340').closest('tr')!, { shiftKey: true });

      expect(screen.getByText('336 selected')).toBeInTheDocument();
    });

    it('copies every selected document, mounted or not', async () => {
      const writeText = vi.fn();
      Object.assign(navigator, { clipboard: { writeText } });
      const container = await bigTable();

      fireEvent.click(screen.getAllByRole('checkbox')[0]);
      fireEvent.click(within(container.querySelector('.bulk-action-bar') as HTMLElement)
        .getByRole('button', { name: /Copy/ }));

      expect(JSON.parse(writeText.mock.calls[0][0])).toHaveLength(PAGE);
    });

    it('deletes every selected document, mounted or not', async () => {
      const container = await bigTable();
      fireEvent.click(screen.getAllByRole('checkbox')[0]);
      fireEvent.click(within(container.querySelector('.bulk-action-bar') as HTMLElement)
        .getByRole('button', { name: /Delete/ }));

      await waitFor(() =>
        expect(invoke.mock.calls.filter(c => c[0] === 'delete-document')).toHaveLength(PAGE));
    });

    it('windows the tree view as well, where rows are not all the same height', async () => {
      const { container } = view();
      await loaded();
      await runWithLimit(PAGE);
      await waitFor(() =>
        expect(container.querySelectorAll('.doc-tree-row').length).toBeLessThan(PAGE));

      expect(container.querySelectorAll('.doc-tree-row').length)
        .toBeGreaterThanOrEqual(Math.floor(VIEWPORT / TREE_ROW_ESTIMATE));
      fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
      expect(screen.getByText(`${PAGE} selected`)).toBeInTheDocument();
    });

    it('leaves a short page alone — no windowing, no fillers', async () => {
      docCount = 20; docTotal = 20;
      const { container } = view();
      await showTable();

      expect(dataRows(container)).toHaveLength(20);
      expect(container.querySelector('.document-table')).not.toHaveClass('windowed');
    });
  });
});
