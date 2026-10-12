import { describe, it, expect } from 'vitest';
import { prettyDoc, normalizePretty, parseEditable, validateJson, formatJson } from '../utils/editableJson';

const OID = 'a'.repeat(24);
const ISO = '2022-04-26T16:18:05.988Z';
const DOC = { _id: { $oid: OID }, insertDate: { $date: ISO }, nested: { d: { $date: ISO } }, arr: [{ $date: ISO }] };

describe('prettyDoc', () => {
  it('shows {$date} as ISODate("…") and {$oid} as ObjectId("…")', () => {
    const text = prettyDoc(DOC);
    expect(text).toContain(`"insertDate": ISODate("${ISO}")`);
    expect(text).toContain(`"_id": ObjectId("${OID}")`);
    expect(text).not.toContain('$date');
  });

  it('marks dates in nested objects and arrays too', () => {
    const text = prettyDoc(DOC);
    expect(text).toContain(`"d": ISODate("${ISO}")`);
    expect(text).toContain(`    ISODate("${ISO}")`);
  });
});

describe('parseEditable', () => {
  it('round-trips what prettyDoc printed back to {$date}', () => {
    expect(parseEditable(prettyDoc(DOC))).toEqual(DOC);
  });

  it('reads an ISODate pasted from Studio 3T (+0000, single or double quotes)', () => {
    expect(parseEditable('{"a": ISODate("2022-04-26T16:18:05.988+0000")}'))
      .toEqual({ a: { $date: '2022-04-26T16:18:05.988+0000' } });
    expect(parseEditable(`{"a": ISODate('${ISO}')}`)).toEqual({ a: { $date: ISO } });
    expect(parseEditable(`{"a": ISODate( "${ISO}" )}`)).toEqual({ a: { $date: ISO } });
  });

  it('a plain ISO string stays a string — only ISODate(…) is a date', () => {
    expect(parseEditable(`{"a": "${ISO}"}`)).toEqual({ a: ISO });
  });
});

describe('normalizePretty', () => {
  it('turns shell helpers into Extended JSON', () => {
    expect(normalizePretty(`ObjectId("${OID}")`)).toBe(`{"$oid":"${OID}"}`);
    expect(normalizePretty(`ISODate("${ISO}")`)).toBe(`{"$date":"${ISO}"}`);
  });
});

describe('validateJson / formatJson', () => {
  it('accepts ISODate in the editor text', () => {
    expect(validateJson(`{"a": ISODate("${ISO}")}`)).toBeNull();
  });

  it('reports broken JSON', () => {
    expect(validateJson('{"a": ')).not.toBeNull();
  });

  it('formats and keeps ISODate', () => {
    expect(formatJson(`{"a":ISODate("${ISO}")}`)).toBe(`{\n  "a": ISODate("${ISO}")\n}`);
  });

  it('leaves invalid text untouched', () => {
    expect(formatJson('{"a": ')).toBe('{"a": ');
  });
});
