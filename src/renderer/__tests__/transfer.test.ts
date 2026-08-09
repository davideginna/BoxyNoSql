import { describe, it, expect } from 'vitest';
import { copiedMessage, pasteConfirm, type TransferItem } from '../utils/transfer';

const db: TransferItem = { kind: 'database', connectionName: 'prod', db: 'testdb' };
const col: TransferItem = { kind: 'collection', connectionName: 'prod', db: 'testdb', col: 'users' };

describe('copiedMessage', () => {
  it('names the database and the connection it came from', () => {
    expect(copiedMessage(db)).toBe('Database "testdb" copied from "prod"');
  });

  it('spells a collection as db.collection', () => {
    expect(copiedMessage(col)).toBe('Collection "testdb.users" copied from "prod"');
  });
});

describe('pasteConfirm', () => {
  it('asks before writing, naming source and target', () => {
    const c = pasteConfirm(db, { connectionName: 'local' });
    expect(c.title).toBe('Copy database');
    expect(c.message).toBe('Copy database "testdb" to "local"?');
    expect(c.detail).toContain('From: prod / testdb');
    expect(c.detail).toContain('To:   local');
  });

  it('includes the target database when pasting a collection', () => {
    const c = pasteConfirm(col, { connectionName: 'local', db: 'other' });
    expect(c.title).toBe('Copy collection');
    expect(c.message).toBe('Copy collection "testdb.users" to "other" on "local"?');
    expect(c.detail).toContain('To:   local / other');
  });

  it('says so when both ends are the same connection', () => {
    expect(pasteConfirm(db, { connectionName: 'prod' }).detail).toContain('same connection');
  });

  it('still names both ends when the connections merely share a database name', () => {
    const c = pasteConfirm({ ...db, connectionName: 'prod' }, { connectionName: 'staging' });
    expect(c.detail).toContain('From: prod');
    expect(c.detail).toContain('To:   staging');
    expect(c.detail).not.toContain('same connection');
  });
});
