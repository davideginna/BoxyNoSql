import { describe, it, expect } from 'vitest';
import {
  databaseSuggestions, defaultDbForRole, describeRoleChange, diffRoles, formatRole, normalizeRoles, roleSuggestions, validateRoles,
} from '../utils/userRoles';

describe('defaultDbForRole', () => {
  it('puts admin-only built-ins on admin', () => {
    expect(defaultDbForRole('readAnyDatabase', 'shop')).toBe('admin');
    expect(defaultDbForRole('root', 'shop')).toBe('admin');
  });
  it('keeps the open database for everything else', () => {
    expect(defaultDbForRole('readWrite', 'shop')).toBe('shop');
    expect(defaultDbForRole('myCustomRole', 'shop')).toBe('shop');
  });
});

describe('validateRoles', () => {
  it('accepts an empty list', () => {
    expect(validateRoles([])).toBeNull();
  });
  it('accepts distinct pairs, including the same role on two databases', () => {
    expect(validateRoles([{ role: 'read', db: 'a' }, { role: 'read', db: 'b' }])).toBeNull();
  });
  it('refuses an empty role name or database', () => {
    expect(validateRoles([{ role: '  ', db: 'a' }])).toMatch(/role name is empty/);
    expect(validateRoles([{ role: 'read', db: '' }])).toMatch(/database is empty/);
  });
  it('refuses a duplicate pair, ignoring surrounding whitespace', () => {
    expect(validateRoles([{ role: 'read', db: 'a' }, { role: ' read ', db: 'a' }]))
      .toBe('read@a is listed twice');
  });
});

describe('diffRoles', () => {
  it('reports what is granted and what is revoked', () => {
    const current = [{ role: 'read', db: 'shop' }, { role: 'dbAdmin', db: 'shop' }];
    const next = [{ role: 'read', db: 'shop' }, { role: 'readAnyDatabase', db: 'admin' }];
    expect(diffRoles(current, next)).toEqual({
      added: [{ role: 'readAnyDatabase', db: 'admin' }],
      removed: [{ role: 'dbAdmin', db: 'shop' }],
    });
  });
  it('treats the same role on another database as a different role', () => {
    const d = diffRoles([{ role: 'read', db: 'a' }], [{ role: 'read', db: 'b' }]);
    expect(d.added.map(formatRole)).toEqual(['read@b']);
    expect(d.removed.map(formatRole)).toEqual(['read@a']);
  });
  it('is empty when nothing changed', () => {
    expect(diffRoles([{ role: 'read', db: 'a' }], [{ role: ' read', db: 'a ' }]))
      .toEqual({ added: [], removed: [] });
  });
});

describe('normalizeRoles / roleSuggestions', () => {
  it('trims both fields', () => {
    expect(normalizeRoles([{ role: ' read ', db: ' a ' }])).toEqual([{ role: 'read', db: 'a' }]);
  });
  it('lists built-ins first, then custom roles sorted, without duplicates', () => {
    const s = roleSuggestions(['zeta', 'read', 'alpha']);
    expect(s[0]).toBe('read');
    expect(s.slice(-2)).toEqual(['alpha', 'zeta']);
    expect(s.filter(r => r === 'read')).toHaveLength(1);
  });
});

describe('describeRoleChange', () => {
  it('lists grants and revokes, and warns only when something is revoked', () => {
    const text = describeRoleChange('ann', {
      added: [{ role: 'read', db: 'shop' }],
      removed: [{ role: 'userAdmin', db: 'shop' }],
    });
    expect(text).toContain('+ grant  read@shop');
    expect(text).toContain('− revoke userAdmin@shop');
    expect(text).toMatch(/lock this connection out/);
    expect(describeRoleChange('ann', { added: [{ role: 'read', db: 'a' }], removed: [] }))
      .not.toMatch(/lock/);
  });
});

describe('databaseSuggestions', () => {
  it('puts the open database and admin first, then the rest sorted', () => {
    expect(databaseSuggestions(['zeta', 'admin', 'shop', 'alpha'], 'shop'))
      .toEqual(['shop', 'admin', 'alpha', 'zeta']);
  });
  it('offers admin even when the server list is empty', () => {
    expect(databaseSuggestions([], 'shop')).toEqual(['shop', 'admin']);
  });
  it('does not repeat admin when it is the open database', () => {
    expect(databaseSuggestions(['admin', 'config'], 'admin')).toEqual(['admin', 'config']);
  });
});
