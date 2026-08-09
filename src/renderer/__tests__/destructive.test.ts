import { describe, it, expect } from 'vitest';
import { matchesTyped, impactLine } from '../utils/destructive';

describe('matchesTyped', () => {
  it('accepts the exact name', () => {
    expect(matchesTyped('users', 'users')).toBe(true);
  });

  it('forgives surrounding whitespace, since it is invisible', () => {
    expect(matchesTyped('  users \n', 'users')).toBe(true);
  });

  it('rejects a different case — the typing has to be deliberate', () => {
    expect(matchesTyped('Users', 'users')).toBe(false);
  });

  it('rejects a prefix or a typo', () => {
    expect(matchesTyped('user', 'users')).toBe(false);
    expect(matchesTyped('userss', 'users')).toBe(false);
    expect(matchesTyped('', 'users')).toBe(false);
  });
});

describe('impactLine', () => {
  it('is empty while the count is still unknown', () => {
    expect(impactLine(null)).toBe('');
  });

  it('counts documents for a collection', () => {
    expect(impactLine({ documents: 1 })).toBe('1 document');
    expect(impactLine({ documents: 0 })).toBe('0 documents');
  });

  it('adds the collection count for a database', () => {
    expect(impactLine({ documents: 1204, collections: 3 })).toBe('1,204 documents in 3 collections');
    expect(impactLine({ documents: 5, collections: 1 })).toBe('5 documents in 1 collection');
  });

  it('flags an estimated count so the number is not read as exact', () => {
    expect(impactLine({ documents: 50000, estimated: true })).toBe('≈50,000 documents');
  });
});
