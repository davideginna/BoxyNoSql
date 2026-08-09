/**
 * Read-only connections.
 *
 * The flag lives on the connection, but the guarantee has to live in the main
 * process: the renderer can hide every button and a write would still be one
 * `window.electron.invoke` away. So every write handler asks `assertWritable`
 * first, and `run-query` — which evals user code against a live `Db` — gets a
 * proxied handle that refuses the write methods instead.
 *
 * Electron-free so it can be unit-tested.
 */

export const READ_ONLY_MESSAGE = 'This connection is read-only. Enable writes in its settings to change data.';

export class ReadOnlyError extends Error {
  constructor(what?: string) {
    super(what ? `${READ_ONLY_MESSAGE} (blocked: ${what})` : READ_ONLY_MESSAGE);
    this.name = 'ReadOnlyError';
  }
}

/**
 * Driver methods that change data or schema. Anything not listed is readable —
 * the list is deliberately explicit: a new driver method should fail closed
 * only where it matters, and `find`/`aggregate`/`count` must keep working.
 */
export const WRITE_METHODS: ReadonlySet<string> = new Set([
  'insertOne', 'insertMany', 'bulkWrite', 'updateOne', 'updateMany', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete',
  'drop', 'dropDatabase', 'dropCollection', 'createCollection', 'rename', 'renameCollection',
  'createIndex', 'createIndexes', 'dropIndex', 'dropIndexes', 'createSearchIndex',
  'dropSearchIndex', 'updateSearchIndex', 'initializeOrderedBulkOp',
  'initializeUnorderedBulkOp', 'removeUser', 'addUser', 'command', 'runCommand',
  'watch',
]);

export function isWriteMethod(name: string): boolean {
  return WRITE_METHODS.has(name);
}

/**
 * Wrap a `Db` (or a `Collection`) so the write methods throw instead of
 * running. `db.collection(...)` returns a wrapped collection too, otherwise
 * the guard would stop one level short of where the writes actually happen.
 */
export function guardHandle<T extends object>(handle: T): T {
  return new Proxy(handle, {
    get(target, prop, receiver) {
      const key = String(prop);
      if (isWriteMethod(key)) {
        return () => { throw new ReadOnlyError(key); };
      }
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: any[]) => {
        const result = value.apply(target, args);
        // A collection handle is the gateway to every write, so guard it too.
        return (key === 'collection' || key === 'db') && result && typeof result === 'object'
          ? guardHandle(result)
          : result;
      };
    },
  });
}
