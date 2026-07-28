import { describe, it, expect } from 'vitest';
import { parseStudio3TExport, displayLabel } from '../utils/uriImport';

const SAMPLE = `// Connections Exported from Studio 3T -- https://studio3t.com/
// Exported on Jul 28, 2026 12:45:44 PM

// admin
mongodb://user1:pw1@td-mongo01-s1:27017,td-mongo02-s1:27017/admin?3t.group=CAST,svil&retryWrites=true&replicaSet=&readPreference=primary&authSource=admin&3t.uriVersion=3&3t.connection.name=admin&3t.defaultColor=1,131,14&3t.databases=admin

// admin
mongodb://user2:pw2@10.0.0.1:27017/admin?3t.group=CAST,prod&connectTimeoutMS=10000&authSource=admin&3t.connection.name=prod-cluster&3t.defaultColor=211,47,39
`;

describe('parseStudio3TExport', () => {
  it('parses every URI line and ignores the export header', () => {
    const parsed = parseStudio3TExport(SAMPLE);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('admin');
    expect(parsed[1].name).toBe('prod-cluster'); // 3t.connection.name wins over the comment
  });

  it('strips 3t.* params and empty-valued params from the stored URI', () => {
    const [first] = parseStudio3TExport(SAMPLE);
    expect(first.uri).not.toContain('3t.');
    expect(first.uri).not.toContain('replicaSet=');
    expect(first.uri).toContain('mongodb://user1:pw1@td-mongo01-s1:27017,td-mongo02-s1:27017/admin');
    expect(first.uri).toContain('authSource=admin');
    expect(first.uri).toContain('retryWrites=true');
  });

  it('maps 3t.group to a folder path and 3t.defaultColor to hex', () => {
    const parsed = parseStudio3TExport(SAMPLE);
    expect(parsed[0].folderPath).toEqual(['CAST', 'svil']);
    expect(parsed[0].color).toBe('#01830e');
    expect(parsed[1].folderPath).toEqual(['CAST', 'prod']);
    expect(parsed[1].color).toBe('#d32f27');
  });

  it('takes the database from the URI path', () => {
    expect(parseStudio3TExport(SAMPLE)[0].database).toBe('admin');
  });

  it('falls back to the preceding comment, then to the host list, for the name', () => {
    const noName = parseStudio3TExport('// staging box\nmongodb://h1:27017/?authSource=admin');
    expect(noName[0].name).toBe('staging box');

    const noComment = parseStudio3TExport('mongodb://h9:27017/?authSource=admin');
    expect(noComment[0].name).toBe('h9:27017');
  });

  it('handles mongodb+srv, missing query strings and blank input', () => {
    const srv = parseStudio3TExport('mongodb+srv://u:p@cluster.example.net/mydb');
    expect(srv[0].uri).toBe('mongodb+srv://u:p@cluster.example.net/mydb');
    expect(srv[0].database).toBe('mydb');
    expect(srv[0].folderPath).toEqual([]);
    expect(srv[0].color).toBeUndefined();

    expect(parseStudio3TExport('')).toEqual([]);
    expect(parseStudio3TExport('// only a comment\n\n')).toEqual([]);
  });

  it('ignores malformed colors instead of producing a broken hex', () => {
    const [c] = parseStudio3TExport('mongodb://h:27017/?3t.defaultColor=999,0');
    expect(c.color).toBeUndefined();
  });

  it('labels duplicates by folder path', () => {
    const parsed = parseStudio3TExport(SAMPLE);
    expect(displayLabel(parsed[0])).toBe('CAST / svil / admin');
    expect(displayLabel({ name: 'solo', uri: '', folderPath: [] })).toBe('solo');
  });
});
