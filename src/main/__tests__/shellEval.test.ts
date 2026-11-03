import { describe, it, expect, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { transformShell, runShell, runShellSerialized } from '../shellEval';
import { guardHandle, ReadOnlyError } from '../readOnlyGuard';

// Stand-ins for driver handles: only what the shell layer calls.
function fakeCursor(docs: any[]) {
  const cursor: any = {
    limit: vi.fn(() => cursor),
    sort: vi.fn(() => cursor),
    toArray: vi.fn(async () => docs),
    explain: vi.fn(async () => ({ plan: true })),
  };
  return cursor;
}
function fakeCollection(name: string, docs: any[] = [{ _id: 1, name: 'a' }]) {
  return {
    collectionName: name,
    find: vi.fn((_f?: any, _o?: any) => fakeCursor(docs)),
    findOne: vi.fn(async (_f?: any, _o?: any) => docs[0]),
    countDocuments: vi.fn(async (_f?: any) => docs.length),
    updateMany: vi.fn(async (_f?: any, _u?: any, _o?: any) => ({ matchedCount: 3, modifiedCount: 2 })),
    updateOne: vi.fn(async (_f?: any, _u?: any, _o?: any) => ({ matchedCount: 1, modifiedCount: 1 })),
    insertOne: vi.fn(async (_d?: any) => ({ insertedId: 9 })),
    insertMany: vi.fn(async (d: any[]) => ({ insertedCount: d.length })),
    deleteOne: vi.fn(async (_f?: any) => ({ deletedCount: 1 })),
    deleteMany: vi.fn(async (_f?: any) => ({ deletedCount: 5 })),
  };
}
function fakeDb(name = 'test') {
  const cols = new Map<string, ReturnType<typeof fakeCollection>>();
  const db: any = {
    databaseName: name,
    collection: vi.fn((n: string) => {
      if (!cols.has(n)) cols.set(n, fakeCollection(n));
      return cols.get(n)!;
    }),
    listCollections: vi.fn(() => ({ toArray: async () => [{ name: 'b' }, { name: 'a' }] })),
    stats: vi.fn(async () => ({ db: name })),
  };
  return { db, cols };
}
const run = (code: string, db: any) => runShellSerialized(code, db, (n: string) => fakeDb(n).db);

describe('transformShell', () => {
  it('awaits every call and returns the last expression', () => {
    expect(transformShell('db.x.find()')).toBe(';return ((await db.x.find()))');
    expect(transformShell('const r = db.x.find().toArray();\nr.length;')).toBe(
      ';const r = (await (await db.x.find()).toArray());\n;return (r.length);'.replace(';const', 'const'),
    );
  });

  it('keeps callbacks as written — await is not allowed there', () => {
    const out = transformShell('[1].map(x => f(x))');
    expect(out).toContain('x => f(x)');
  });

  it('guards against a missing semicolon gluing two statements', () => {
    expect(() => new Function(`return (async () => { ${transformShell('let a = 1\nprint(a)')} })`)).not.toThrow();
  });

  it('reports a syntax error as such', () => {
    expect(() => transformShell('db.x.find({')).toThrow(SyntaxError);
  });
});

describe('runShell — shell syntax', () => {
  it('runs the multi-statement script from the bug report', async () => {
    const { db, cols } = fakeDb();
    const res = await run(
      'const r = db.ENTI.updateMany({ codiceUrl: { $exists: true } }, { $unset: { codiceUrl: "" } });\n' +
      'print(`ENTI: codiceUrl rimosso da ${r.modifiedCount} documenti`);',
      db,
    );
    expect(cols.get('ENTI')!.updateMany).toHaveBeenCalledWith({ codiceUrl: { $exists: true } }, { $unset: { codiceUrl: '' } });
    expect(res.output).toEqual(['ENTI: codiceUrl rimosso da 2 documenti']);
    expect(res.result).toBeUndefined();
  });

  it('returns the last expression, draining a cursor', async () => {
    const { db } = fakeDb();
    expect((await run('db.users.find({}).limit(5)', db)).result).toEqual([{ _id: 1, name: 'a' }]);
  });

  it('still accepts the driver form', async () => {
    const { db } = fakeDb();
    expect((await run('db.collection("users").find({}).toArray()', db)).result).toEqual([{ _id: 1, name: 'a' }]);
  });

  it('maps the shell projection argument to driver options', async () => {
    const { db, cols } = fakeDb();
    await run('db.users.find({ a: 1 }, { name: 1 })', db);
    expect(cols.get('users')!.find).toHaveBeenCalledWith({ a: 1 }, { projection: { name: 1 } });
    await run('db.users.find({}, { sort: { a: 1 } })', db);
    expect(cols.get('users')!.find).toHaveBeenLastCalledWith({}, { sort: { a: 1 } });
  });

  it('speaks the old helpers', async () => {
    const { db, cols } = fakeDb();
    expect((await run('db.users.count({ a: 1 })', db)).result).toBe(1);
    await run('db.users.insert([{ a: 1 }, { a: 2 }])', db);
    expect(cols.get('users')!.insertMany).toHaveBeenCalled();
    await run('db.users.update({ a: 1 }, { $set: { b: 1 } }, { multi: true, upsert: true })', db);
    expect(cols.get('users')!.updateMany).toHaveBeenCalledWith({ a: 1 }, { $set: { b: 1 } }, { upsert: true });
    await run('db.users.remove({ a: 1 }, true)', db);
    expect(cols.get('users')!.deleteOne).toHaveBeenCalled();
    expect((await run('db.users.find().pretty().count()', db)).result).toBe(1);
  });

  it('keeps Db methods and names collections everything else', async () => {
    const { db } = fakeDb('shop');
    expect((await run('db.stats()', db)).result).toEqual({ db: 'shop' });
    expect((await run('db.getName()', db)).result).toBe('shop');
    expect((await run('db.getCollectionNames()', db)).result).toEqual(['a', 'b']);
    expect((await run('db.getSiblingDB("other").getName()', db)).result).toBe('other');
    expect((await run('db.getCollection("stats").getName()', db)).result).toBe('stats');
  });

  it('provides the shell constructors and printjson', async () => {
    const { db, cols } = fakeDb();
    const hex = 'a'.repeat(24);
    const res = await run(`printjson({ n: 1 }); db.users.findOne({ _id: ObjectId("${hex}"), d: ISODate("2024-01-02") })`, db);
    const filter = cols.get('users')!.findOne.mock.calls[0][0];
    expect(filter._id).toBeInstanceOf(ObjectId);
    expect(filter.d).toBeInstanceOf(Date);
    expect(res.output).toEqual(['{\n  "n": 1\n}']);
  });

  it('serializes BSON in the result and in print', async () => {
    const { db } = fakeDb();
    const hex = 'b'.repeat(24);
    const res = await run(`print(ObjectId("${hex}")); ({ id: ObjectId("${hex}") })`, db);
    expect(res.output).toEqual([`{"$oid":"${hex}"}`]);
    expect(res.result).toEqual({ id: { $oid: hex } });
  });

  it('writes stay blocked on a guarded handle, through the shell names too', async () => {
    const { db, cols } = fakeDb();
    const guarded = guardHandle(db);
    await expect(runShell('db.ENTI.updateMany({}, { $set: { a: 1 } })', guarded, n => guardHandle(fakeDb(n).db)))
      .rejects.toThrow(ReadOnlyError);
    await expect(runShell('db.ENTI.insert({ a: 1 })', guarded, n => guardHandle(fakeDb(n).db)))
      .rejects.toThrow(ReadOnlyError);
    await expect(runShell('db.getSiblingDB("x").y.deleteMany({})', guarded, n => guardHandle(fakeDb(n).db)))
      .rejects.toThrow(ReadOnlyError);
    expect(cols.get('ENTI')?.updateMany ?? vi.fn()).not.toHaveBeenCalled();
    // Reads still work.
    expect((await runShell('db.ENTI.find()', guarded, n => fakeDb(n).db)).raw).toEqual([{ _id: 1, name: 'a' }]);
  });

  it('can leave a cursor undrained for explain', async () => {
    const { db } = fakeDb();
    const { raw } = await runShell('db.users.find({})', db, n => fakeDb(n).db, { drain: false });
    expect(await raw.explain('executionStats')).toEqual({ plan: true });
  });
});
