// Two-way split of a MongoDB connection string into the fields the connection
// form shows (user, password, hosts, port, replica set, the options that
// matter…) and back.
//
// The connection form keeps the URI as the stored value — this is only the lens
// on top of it: `parseMongoUri` feeds the read-only breakdown, and once the user
// unlocks the fields `buildMongoUri` regenerates the URI from them, so the
// fields become the source of truth and the pasted string stops mattering.
//
// Deliberately hand-rolled rather than `new URL()`: URL mangles the multi-host
// authority of a replica-set URI (`host1:27017,host2:27017`) and refuses the
// `mongodb+srv` scheme in some engines.
//
// The golden rule of this module is **nothing is lost**: any query parameter
// that has no field of its own — or whose value a field could not display
// without mangling it — survives verbatim in `options`, the residual raw
// string the form shows as "Other options".

export interface MongoHost {
  host: string;
  /** Empty when the URI omits it (always empty for `mongodb+srv`). */
  port: string;
}

/** Which sub-tab of the breakdown a field belongs to. */
export type OptionGroup = 'server' | 'auth' | 'options';

/** How the field is edited, and therefore which values it can hold. */
export type OptionKind = 'text' | 'number' | 'bool' | 'enum';

/**
 * Three-state boolean. `''` means "absent from the URI", which is **not** the
 * same as `'false'`: the driver applies its own default only while the option
 * is missing, so an unset field must never write `x=false` into the URI.
 * `buildMongoUri` emits nothing for `''`, which is what makes it round-trip.
 */
export type TriState = '' | 'true' | 'false';

/**
 * Query parameters with a field of their own. The key doubles as the canonical
 * URI parameter name (the driver matches option names case-insensitively, and
 * so do we — but we write them back in this spelling).
 */
export type OptionKey =
  | 'replicaSet' | 'authSource' | 'authMechanism'
  | 'directConnection' | 'appName' | 'compressors'
  | 'readPreference' | 'readConcernLevel' | 'w' | 'journal'
  | 'retryWrites' | 'retryReads'
  | 'connectTimeoutMS' | 'socketTimeoutMS' | 'serverSelectionTimeoutMS'
  | 'maxPoolSize' | 'minPoolSize';

export interface UriOptionSpec {
  /** Also the URI parameter name. */
  key: OptionKey;
  /** Query options are labelled with their exact URI name — the panel builds a
      connection string, so the label is what you look up in the docs. */
  label: string;
  group: OptionGroup;
  kind: OptionKind;
  /** Values offered for `kind: 'enum'`, in their canonical casing. */
  values?: readonly string[];
  /**
   * Hint, never a plausible value: the fields are read-only until unlocked and
   * a placeholder that looks like a value reads as one. Defaults to `—`.
   */
  placeholder?: string;
}

// Order matters twice: it is the order the options are written back into the
// URI, and (per group) the order the form lays them out. `replicaSet` and
// `authSource` stay first so a URI written by an older build comes back byte
// for byte.
export const URI_OPTIONS: readonly UriOptionSpec[] = [
  { key: 'replicaSet', label: 'replicaSet', group: 'server', kind: 'text' },
  { key: 'authSource', label: 'authSource', group: 'auth', kind: 'text' },
  {
    key: 'authMechanism', label: 'authMechanism', group: 'auth', kind: 'enum',
    values: ['SCRAM-SHA-1', 'SCRAM-SHA-256', 'MONGODB-X509', 'GSSAPI', 'PLAIN', 'MONGODB-AWS', 'MONGODB-OIDC'],
  },
  { key: 'directConnection', label: 'directConnection', group: 'server', kind: 'bool' },
  { key: 'appName', label: 'appName', group: 'server', kind: 'text' },
  { key: 'compressors', label: 'compressors', group: 'server', kind: 'text', placeholder: 'e.g. snappy,zlib,zstd' },
  {
    key: 'readPreference', label: 'readPreference', group: 'options', kind: 'enum',
    values: ['primary', 'primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'],
  },
  {
    key: 'readConcernLevel', label: 'readConcernLevel', group: 'options', kind: 'enum',
    values: ['local', 'majority', 'linearizable', 'available', 'snapshot'],
  },
  // `w` is a number *or* a name ("majority", a tag set), so it stays free text.
  { key: 'w', label: 'w (write concern)', group: 'options', kind: 'text', placeholder: 'e.g. majority or 2' },
  { key: 'journal', label: 'journal', group: 'options', kind: 'bool' },
  { key: 'retryWrites', label: 'retryWrites', group: 'options', kind: 'bool' },
  { key: 'retryReads', label: 'retryReads', group: 'options', kind: 'bool' },
  // Placeholders quote the driver default, which is what "left empty" means.
  { key: 'connectTimeoutMS', label: 'connectTimeoutMS', group: 'options', kind: 'number', placeholder: 'default 30000' },
  { key: 'socketTimeoutMS', label: 'socketTimeoutMS', group: 'options', kind: 'number', placeholder: 'default 0 (none)' },
  { key: 'serverSelectionTimeoutMS', label: 'serverSelectionTimeoutMS', group: 'options', kind: 'number', placeholder: 'default 30000' },
  { key: 'maxPoolSize', label: 'maxPoolSize', group: 'options', kind: 'number', placeholder: 'default 100' },
  { key: 'minPoolSize', label: 'minPoolSize', group: 'options', kind: 'number', placeholder: 'default 0' },
];

