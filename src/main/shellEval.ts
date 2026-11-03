/**
 * The query terminal's dialect: mongo-shell syntax on top of the Node driver.
 *
 *   const r = db.ENTI.updateMany({ codiceUrl: { $exists: true } }, { $unset: { codiceUrl: "" } });
 *   print(`removed from ${r.modifiedCount} documents`);
 *
 * Three things make that work, none of which plain `new Function` gives:
 *  - `db.<name>` is the collection `<name>` (`db.getCollection(name)` for
 *    names that clash with a `Db` method, like the shell);
 *  - every call is awaited, so `r` is the update result and not a Promise —
 *    the shell is synchronous-looking, the driver is not. Done by parsing the
 *    script and wrapping each call outside a nested function in `(await …)`;
 *    awaiting a non-promise (a cursor, a number) is harmless;
 *  - several statements, `const`/`let`, `print`/`printjson`, and the value of
 *    the last expression statement is the result, as in the shell.
 * Plus the shell's constructors (`ObjectId("…")`, `ISODate("…")`,
 * `NumberLong`, `NumberInt`, `NumberDecimal`, `UUID`) and its old collection
 * helpers (`count`, `insert`, `update`, `remove`, `find(filter, projection)`).
 *
 * Electron-free so it can be unit-tested. The code still runs in the main
 * process with full privileges — see the `run-query` note in CLAUDE.md.
 */
import { parse } from 'acorn';
import { ObjectId, Long, Int32, Decimal128, UUID, type Db } from 'mongodb';
import { serializeDoc } from './serialize';

type Insertion = { pos: number; text: string; rank: number };

const FUNCTION_NODES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/**
 * Script → async function body. Exported for the tests: what the transform
 * produces is the contract, the evaluation just runs it.
 */
export function transformShell(code: string): string {
  let ast: any;
  try {
    ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true });
  } catch (e: any) {
    throw new SyntaxError(`${e.message}`);
  }
  const ins: Insertion[] = [];

  const visit = (node: any) => {
    if (!node || typeof node.type !== 'string') return;
    // Inside a callback `await` is not allowed (the function is not async) —
    // the code there is left exactly as written.
    if (FUNCTION_NODES.has(node.type)) return;
    if (node.type === 'ExpressionStatement') {
      // `(await …)` at the start of a statement could glue onto the previous
      // line when it has no semicolon: `x = 1\n(await f())` is `1(…)`.
      ins.push({ pos: node.start, text: ';', rank: 0 });
    }
    if (node.type === 'CallExpression' || node.type === 'ChainExpression') {
      ins.push({ pos: node.start, text: '(await ', rank: 2 });
      ins.push({ pos: node.end, text: ')', rank: 2 });
      // An optional chain is awaited as a whole: a paren inside it would cut
      // the short-circuit in two.
      if (node.type === 'ChainExpression') return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  };
  ast.body.forEach(visit);

  // The last expression statement is the result, like the shell's echo.
  const last = ast.body[ast.body.length - 1];
  // Wrapped at the statement, not the expression: `({ a: 1 })` starts with a
  // paren the expression does not include, and `return` must go outside it.
  if (last?.type === 'ExpressionStatement') {
    const end = code[last.end - 1] === ';' ? last.end - 1 : last.end;
    ins.push({ pos: last.start, text: 'return (', rank: 1 });
    ins.push({ pos: end, text: ')', rank: 3 });
  }

  // Applied back to front so earlier positions stay valid. At one position the
  // openers go outermost first (`;` then `return (` then `(await `), and the
  // closers are all `)` — their order there does not matter.
  ins.sort((a, b) => b.pos - a.pos || b.rank - a.rank);
  let out = code;
  for (const i of ins) out = out.slice(0, i.pos) + i.text + out.slice(i.pos);
  return out;
}

// ── The shell's objects ──────────────────────────────────────────────────────

const FIND_OPTIONS = new Set([
  'projection', 'sort', 'limit', 'skip', 'hint', 'collation', 'maxTimeMS', 'batchSize',
  'comment', 'min', 'max', 'returnKey', 'showRecordId', 'allowDiskUse', 'let', 'session',
]);
/** The shell's second `find` argument is a projection; the driver's is options. Both are accepted. */
const findOptions = (second: any) => {
  if (second == null) return undefined;
  if (typeof second === 'object' && Object.keys(second).some(k => FIND_OPTIONS.has(k))) return second;
  return { projection: second };
};

