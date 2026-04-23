import { describe, it, expect } from 'vitest';
import { serializeDoc } from '../serialize';

describe('serializeDoc', () => {
  it('passes primitives through unchanged', () => {
    expect(serializeDoc(42)).toBe(42);
    expect(serializeDoc('hello')).toBe('hello');
    expect(serializeDoc(true)).toBe(true);
    expect(serializeDoc(null)).toBe(null);
    expect(serializeDoc(undefined)).toBe(undefined);
  });

  it('serializes plain objects', () => {
    expect(serializeDoc({ a: 1, b: 'x' })).toEqual({ a: 1, b: 'x' });
  });

  it('serializes nested objects', () => {
    expect(serializeDoc({ a: { b: { c: 3 } } })).toEqual({ a: { b: { c: 3 } } });
  });

  it('serializes arrays', () => {
    expect(serializeDoc([1, 2, 3])).toEqual([1, 2, 3]);
    expect(serializeDoc([{ x: 1 }, { x: 2 }])).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it('converts Date to ISO string', () => {
    const d = new Date('2024-01-15T10:00:00.000Z');
    expect(serializeDoc(d)).toBe('2024-01-15T10:00:00.000Z');
    expect(serializeDoc({ created: d })).toEqual({ created: '2024-01-15T10:00:00.000Z' });
  });

  it('converts Buffer to hex string', () => {
    const buf = Buffer.from('hello');
    expect(serializeDoc(buf)).toBe('68656c6c6f');
  });

  it('converts functions to [Function]', () => {
    expect(serializeDoc(() => {})).toBe('[Function]');
    expect(serializeDoc({ fn: () => {} })).toEqual({ fn: '[Function]' });
  });

  it('handles circular references without throwing', () => {
    const obj: any = { a: 1 };
    obj.self = obj;
    const result = serializeDoc(obj);
    expect(result.a).toBe(1);
    expect(result.self).toBe('[Circular]');
  });

  it('handles circular references inside arrays without throwing', () => {
    const obj: any = { x: 1 };
    obj.loop = obj;
    const arr = [obj];
    const result = serializeDoc(arr);
    expect(result[0].x).toBe(1);
    expect(result[0].loop).toBe('[Circular]');
  });

  it('returns [MaxDepth] beyond depth 50', () => {
    let deep: any = { val: 'bottom' };
    for (let i = 0; i < 55; i++) deep = { child: deep };
    const result = serializeDoc(deep);
    let node = result;
    let depth = 0;
    while (node && typeof node === 'object' && node.child) {
      node = node.child;
      depth++;
      if (depth > 60) break;
    }
    expect(node).toBe('[MaxDepth]');
  });

  it('converts BSON-like objects (with _bsontype) to string', () => {
    const fakeObjectId = { _bsontype: 'ObjectId', toString: () => '507f1f77bcf86cd799439011' };
    expect(serializeDoc(fakeObjectId)).toBe('507f1f77bcf86cd799439011');
    expect(serializeDoc({ _id: fakeObjectId })).toEqual({ _id: '507f1f77bcf86cd799439011' });
  });

  it('each array element gets independent circular ref tracking', () => {
    const obj: any = { v: 1 };
    obj.self = obj;
    const arr = [obj, obj];
    const result = serializeDoc(arr);
    expect(result[0].v).toBe(1);
    expect(result[1].v).toBe(1);
  });
});