export const OPTION_SPEC = Object.fromEntries(URI_OPTIONS.map(o => [o.key, o])) as Record<OptionKey, UriOptionSpec>;

const OPTION_BY_NAME = new Map<string, UriOptionSpec>(URI_OPTIONS.map(o => [o.key.toLowerCase(), o]));

const emptyOptions = () =>
  Object.fromEntries(URI_OPTIONS.map(o => [o.key, ''])) as Record<OptionKey, string>;

export interface MongoUriParts extends Record<OptionKey, string> {
  scheme: 'mongodb' | 'mongodb+srv';
  username: string;
  password: string;
  hosts: MongoHost[];
  /** Database from the URI path — not the form's "default database". */
  database: string;
  /** Every query param without a field of its own, kept verbatim as `k=v&k=v`. */
  options: string;
}

export const EMPTY_PARTS: MongoUriParts = {
  scheme: 'mongodb', username: '', password: '', hosts: [{ host: '', port: '' }],
  database: '', ...emptyOptions(), options: '',
};

// A URI with a malformed escape (`%zz`) is still worth showing — fall back to
// the raw text instead of throwing the whole breakdown away.
function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// `host:port`, `host`, `[::1]:27017` — the bracket form has to be handled
// separately or the IPv6 colons get read as a port separator.
function parseHost(raw: string): MongoHost {
  const text = raw.trim();
  if (text.startsWith('[')) {
    const end = text.indexOf(']');
    if (end !== -1) {
      const rest = text.slice(end + 1);
      return { host: text.slice(0, end + 1), port: rest.startsWith(':') ? rest.slice(1) : '' };
    }
  }
  const colon = text.lastIndexOf(':');
  if (colon === -1) return { host: text, port: '' };
  return { host: text.slice(0, colon), port: text.slice(colon + 1) };
}

/**
 * The value the named field should hold, or `null` when the field cannot
 * represent it (`retryWrites=maybe`, `maxPoolSize=lots`). Unrepresentable
 * values go back to the residual string rather than being dropped or silently
 * rewritten by a control that cannot show them.
 */
function canonicalValue(spec: UriOptionSpec, raw: string): string | null {
  const value = decode(raw).trim();
  if (spec.kind === 'bool') {
    const lower = value.toLowerCase();
    return lower === 'true' || lower === 'false' ? lower : null;
  }
  if (spec.kind === 'number') return /^\d+$/.test(value) ? value : null;
  if (spec.kind === 'enum') {
    // Unknown values (a mechanism a newer driver added) are kept verbatim; the
    // form shows them as an extra entry rather than dropping them.
    return spec.values?.find(v => v.toLowerCase() === value.toLowerCase()) ?? value;
  }
  return value;
}

export function parseMongoUri(uri: string): MongoUriParts | null {
  const match = /^(mongodb\+srv|mongodb):\/\//i.exec(uri.trim());
  if (!match) return null;

  const scheme = match[1].toLowerCase() as MongoUriParts['scheme'];
  const rest = uri.trim().slice(match[0].length);

  // The authority ends at the first `/` or `?`; anything the password needs to
  // carry beyond that has to be percent-encoded, so a plain search is safe.
  const cut = rest.search(/[/?]/);
  const authority = cut === -1 ? rest : rest.slice(0, cut);
  const tail = cut === -1 ? '' : rest.slice(cut);

  let username = '';
  let password = '';
  let hostPart = authority;
  const at = authority.lastIndexOf('@');
  if (at !== -1) {
    const credentials = authority.slice(0, at);
    hostPart = authority.slice(at + 1);
    const colon = credentials.indexOf(':');
    username = decode(colon === -1 ? credentials : credentials.slice(0, colon));
    password = colon === -1 ? '' : decode(credentials.slice(colon + 1));
  }

  const hosts = hostPart.split(',').filter(h => h.trim()).map(parseHost);

  const qIdx = tail.indexOf('?');
  const path = (qIdx === -1 ? tail : tail.slice(0, qIdx)).replace(/^\//, '');
  const query = qIdx === -1 ? '' : tail.slice(qIdx + 1);

  const named = emptyOptions();
  const taken = new Set<OptionKey>();
  const others: string[] = [];
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    const value = eq === -1 ? '' : pair.slice(eq + 1);
    const spec = OPTION_BY_NAME.get(decode(key).trim().toLowerCase());
    // Three reasons a known parameter still goes to the residual string, all of
    // them "the field could not hold it without changing what the URI says":
    // an empty value (a field cannot tell blank from absent), a duplicate (only
    // one can win), or a value the control cannot display.
    const canonical = spec && value !== '' && !taken.has(spec.key)
      ? canonicalValue(spec, value)
      : null;
    if (spec && canonical !== null) {
      named[spec.key] = canonical;
      taken.add(spec.key);
    } else {
      others.push(pair);
    }
  }

  return {
    scheme, username, password,
    hosts: hosts.length ? hosts : [{ host: '', port: '' }],
    database: decode(path),
    ...named,
    options: others.join('&'),
  };
}