/** A cursor that also speaks the shell: `pretty()`, `count()`, `size()`, `itcount()`. */
function shellCursor(cursor: any, col: any, filter: any): any {
  const proxy: any = new Proxy(cursor, {
    get(target, prop) {
      if (prop === 'then') return undefined;
      if (prop === 'pretty') return () => proxy;
      if (prop === 'count' || prop === 'size') return () => col.countDocuments(filter ?? {});
      if (prop === 'itcount') return async () => (await target.toArray()).length;
      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function') return value;
      // limit()/sort()/… return the cursor itself: hand back the proxy instead,
      // or `.limit(5).pretty()` would lose the shell methods halfway.
      return (...args: any[]) => {
        const r = value.apply(target, args);
        return r === target ? proxy : r;
      };
    },
  });
  return proxy;
}

function shellCollection(col: any): any {
  return new Proxy(col, {
    get(target, prop) {
      if (prop === 'then') return undefined;
      switch (prop) {
        case 'find': return (filter?: any, second?: any) => shellCursor(target.find(filter ?? {}, findOptions(second)), target, filter);
        case 'findOne': return (filter?: any, second?: any) => target.findOne(filter ?? {}, findOptions(second));
        case 'count': return (filter?: any, opts?: any) => target.countDocuments(filter ?? {}, opts);
        case 'insert': return (docs: any, opts?: any) => Array.isArray(docs) ? target.insertMany(docs, opts) : target.insertOne(docs, opts);
        case 'remove': return (filter: any, justOne?: any) =>
          (justOne === true || justOne?.justOne) ? target.deleteOne(filter ?? {}) : target.deleteMany(filter ?? {});
        case 'update': return (filter: any, update: any, opts: any = {}) => {
          const { multi, ...rest } = opts ?? {};
          return multi ? target.updateMany(filter, update, rest) : target.updateOne(filter, update, rest);
        };
        case 'getName': return () => target.collectionName;
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * `db` for the script. Names a `Db` already has (`collection`, `command`,
 * `stats`…) keep their driver meaning; any other name is a collection.
 */
export function shellDb(db: Db, sibling: (name: string) => Db): any {
  return new Proxy(db as any, {
    get(target, prop) {
      if (typeof prop === 'symbol') return Reflect.get(target, prop, target);
      if (prop === 'then') return undefined;
      switch (prop) {
        case 'getCollection': return (name: string) => shellCollection(target.collection(name));
        case 'collection': return (name: string, opts?: any) => shellCollection(target.collection(name, opts));
        case 'getName': return () => target.databaseName;
        case 'getSiblingDB': return (name: string) => shellDb(sibling(name), sibling);
        case 'getCollectionNames': return async () =>
          (await target.listCollections({}, { nameOnly: true }).toArray()).map((c: any) => c.name).sort();
      }
      if (prop in target) {
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return shellCollection(target.collection(prop));
    },
  });
}

const show = (v: any, indent?: number): string =>
  typeof v === 'string' ? v : JSON.stringify(serializeDoc(v), null, indent) ?? String(v);

export interface ShellRun {
  /** The last expression's value, cursors drained, BSON serialized. */
  result: any;
  /** What `print`/`printjson` wrote, one entry per call. */
  output: string[];
}

/**
 * Run a script. `db` is the handle to use (already read-only-guarded when it
 * has to be) and `sibling` opens another database the same way.
 * `drain: false` keeps a cursor as it is, for the explain handler.
 */
export async function runShell(code: string, db: Db, sibling: (name: string) => Db, opts: { drain?: boolean } = {}): Promise<{ raw: any; output: string[] }> {
  const output: string[] = [];
  const globals: Record<string, any> = {
    db: shellDb(db, sibling),
    print: (...args: any[]) => { output.push(args.map(a => show(a)).join(' ')); },
    printjson: (v: any) => { output.push(show(v, 2)); },
    ObjectId: (hex?: string) => (hex === undefined ? new ObjectId() : new ObjectId(hex)),
    ISODate: (s?: string) => (s === undefined ? new Date() : new Date(s)),
    NumberLong: (v: any) => Long.fromString(String(v)),
    NumberInt: (v: any) => new Int32(Number(v)),
    NumberDecimal: (v: any) => Decimal128.fromString(String(v)),
    UUID: (s?: string) => (s === undefined ? new UUID() : new UUID(s)),
    sleep: (ms: number) => new Promise(r => setTimeout(r, ms)),
  };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const fn = new AsyncFunction(...Object.keys(globals), transformShell(code));
  let raw = await fn(...Object.values(globals));
  if (opts.drain !== false && raw != null && typeof raw.toArray === 'function') raw = await raw.toArray();
  return { raw, output };
}

/** `runShell`, serialized for the renderer. */
export async function runShellSerialized(code: string, db: Db, sibling: (name: string) => Db): Promise<ShellRun> {
  const { raw, output } = await runShell(code, db, sibling);
  const result = raw === undefined ? undefined
    : Array.isArray(raw) ? raw.map(v => serializeDoc(v)) : serializeDoc(raw);
  return { result, output };
}
