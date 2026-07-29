// `src/test/setup.ts` loads the matchers at runtime, but it sits outside
// tsconfig.json's `src/renderer` include — this import is what types them.
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConnectionModal from '../components/ConnectionModal';

// Every value below is unique inside the URI, so the fields can be found by
// display value — the form's labels are not associated with their inputs.
const URI = 'mongodb://user1:pw1@td-mongo01:27017/appdb?replicaSet=rs0&authSource=admin&retryWrites=true';
const CONNECTION = { id: '1', name: 'prod', uri: URI };

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).electron = { on: () => () => {}, invoke: vi.fn().mockResolvedValue(null) };
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

const editFields = () => fireEvent.click(screen.getByRole('button', { name: /Edit fields/i }));
const uriInput = () => screen.getByPlaceholderText('mongodb://localhost:27017') as HTMLInputElement;
// The breakdown is split across three sub-tabs, so most fields only exist in
// the DOM while their own tab is open.
const goTab = (name: 'Server' | 'Auth' | 'Options') =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('ConnectionModal — connection string breakdown', () => {
  it('shows the URI broken into fields, all read-only', () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);

    for (const value of ['td-mongo01', '27017', 'rs0']) {
      expect(screen.getByDisplayValue(value)).toHaveAttribute('readonly');
    }
    goTab('Auth');
    for (const value of ['user1', 'pw1', 'appdb', 'admin']) {
      expect(screen.getByDisplayValue(value)).toHaveAttribute('readonly');
    }
    // Selects say read-only by being disabled — there is no readonly on them.
    goTab('Options');
    expect(screen.getByLabelText('retryWrites')).toBeDisabled();
    expect(uriInput()).not.toHaveAttribute('readonly');
  });

  it('copies the whole connection string', async () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Copy$/i }));
    expect(writeText).toHaveBeenCalledWith(URI);
    await waitFor(() => expect(screen.getByRole('button', { name: /Copied/i })).toBeInTheDocument());
  });

  it('keeps the breakdown in sync while the string is still the source of truth', () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);

    fireEvent.change(uriInput(), { target: { value: 'mongodb://other-host:27018/other' } });
    expect(screen.getByDisplayValue('other-host')).toBeInTheDocument();
    expect(screen.getByDisplayValue('27018')).toBeInTheDocument();
    goTab('Auth');
    expect(screen.getByDisplayValue('other')).toBeInTheDocument();
  });

  it('leaves the URI untouched until a field is actually edited', () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);
    editFields();
    expect(uriInput().value).toBe(URI);
  });

  it('unlocks the fields and rebuilds the URI from them', () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);
    editFields();

    expect(screen.getByDisplayValue('td-mongo01')).not.toHaveAttribute('readonly');
    expect(uriInput()).toHaveAttribute('readonly');

    fireEvent.change(screen.getByDisplayValue('td-mongo01'), { target: { value: 'newhost' } });
    fireEvent.change(screen.getByDisplayValue('rs0'), { target: { value: 'rs1' } });

    expect(uriInput().value).toBe(
      'mongodb://user1:pw1@newhost:27017/appdb?replicaSet=rs1&authSource=admin&retryWrites=true'
    );
  });

  it('saves the URI rebuilt from the fields, not the one that was pasted', () => {
    const onSave = vi.fn();
    render(<ConnectionModal connection={CONNECTION} onSave={onSave} onClose={vi.fn()} />);
    editFields();
    goTab('Auth');

    fireEvent.change(screen.getByDisplayValue('pw1'), { target: { value: 'p@ss word' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].uri).toBe(
      'mongodb://user1:p%40ss%20word@td-mongo01:27017/appdb?replicaSet=rs0&authSource=admin&retryWrites=true'
    );
  });

  it('adds and removes hosts once unlocked', () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);
    editFields();

    fireEvent.click(screen.getByTitle('Add a host'));
    const hostInputs = screen.getAllByPlaceholderText('localhost');
    expect(hostInputs).toHaveLength(2);

    fireEvent.change(hostInputs[1], { target: { value: 'td-mongo02' } });
    fireEvent.change(screen.getAllByPlaceholderText('27017')[1], { target: { value: '27018' } });
    expect(uriInput().value).toContain('td-mongo01:27017,td-mongo02:27018');

    fireEvent.click(screen.getAllByTitle('Remove this host')[1]);
    expect(uriInput().value).not.toContain('td-mongo02');
  });

  it('drops the port when the scheme becomes mongodb+srv', () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);
    editFields();

    fireEvent.change(screen.getByLabelText('Scheme'), { target: { value: 'mongodb+srv' } });
    expect(uriInput().value).toBe(
      'mongodb+srv://user1:pw1@td-mongo01/appdb?replicaSet=rs0&authSource=admin&retryWrites=true'
    );
  });

  it('blocks Save and Test while the fields are invalid', () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);
    editFields();

    fireEvent.change(screen.getByDisplayValue('27017'), { target: { value: '99999' } });
    expect(screen.getByText(/Invalid port/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Save$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Test Connection/i })).toBeDisabled();
  });

  it('leaves the URI alone once the fields are locked again', () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);
    editFields();
    fireEvent.change(screen.getByDisplayValue('td-mongo01'), { target: { value: 'newhost' } });
    fireEvent.click(screen.getByRole('button', { name: /^Done$/i }));

    expect(uriInput()).not.toHaveAttribute('readonly');
    expect(uriInput().value).toContain('newhost');
  });

  it('says so when the string cannot be broken down', () => {
    render(<ConnectionModal connection={{ ...CONNECTION, uri: 'not-a-uri' }} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/nothing to break down/i)).toBeInTheDocument();
  });
});

