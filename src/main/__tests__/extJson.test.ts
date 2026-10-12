import { describe, it, expect } from 'vitest';
import { ObjectId } from 'mongodb';
import { fromExtJSON } from '../extJson';
import { serializeDoc } from '../serialize';

const OID = '6262a7cd1f2b3c4d5e6f7a8b';
const ISO = '2022-04-26T16:18:05.988Z';

describe('fromExtJSON — dates', () => {
  it('revives {$date} as a real Date', () => {
    const d = fromExtJSON({ $date: ISO });
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString()).toBe(ISO);
  });

  it('accepts the Studio 3T offset form +0000', () => {
    expect(fromExtJSON({ $date: '2022-04-26T16:18:05.988+0000' }).toISOString()).toBe(ISO);
  });

  it('accepts canonical Extended JSON {$date: {$numberLong}}', () => {
    const ms = String(Date.parse(ISO));
    expect(fromExtJSON({ $date: { $numberLong: ms } }).toISOString()).toBe(ISO);
  });

  it('refuses an invalid date instead of storing garbage', () => {
    expect(() => fromExtJSON({ $date: 'not a date' })).toThrow(/Invalid date/);
  });

  it('leaves an already-revived Date alone (date filters from the query builder)', () => {
    const d = new Date(ISO);
    const filter = fromExtJSON({ insertDate: { $gt: d } });
    expect(filter.insertDate.$gt).toBe(d);
  });
});

describe('fromExtJSON — other values', () => {
  it('revives {$oid} as an ObjectId', () => {
    const id = fromExtJSON({ $oid: OID });
    expect(id).toBeInstanceOf(ObjectId);
    expect(id.toString()).toBe(OID);
  });

  it('keeps a non-hex {$oid} as the raw string', () => {
    expect(fromExtJSON({ $oid: 'custom-id' })).toBe('custom-id');
  });

  it('leaves an ObjectId alone', () => {
    const id = new ObjectId(OID);
    expect(fromExtJSON(id)).toBe(id);
  });

  it('passes primitives and null through', () => {
    expect(fromExtJSON(null)).toBeNull();
    expect(fromExtJSON(undefined)).toBeUndefined();
    expect(fromExtJSON(3)).toBe(3);
    expect(fromExtJSON('x')).toBe('x');
    expect(fromExtJSON(true)).toBe(true);
  });

  it('walks nested objects and arrays', () => {
    const out = fromExtJSON({ a: { b: [{ $date: ISO }, { $oid: OID }, 1] } });
    expect(out.a.b[0]).toBeInstanceOf(Date);
    expect(out.a.b[1]).toBeInstanceOf(ObjectId);
    expect(out.a.b[2]).toBe(1);
  });
});

describe('serializeDoc → fromExtJSON round trip', () => {
  it('gives back the same types it started from', () => {
    const original = {
      _id: new ObjectId(OID),
      insertDate: new Date(ISO),
      nested: { d: new Date(0) },
      arr: [new Date(ISO), 'text', 5],
      name: 'x',
    };
    // Through JSON too, like the IPC + editor text in between.
    const back = fromExtJSON(JSON.parse(JSON.stringify(serializeDoc(original))));
    expect(back._id).toBeInstanceOf(ObjectId);
    expect(back._id.toString()).toBe(OID);
    expect(back.insertDate).toBeInstanceOf(Date);
    expect(back.insertDate.getTime()).toBe(original.insertDate.getTime());
    expect(back.nested.d).toBeInstanceOf(Date);
    expect(back.arr[0]).toBeInstanceOf(Date);
    expect(back.arr.slice(1)).toEqual(['text', 5]);
    expect(back.name).toBe('x');
  });
});
