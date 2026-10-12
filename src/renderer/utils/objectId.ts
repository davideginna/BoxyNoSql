/**
 * What an ObjectId says about itself. Its 12 bytes are a 4-byte creation time
 * (seconds since the epoch), 5 bytes historically split as 3 of machine id and
 * 2 of process id, and a 3-byte counter. Since the MongoDB 3.4-era drivers the
 * middle 5 bytes are a random value per process, so "machine" and "pid" only
 * mean what they say on ids from older drivers — the tooltip says so too.
 */

export interface ObjectIdInfo {
  created: Date;
  /** Seconds since the epoch, as stored. */
  timestamp: number;
  machine: number;
  pid: number;
  counter: number;
}

const OID_RE = /^[0-9a-f]{24}$/i;

export function parseObjectId(hex: string): ObjectIdInfo | null {
  if (typeof hex !== 'string' || !OID_RE.test(hex)) return null;
  const part = (from: number, to: number) => parseInt(hex.slice(from * 2, to * 2), 16);
  const timestamp = part(0, 4);
  return {
    created: new Date(timestamp * 1000),
    timestamp,
    machine: part(4, 7),
    pid: part(7, 9),
    counter: part(9, 12),
  };
}

const hexOf = (n: number, bytes: number) => '0x' + n.toString(16).padStart(bytes * 2, '0');

/** Multi-line `title` text for an ObjectId, or null when `hex` is not one. */
export function objectIdTooltip(hex: string): string | null {
  const info = parseObjectId(hex);
  if (!info) return null;
  return [
    `ObjectId("${hex}")`,
    `Created: ${info.created.toLocaleString()} (${info.created.toISOString().replace('.000Z', 'Z')})`,
    `Timestamp: ${info.timestamp}`,
    `Machine: ${hexOf(info.machine, 3)} (${info.machine})`,
    `PID: ${hexOf(info.pid, 2)} (${info.pid})`,
    `Counter: ${hexOf(info.counter, 3)} (${info.counter})`,
    'Machine and PID are a random per-process value on ids from current drivers.',
  ].join('\n');
}

/** Tooltip for any value that is an `{$oid}`; undefined otherwise, so it can go straight into `title`. */
export function oidTitle(value: any): string | undefined {
  return value && typeof value === 'object' && '$oid' in value ? objectIdTooltip(String(value.$oid)) ?? undefined : undefined;
}
