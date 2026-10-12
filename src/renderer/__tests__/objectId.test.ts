import { describe, it, expect } from 'vitest';
import { parseObjectId, objectIdTooltip, oidTitle } from '../utils/objectId';

// 0x6262a7cd = 1650632653 → 2022-04-22T13:04:13Z; machine 0x1f2b3c, pid 0x4d5e, counter 0x6f7a8b.
const OID = '6262a7cd1f2b3c4d5e6f7a8b';

describe('parseObjectId', () => {
  it('splits timestamp, machine, pid and counter', () => {
    const info = parseObjectId(OID)!;
    expect(info.timestamp).toBe(0x6262a7cd);
    expect(info.created.toISOString()).toBe('2022-04-22T13:04:13.000Z');
    expect(info.machine).toBe(0x1f2b3c);
    expect(info.pid).toBe(0x4d5e);
    expect(info.counter).toBe(0x6f7a8b);
  });

  it('accepts upper-case hex', () => {
    expect(parseObjectId(OID.toUpperCase())?.counter).toBe(0x6f7a8b);
  });

  it('refuses anything that is not 24 hex characters', () => {
    expect(parseObjectId('custom-id')).toBeNull();
    expect(parseObjectId(OID.slice(1))).toBeNull();
    expect(parseObjectId('z'.repeat(24))).toBeNull();
  });
});

describe('objectIdTooltip', () => {
  it('lists every part, with hex and decimal', () => {
    const t = objectIdTooltip(OID)!;
    expect(t).toContain(`ObjectId("${OID}")`);
    expect(t).toContain('(2022-04-22T13:04:13Z)');
    expect(t).toContain('Machine: 0x1f2b3c (2042684)');
    expect(t).toContain('PID: 0x4d5e (19806)');
    expect(t).toContain('Counter: 0x6f7a8b (7305867)');
  });

  it('pads small values to the field width', () => {
    expect(objectIdTooltip('000000010000010001000001')).toContain('PID: 0x0001 (1)');
  });

  it('is null for a non-ObjectId', () => {
    expect(objectIdTooltip('nope')).toBeNull();
  });
});

describe('oidTitle', () => {
  it('only answers for {$oid} values', () => {
    expect(oidTitle({ $oid: OID })).toContain('Counter');
    expect(oidTitle({ $oid: 'custom' })).toBeUndefined();
    expect(oidTitle('text')).toBeUndefined();
    expect(oidTitle(null)).toBeUndefined();
  });
});