export function buildMongoUri(parts: MongoUriParts): string {
  const srv = parts.scheme === 'mongodb+srv';
  let out = `${parts.scheme}://`;

  if (parts.username.trim()) {
    out += encodeURIComponent(parts.username.trim());
    if (parts.password) out += `:${encodeURIComponent(parts.password)}`;
    out += '@';
  }

  out += parts.hosts
    .map(h => ({ host: h.host.trim(), port: h.port.trim() }))
    .filter(h => h.host)
    // `mongodb+srv` resolves the port from DNS and the driver rejects an explicit one.
    .map(h => (h.port && !srv ? `${h.host}:${h.port}` : h.host))
    .join(',');

  const query: string[] = [];
  // An empty field means "not in the URI" — including the three-state booleans,
  // where writing `retryWrites=false` for an untouched field would override the
  // driver default the user never asked to change.
  for (const spec of URI_OPTIONS) {
    const value = parts[spec.key].trim();
    // The comma is a legal query character and the natural separator of
    // `compressors` / tag lists — encoding it would round-trip as `%2C` and
    // make an untouched URI look edited.
    if (value) query.push(`${spec.key}=${encodeURIComponent(value).replace(/%2C/g, ',')}`);
  }
  const extra = parts.options.trim().replace(/^[?&]+/, '');
  if (extra) query.push(extra);

  const database = parts.database.trim();
  // The driver needs the slash before the query even when there is no database:
  // `mongodb://host?replicaSet=rs` is rejected, `mongodb://host/?replicaSet=rs` is not.
  if (database) out += `/${encodeURIComponent(database)}`;
  else if (query.length) out += '/';
  if (query.length) out += `?${query.join('&')}`;

  return out;
}

/** A blocked save, plus the sub-tab the offending field sits on. */
export interface PartsProblem {
  message: string;
  group: OptionGroup;
}

/**
 * What blocks a save while the fields are the source of truth. Returns the
 * group as well so the form can flag the tab the field is hiding on — an error
 * that disables Save from behind a closed tab is an error nobody can fix.
 */
export function findPartsProblem(parts: MongoUriParts): PartsProblem | null {
  const hosts = parts.hosts.filter(h => h.host.trim());
  if (!hosts.length) return { message: 'At least one host is required.', group: 'server' };
  const srv = parts.scheme === 'mongodb+srv';
  if (srv && hosts.length > 1) {
    return { message: 'mongodb+srv accepts a single host.', group: 'server' };
  }
  for (const h of parts.hosts) {
    const port = h.port.trim();
    if (!port) continue;
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      return { message: `Invalid port "${port}".`, group: 'server' };
    }
  }
  if (parts.password && !parts.username.trim()) {
    return { message: 'A password needs a username.', group: 'auth' };
  }
  // The driver rejects both of these outright, so catching them here turns a
  // failed Test Connection into a message next to the field.
  if (parts.directConnection === 'true') {
    if (srv) return { message: 'directConnection cannot be used with mongodb+srv.', group: 'server' };
    if (hosts.length > 1) return { message: 'directConnection needs exactly one host.', group: 'server' };
  }

  for (const spec of URI_OPTIONS) {
    const value = parts[spec.key].trim();
    if (!value) continue;
    if (spec.kind === 'number' && !/^\d+$/.test(value)) {
      return { message: `${spec.key} must be a non-negative integer (got "${value}").`, group: spec.group };
    }
    if (spec.kind === 'bool' && value !== 'true' && value !== 'false') {
      return { message: `${spec.key} must be true or false (got "${value}").`, group: spec.group };
    }
  }

  // `w` is either a non-negative integer or a name — "majority" or a tag set.
  // Only a numeric-looking value can be wrong here (`w=-1`, `w=1.5`).
  const w = parts.w.trim();
  if (w && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(w) && !/^\d+$/.test(w)) {
    return { message: `w must be a non-negative integer or a name like "majority" (got "${w}").`, group: 'options' };
  }

  const maxPool = parts.maxPoolSize.trim();
  const minPool = parts.minPoolSize.trim();
  if (maxPool && minPool && Number(minPool) > Number(maxPool)) {
    return { message: 'minPoolSize cannot be greater than maxPoolSize.', group: 'options' };
  }

  return null;
}

/** Message-only view of {@link findPartsProblem}. */
export function validateParts(parts: MongoUriParts): string | null {
  return findPartsProblem(parts)?.message ?? null;
}
