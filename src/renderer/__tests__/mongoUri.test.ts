import { describe, it, expect } from 'vitest';
import {
  parseMongoUri, buildMongoUri, validateParts, findPartsProblem,
  EMPTY_PARTS, URI_OPTIONS, MongoUriParts,
} from '../utils/mongoUri';

const parts = (over: Partial<MongoUriParts> = {}): MongoUriParts => ({ ...EMPTY_PARTS, ...over });

/**
 * Query parameters as a `name → value` map, both folded to lower case: the
 * point of a round trip is that no parameter goes missing, not that the driver's
 * case-insensitive spellings survive letter for letter.
 */
const queryOf = (uri: string): Record<string, string> => {
  const q = uri.slice(uri.indexOf('?') + 1);
  const out: Record<string, string> = {};
  for (const pair of q.split('&')) {
    const eq = pair.indexOf('=');
    out[decodeURIComponent(pair.slice(0, eq)).toLowerCase()] =
      decodeURIComponent(pair.slice(eq + 1)).toLowerCase();
  }
  return out;
};

describe('parseMongoUri', () => {
  it('returns null for anything that is not a mongo URI', () => {
    expect(parseMongoUri('')).toBeNull();
    expect(parseMongoUri('postgres://localhost:5432')).toBeNull();
    expect(parseMongoUri('localhost:27017')).toBeNull();
  });

  it('parses the bare local URI', () => {
    const p = parseMongoUri('mongodb://localhost:27017')!;
    expect(p.scheme).toBe('mongodb');
    expect(p.hosts).toEqual([{ host: 'localhost', port: '27017' }]);
    expect(p.username).toBe('');
    expect(p.database).toBe('');
  });

  it('splits credentials, hosts, path and options of a replica-set URI', () => {
    const p = parseMongoUri(
      'mongodb://user1:pw1@td-mongo01:27017,td-mongo02:27017/admin?replicaSet=rs0&authSource=admin&retryWrites=true'
    )!;
    expect(p.username).toBe('user1');
    expect(p.password).toBe('pw1');
    expect(p.hosts).toEqual([
      { host: 'td-mongo01', port: '27017' },
      { host: 'td-mongo02', port: '27017' },
    ]);
    expect(p.database).toBe('admin');
    expect(p.replicaSet).toBe('rs0');
    expect(p.authSource).toBe('admin');
    // retryWrites has a field of its own, so nothing is left over.
    expect(p.retryWrites).toBe('true');
    expect(p.options).toBe('');
  });

  it('matches option names case-insensitively, like the driver', () => {
    const p = parseMongoUri('mongodb://h/?REPLICASET=rs0&AuthSource=admin')!;
    expect(p.replicaSet).toBe('rs0');
    expect(p.authSource).toBe('admin');
    expect(p.options).toBe('');
  });

  it('handles mongodb+srv, which carries no port', () => {
    const p = parseMongoUri('mongodb+srv://u:p@cluster0.abcd.mongodb.net/test')!;
    expect(p.scheme).toBe('mongodb+srv');
    expect(p.hosts).toEqual([{ host: 'cluster0.abcd.mongodb.net', port: '' }]);
    expect(p.database).toBe('test');
  });

  it('percent-decodes credentials and the database', () => {
    const p = parseMongoUri('mongodb://us%40er:p%40ss%2Fword@h:27017/my%20db')!;
    expect(p.username).toBe('us@er');
    expect(p.password).toBe('p@ss/word');
    expect(p.database).toBe('my db');
  });

  it('keeps a malformed escape as raw text instead of throwing', () => {
    const p = parseMongoUri('mongodb://user:p%zz@h:27017')!;
    expect(p.password).toBe('p%zz');
  });

  it('reads a bracketed IPv6 host without eating the colons', () => {
    const p = parseMongoUri('mongodb://[::1]:27017/admin')!;
    expect(p.hosts).toEqual([{ host: '[::1]', port: '27017' }]);
  });

  it('accepts a host with no port and a URI with no path', () => {
    expect(parseMongoUri('mongodb://myhost')!.hosts).toEqual([{ host: 'myhost', port: '' }]);
    expect(parseMongoUri('mongodb://myhost')!.database).toBe('');
  });

  it('falls back to one empty host rather than an empty list', () => {
    expect(parseMongoUri('mongodb:///admin')!.hosts).toEqual([{ host: '', port: '' }]);
  });
});

