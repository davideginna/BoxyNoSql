export function serializeDoc(val: any, seen = new Set<any>(), depth = 0): any {
  if (depth > 50) return '[MaxDepth]';
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object' && typeof val !== 'function') return val;
  if (typeof val === 'function') return '[Function]';
  if (val._bsontype) return val.toString();
  if (val instanceof Date) return val.toISOString();
  if (Buffer.isBuffer(val)) return val.toString('hex');
  if (seen.has(val)) return '[Circular]';
  seen.add(val);
  if (Array.isArray(val)) return val.map(v => serializeDoc(v, new Set(), 0));
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    try { out[k] = serializeDoc(v, seen, depth + 1); } catch { out[k] = '[Error]'; }
  }
  return out;
}
