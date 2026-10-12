import { ObjectId } from 'mongodb';

/**
 * Inverse of `serializeDoc()`: revives the Extended JSON wrappers the renderer
 * sends back (`{$oid}` → ObjectId, `{$date}` → Date) in filters, documents and
 * pipelines. Kept out of `main.ts` so it can be unit-tested without Electron.
 */
export function fromExtJSON(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(fromExtJSON);
  // Already revived (a filter built with `new Date()`): walking its entries would turn it into `{}`.
  if (val instanceof Date || val._bsontype) return val;
  if ('$oid' in val) { try { return new ObjectId(val.$oid); } catch { return val.$oid; } }
  if ('$date' in val) {
    const raw = val.$date;
    // Canonical Extended JSON wraps the millis: {$date: {$numberLong: "…"}}.
    const d = new Date(raw && typeof raw === 'object' && '$numberLong' in raw ? Number(raw.$numberLong) : raw);
    if (isNaN(d.getTime())) throw new Error(`Invalid date: ${JSON.stringify(raw)}`);
    return d;
  }
  const out: any = {};
  for (const [k, v] of Object.entries(val)) out[k] = fromExtJSON(v);
  return out;
}