describe('buildMongoUri', () => {
  it('builds the bare local URI', () => {
    expect(buildMongoUri(parts({ hosts: [{ host: 'localhost', port: '27017' }] })))
      .toBe('mongodb://localhost:27017');
  });

  it('emits credentials only when there is a username', () => {
    expect(buildMongoUri(parts({ hosts: [{ host: 'h', port: '' }], password: 'pw' })))
      .toBe('mongodb://h');
    expect(buildMongoUri(parts({ hosts: [{ host: 'h', port: '' }], username: 'u' })))
      .toBe('mongodb://u@h');
  });

  it('percent-encodes credentials so a password with @ or / survives', () => {
    const uri = buildMongoUri(parts({
      username: 'us@er', password: 'p@ss/word', hosts: [{ host: 'h', port: '27017' }],
    }));
    expect(uri).toBe('mongodb://us%40er:p%40ss%2Fword@h:27017');
    const back = parseMongoUri(uri)!;
    expect(back.username).toBe('us@er');
    expect(back.password).toBe('p@ss/word');
  });

  it('keeps the slash before the query when there is no database', () => {
    expect(buildMongoUri(parts({ hosts: [{ host: 'h', port: '' }], replicaSet: 'rs0' })))
      .toBe('mongodb://h/?replicaSet=rs0');
  });

  it('drops the port on mongodb+srv', () => {
    expect(buildMongoUri(parts({ scheme: 'mongodb+srv', hosts: [{ host: 'c.mongodb.net', port: '27017' }] })))
      .toBe('mongodb+srv://c.mongodb.net');
  });

  it('skips blank hosts and trims the rest', () => {
    expect(buildMongoUri(parts({
      hosts: [{ host: ' a ', port: ' 27017 ' }, { host: '', port: '27018' }, { host: 'b', port: '' }],
    }))).toBe('mongodb://a:27017,b');
  });

  it('appends the extra options after the named ones', () => {
    expect(buildMongoUri(parts({
      hosts: [{ host: 'h', port: '' }], database: 'admin',
      replicaSet: 'rs0', authSource: 'admin', options: 'retryWrites=true&readPreference=primary',
    }))).toBe('mongodb://h/admin?replicaSet=rs0&authSource=admin&retryWrites=true&readPreference=primary');
  });

  it('tolerates a leading ? or & typed into the options box', () => {
    expect(buildMongoUri(parts({ hosts: [{ host: 'h', port: '' }], options: '?tls=true' })))
      .toBe('mongodb://h/?tls=true');
  });

  it('round-trips a realistic Studio 3T style URI unchanged', () => {
    const uri = 'mongodb://user1:pw1@td-mongo01:27017,td-mongo02:27017/admin?replicaSet=rs0&authSource=admin&retryWrites=true';
    expect(buildMongoUri(parseMongoUri(uri)!)).toBe(uri);
  });
});

describe('named connection options', () => {
  const ALL =
    'mongodb://h:27017/db?replicaSet=rs0&authSource=admin&authMechanism=SCRAM-SHA-256' +
    '&directConnection=false&appName=BoxyNoSql&compressors=snappy,zlib' +
    '&readPreference=secondaryPreferred&readConcernLevel=majority&w=majority&journal=true' +
    '&retryWrites=true&retryReads=false&connectTimeoutMS=10000&socketTimeoutMS=0' +
    '&serverSelectionTimeoutMS=30000&maxPoolSize=100&minPoolSize=5';

  it('gives every known option its own field and leaves nothing over', () => {
    const p = parseMongoUri(ALL)!;
    expect(p.authMechanism).toBe('SCRAM-SHA-256');
    expect(p.directConnection).toBe('false');
    expect(p.appName).toBe('BoxyNoSql');
    expect(p.compressors).toBe('snappy,zlib');
    expect(p.readPreference).toBe('secondaryPreferred');
    expect(p.readConcernLevel).toBe('majority');
    expect(p.w).toBe('majority');
    expect(p.journal).toBe('true');
    expect(p.retryWrites).toBe('true');
    expect(p.retryReads).toBe('false');
    expect(p.connectTimeoutMS).toBe('10000');
    expect(p.socketTimeoutMS).toBe('0');
    expect(p.serverSelectionTimeoutMS).toBe('30000');
    expect(p.maxPoolSize).toBe('100');
    expect(p.minPoolSize).toBe('5');
    expect(p.options).toBe('');
  });

  it('writes the whole set back in the declared order', () => {
    // The fields are laid out in the same order they are written, so a URI that
    // was already canonical comes back byte for byte.
    expect(buildMongoUri(parseMongoUri(ALL)!)).toBe(ALL);
  });

  it('canonicalises the casing of an enum but keeps a value it does not know', () => {
    expect(parseMongoUri('mongodb://h/?readPreference=SECONDARY')!.readPreference).toBe('secondary');
    expect(parseMongoUri('mongodb://h/?authMechanism=MONGODB-FUTURE')!.authMechanism).toBe('MONGODB-FUTURE');
    expect(buildMongoUri(parseMongoUri('mongodb://h/?authMechanism=MONGODB-FUTURE')!))
      .toBe('mongodb://h/?authMechanism=MONGODB-FUTURE');
  });

  it('reads a boolean whatever its casing', () => {
    const p = parseMongoUri('mongodb://h/?retryWrites=TRUE&journal=False')!;
    expect(p.retryWrites).toBe('true');
    expect(p.journal).toBe('false');
  });
});