describe('ConnectionModal — breakdown sub-tabs', () => {
  it('opens on Server and swaps the fields as you switch', () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByLabelText('Scheme')).toBeInTheDocument();
    expect(screen.queryByLabelText('Username')).toBeNull();
    expect(screen.queryByLabelText('retryWrites')).toBeNull();

    goTab('Auth');
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('authMechanism')).toBeInTheDocument();
    expect(screen.queryByLabelText('Scheme')).toBeNull();

    goTab('Options');
    expect(screen.getByLabelText('retryWrites')).toBeInTheDocument();
    expect(screen.getByLabelText('maxPoolSize')).toBeInTheDocument();
    expect(screen.queryByLabelText('Username')).toBeNull();

    goTab('Server');
    expect(screen.getByLabelText('Scheme')).toBeInTheDocument();
  });

  it('rebuilds the URI from a field edited on the Server tab', () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);
    editFields();

    fireEvent.change(screen.getByLabelText('appName'), { target: { value: 'BoxyNoSql' } });
    expect(uriInput().value).toBe(
      'mongodb://user1:pw1@td-mongo01:27017/appdb?replicaSet=rs0&authSource=admin&appName=BoxyNoSql&retryWrites=true'
    );
  });

  it('rebuilds the URI from a field edited on the Auth tab', () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);
    editFields();
    goTab('Auth');

    fireEvent.change(screen.getByLabelText('authMechanism'), { target: { value: 'SCRAM-SHA-256' } });
    expect(uriInput().value).toBe(
      'mongodb://user1:pw1@td-mongo01:27017/appdb?replicaSet=rs0&authSource=admin&authMechanism=SCRAM-SHA-256&retryWrites=true'
    );
  });

  it('rebuilds the URI from a field edited on the Options tab', () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);
    editFields();
    goTab('Options');

    fireEvent.change(screen.getByLabelText('maxPoolSize'), { target: { value: '50' } });
    expect(uriInput().value).toBe(
      'mongodb://user1:pw1@td-mongo01:27017/appdb?replicaSet=rs0&authSource=admin&retryWrites=true&maxPoolSize=50'
    );
  });

  it('treats an unset boolean as "not in the URI", not as false', () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);
    editFields();
    goTab('Options');
    const retryWrites = screen.getByLabelText('retryWrites');
    expect(retryWrites).toHaveValue('true');

    fireEvent.change(retryWrites, { target: { value: '' } });
    expect(uriInput().value).toBe(
      'mongodb://user1:pw1@td-mongo01:27017/appdb?replicaSet=rs0&authSource=admin'
    );

    fireEvent.change(retryWrites, { target: { value: 'false' } });
    expect(uriInput().value).toBe(
      'mongodb://user1:pw1@td-mongo01:27017/appdb?replicaSet=rs0&authSource=admin&retryWrites=false'
    );
  });

  it('leaves only the unnamed parameters in the raw box, and hides it when there are none', () => {
    const { unmount } = render(
      <ConnectionModal
        connection={{ ...CONNECTION, uri: 'mongodb://h/?retryWrites=true&maxStalenessSeconds=90' }}
        onSave={vi.fn()} onClose={vi.fn()}
      />
    );
    goTab('Options');
    expect(screen.getByLabelText('retryWrites')).toHaveValue('true');
    expect(screen.getByLabelText('Other options')).toHaveValue('maxStalenessSeconds=90');
    unmount();

    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);
    goTab('Options');
    expect(screen.queryByLabelText('Other options')).toBeNull();
    // Still reachable once unlocked — that is the only way to add a raw option.
    editFields();
    expect(screen.getByLabelText('Other options')).toBeInTheDocument();
  });

  it('keeps the error visible, and flags its tab, while you are on another one', () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);
    editFields();
    fireEvent.change(screen.getByDisplayValue('27017'), { target: { value: '99999' } });

    goTab('Options');
    expect(screen.queryByDisplayValue('99999')).toBeNull();
    expect(screen.getByText(/Invalid port/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('see the Server tab');
    expect(screen.getByRole('button', { name: 'Server' })).toHaveClass('has-error');
    expect(screen.getByRole('button', { name: /^Save$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Test Connection/i })).toBeDisabled();
  });

  it('flags the Options tab for an option error raised from another tab', () => {
    render(<ConnectionModal connection={CONNECTION} onSave={vi.fn()} onClose={vi.fn()} />);
    editFields();
    goTab('Options');
    fireEvent.change(screen.getByLabelText('serverSelectionTimeoutMS'), { target: { value: '-5' } });

    goTab('Server');
    expect(screen.getByText(/non-negative integer/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Options' })).toHaveClass('has-error');
    expect(screen.getByRole('button', { name: /^Save$/i })).toBeDisabled();
  });
});
