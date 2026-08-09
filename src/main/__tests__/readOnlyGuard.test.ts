import { describe, it, expect, vi } from 'vitest';
import { isWriteMethod, guardHandle, ReadOnlyError, READ_ONLY_MESSAGE } from '../readOnlyGuard';

describe('isWriteMethod', () => {
  it('knows the writes', () => {
    for (const m of ['insertOne', 'updateMany', 'deleteOne', 'drop', 'createIndex', 'bulkWrite']) {
      expect(isWriteMethod(m)).toBe(true);
    }
  });

  it('leaves reads alone', () => {
    for (const m of ['find', 'findOne', 'aggregate', 'countDocuments', 'estimatedDocumentCount', 'indexes', 'listCollections']) {
      expect(isWriteMethod(m)).toBe(false);
    }
  });

  it('blocks the escape hatches — a raw command can write anything', () => {
    expect(isWriteMethod('command')).toBe(true);
    expect(isWriteMethod('runCommand')).toBe(true);
  });
});

describe('guardHandle', () => {
  // `any` on purpose: these stand in for driver handles whose real signatures
  // are irrelevant to what the guard does with them.
  const fakeCollection = (): any => ({
    find: vi.fn((_filter?: any) => 'cursor'),
    countDocuments: vi.fn(async () => 3),
    insertOne: vi.fn(async (_doc?: any) => ({ insertedId: 1 })),
    drop: vi.fn(async () => true),
    name: 'users',
  });

  const fakeDb = (col: any): any => ({
    collection: vi.fn((_name?: string) => col),
    listCollections: vi.fn(() => ({ toArray: async () => [] })),
    dropDatabase: vi.fn(async () => true),
    databaseName: 'testdb',
  });

  it('passes reads straight through', async () => {
    const col = fakeCollection();
    const guarded = guardHandle(col);
    expect(guarded.find({})).toBe('cursor');
    await expect(guarded.countDocuments()).resolves.toBe(3);
    expect(col.find).toHaveBeenCalled();
  });

  it('throws on a write instead of calling it', () => {
    const col = fakeCollection();
    const guarded = guardHandle(col);
    expect(() => guarded.insertOne({})).toThrow(ReadOnlyError);
    expect(() => guarded.drop()).toThrow(READ_ONLY_MESSAGE);
    expect(col.insertOne).not.toHaveBeenCalled();
    expect(col.drop).not.toHaveBeenCalled();
  });

  it('names the blocked method, so the error says what was refused', () => {
    expect(() => guardHandle(fakeCollection()).insertOne({})).toThrow(/insertOne/);
  });

  it('guards the collection a guarded db hands out', () => {
    const col = fakeCollection();
    const guarded = guardHandle(fakeDb(col));
    const guardedCol = guarded.collection('users');
    expect(() => guardedCol.insertOne({})).toThrow(ReadOnlyError);
    expect(guardedCol.find({})).toBe('cursor');
  });

  it('blocks dropDatabase on the db handle itself', () => {
    expect(() => guardHandle(fakeDb(fakeCollection())).dropDatabase()).toThrow(ReadOnlyError);
  });

  it('keeps plain properties readable', () => {
    expect(guardHandle(fakeCollection()).name).toBe('users');
    expect(guardHandle(fakeDb(fakeCollection())).databaseName).toBe('testdb');
  });
});