describe('three-state booleans', () => {
  it('starts unset, and unset means the option is absent from the URI', () => {
    for (const spec of URI_OPTIONS.filter(o => o.kind === 'bool')) {
      expect(EMPTY_PARTS[spec.key]).toBe('');
    }
    // Not `retryWrites=false` — an untouched field must not override the
    // driver's own default.
    expect(buildMongoUri(parts({ hosts: [{ host: 'h', port: '' }] }))).toBe('mongodb://h');
  });

  it('writes an explicit false, which is not the same as leaving it out', () => {
    const host = [{ host: 'h', port: '' }];
    expect(buildMongoUri(parts({ hosts: host, retryWrites: 'false' })))
      .toBe('mongodb://h/?retryWrites=false');
    expect(buildMongoUri(parts({ hosts: host, retryWrites: 'true' })))
      .toBe('mongodb://h/?retryWrites=true');
  });

  it('round-trips absent → unset → absent', () => {
    const p = parseMongoUri('mongodb://h:27017/db')!;
    expect(p.retryWrites).toBe('');
    expect(p.journal).toBe('');
    expect(p.directConnection).toBe('');
    expect(buildMongoUri(p)).toBe('mongodb://h:27017/db');
  });

  it('round-trips false → false, never dropping it', () => {
    const uri = 'mongodb://h:27017/db?retryWrites=false';
    expect(buildMongoUri(parseMongoUri(uri)!)).toBe(uri);
  });
});

describe('nothing is lost', () => {
  it('keeps a parameter with no field of its own in the raw residual', () => {
    const p = parseMongoUri('mongodb://h/?maxStalenessSeconds=90&tls=true')!;
    expect(p.options).toBe('maxStalenessSeconds=90&tls=true');
    expect(buildMongoUri(p)).toBe('mongodb://h/?maxStalenessSeconds=90&tls=true');
  });

  it('keeps a known option the field could not display', () => {
    // A control that cannot show the value would silently rewrite it, so the
    // raw pair stays raw instead.
    const p = parseMongoUri('mongodb://h/?retryWrites=yes&maxPoolSize=lots&journal=1')!;
    expect(p.retryWrites).toBe('');
    expect(p.maxPoolSize).toBe('');
    expect(p.journal).toBe('');
    expect(p.options).toBe('retryWrites=yes&maxPoolSize=lots&journal=1');
  });

  it('keeps a valueless or empty parameter, which a field cannot express', () => {
    const p = parseMongoUri('mongodb://h/?authSource=&retryWrites&appName=')!;
    expect(p.authSource).toBe('');
    expect(p.options).toBe('authSource=&retryWrites&appName=');
    expect(buildMongoUri(p)).toBe('mongodb://h/?authSource=&retryWrites&appName=');
  });

  it('keeps a duplicated parameter — first into the field, the rest raw', () => {
    const p = parseMongoUri('mongodb://h/?retryWrites=true&retryWrites=false')!;
    expect(p.retryWrites).toBe('true');
    expect(p.options).toBe('retryWrites=false');
    expect(buildMongoUri(p)).toBe('mongodb://h/?retryWrites=true&retryWrites=false');
  });

  it('round-trips every parameter of a messy URI, named or not', () => {
    const uri =
      'mongodb://user:pw@a:27017,b:27018/admin?RETRYWRITES=TRUE&ReadPreference=Nearest' +
      '&APPNAME=MyApp&maxPoolSize=50&heartbeatFrequencyMS=10000&zlibCompressionLevel=6' +
      '&3t.uriVersion=3&retryWrites=false';
    const rebuilt = buildMongoUri(parseMongoUri(uri)!);

    expect(queryOf(rebuilt)).toEqual(queryOf(uri));
    // …and the non-query half is untouched too.
    expect(rebuilt.slice(0, rebuilt.indexOf('?'))).toBe(uri.slice(0, uri.indexOf('?')));
    // Casing only ever moves to the canonical spelling of a name/enum; a free
    // text value keeps every letter.
    expect(rebuilt).toContain('appName=MyApp');
    expect(rebuilt).toContain('3t.uriVersion=3');
  });
});

describe('validateParts', () => {
  it('requires a host', () => {
    expect(validateParts(EMPTY_PARTS)).toMatch(/host is required/);
  });

  it('accepts a plain host', () => {
    expect(validateParts(parts({ hosts: [{ host: 'localhost', port: '27017' }] }))).toBeNull();
  });

  it('rejects a port outside 1-65535 or not a number', () => {
    expect(validateParts(parts({ hosts: [{ host: 'h', port: '0' }] }))).toMatch(/Invalid port/);
    expect(validateParts(parts({ hosts: [{ host: 'h', port: '70000' }] }))).toMatch(/Invalid port/);
    expect(validateParts(parts({ hosts: [{ host: 'h', port: 'abc' }] }))).toMatch(/Invalid port/);
  });

  it('rejects more than one host on mongodb+srv', () => {
    expect(validateParts(parts({
      scheme: 'mongodb+srv', hosts: [{ host: 'a', port: '' }, { host: 'b', port: '' }],
    }))).toMatch(/single host/);
  });

  it('rejects a password without a username', () => {
    expect(validateParts(parts({ hosts: [{ host: 'h', port: '' }], password: 'pw' })))
      .toMatch(/needs a username/);
  });

  const withHost = (over: Partial<MongoUriParts> = {}) =>
    parts({ hosts: [{ host: 'h', port: '27017' }], ...over });

  it('accepts every numeric option as a non-negative integer', () => {
    expect(validateParts(withHost({
      connectTimeoutMS: '0', socketTimeoutMS: '30000', serverSelectionTimeoutMS: '5000',
      maxPoolSize: '100', minPoolSize: '0',
    }))).toBeNull();
  });

  it('rejects a negative, fractional or non-numeric timeout or pool size', () => {
    for (const key of ['connectTimeoutMS', 'socketTimeoutMS', 'serverSelectionTimeoutMS', 'maxPoolSize', 'minPoolSize'] as const) {
      for (const bad of ['-1', '1.5', 'lots']) {
        expect(validateParts(withHost({ [key]: bad }))).toMatch(/non-negative integer/);
      }
    }
  });

  it('rejects a minPoolSize above maxPoolSize', () => {
    expect(validateParts(withHost({ maxPoolSize: '10', minPoolSize: '20' })))
      .toMatch(/minPoolSize cannot be greater/);
    expect(validateParts(withHost({ maxPoolSize: '10', minPoolSize: '10' }))).toBeNull();
  });

  it('accepts w as a count or a name, but not as a negative or fractional count', () => {
    expect(validateParts(withHost({ w: 'majority' }))).toBeNull();
    expect(validateParts(withHost({ w: '0' }))).toBeNull();
    expect(validateParts(withHost({ w: '2' }))).toBeNull();
    expect(validateParts(withHost({ w: 'myTagSet' }))).toBeNull();
    expect(validateParts(withHost({ w: '-1' }))).toMatch(/non-negative integer or a name/);
    expect(validateParts(withHost({ w: '1.5' }))).toMatch(/non-negative integer or a name/);
  });

  it('rejects a boolean that is neither empty, true nor false', () => {
    expect(validateParts(withHost({ retryWrites: 'yes' }))).toMatch(/must be true or false/);
    expect(validateParts(withHost({ retryWrites: '' }))).toBeNull();
  });

  it('rejects directConnection where the driver would', () => {
    expect(validateParts(withHost({
      hosts: [{ host: 'a', port: '' }, { host: 'b', port: '' }], directConnection: 'true',
    }))).toMatch(/exactly one host/);
    expect(validateParts(withHost({
      scheme: 'mongodb+srv', hosts: [{ host: 'c.mongodb.net', port: '' }], directConnection: 'true',
    }))).toMatch(/cannot be used with mongodb\+srv/);
    expect(validateParts(withHost({ directConnection: 'false' }))).toBeNull();
  });
});

describe('findPartsProblem', () => {
  it('names the group holding the offending field, so a hidden tab can be flagged', () => {
    expect(findPartsProblem(parts({ hosts: [{ host: 'h', port: '99999' }] })))
      .toEqual({ message: 'Invalid port "99999".', group: 'server' });
    expect(findPartsProblem(parts({ hosts: [{ host: 'h', port: '' }], password: 'pw' }))?.group)
      .toBe('auth');
    expect(findPartsProblem(parts({ hosts: [{ host: 'h', port: '' }], maxPoolSize: 'lots' }))?.group)
      .toBe('options');
  });

  it('is null when everything is fine', () => {
    expect(findPartsProblem(parts({ hosts: [{ host: 'h', port: '27017' }] }))).toBeNull();
  });
});
