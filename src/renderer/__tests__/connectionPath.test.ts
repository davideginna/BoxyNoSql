import { describe, it, expect } from 'vitest';
import { folderBreadcrumb, folderPathLabel, serverLabel, nodeTooltip, type Folder } from '../utils/connectionPath';

const folders: Folder[] = [
  { id: 'root', name: 'cochise' },
  { id: 'child', name: 'svil', parentId: 'root' },
  { id: 'orphan', name: 'lost', parentId: 'gone' },
];

describe('folderBreadcrumb', () => {
  it('walks root to leaf', () => {
    expect(folderBreadcrumb('child', folders).map(f => f.name)).toEqual(['cochise', 'svil']);
  });

  it('stops at a missing parent instead of dropping the folder', () => {
    expect(folderBreadcrumb('orphan', folders).map(f => f.name)).toEqual(['lost']);
  });

  it('is empty for an unknown folder', () => {
    expect(folderBreadcrumb('nope', folders)).toEqual([]);
  });

  it('survives a parent cycle', () => {
    const looped: Folder[] = [{ id: 'a', name: 'a', parentId: 'b' }, { id: 'b', name: 'b', parentId: 'a' }];
    expect(folderBreadcrumb('a', looped).map(f => f.name)).toEqual(['b', 'a']);
  });
});

describe('folderPathLabel', () => {
  it('joins the chain', () => {
    expect(folderPathLabel('child', folders)).toBe('cochise / svil');
  });

  it('is empty for a connection at the root', () => {
    expect(folderPathLabel(undefined, folders)).toBe('');
  });
});

describe('serverLabel', () => {
  it('keeps host and port', () => {
    expect(serverLabel('mongodb://localhost:27017')).toBe('localhost:27017');
  });

  it('shows the username but never the password', () => {
    expect(serverLabel('mongodb://admin:secret@localhost:27017/?authSource=admin')).toBe('admin@localhost:27017');
  });

  it('decodes an escaped username', () => {
    expect(serverLabel('mongodb://us%40er:pw@host:27017')).toBe('us@er@host:27017');
  });

  it('keeps every host of a replica set', () => {
    expect(serverLabel('mongodb://h1:27017,h2:27017/db?replicaSet=rs0')).toBe('h1:27017,h2:27017');
  });

  it('handles mongodb+srv without a port', () => {
    expect(serverLabel('mongodb+srv://user:pw@cluster0.abc.mongodb.net/test')).toBe('user@cluster0.abc.mongodb.net');
  });

  it('is empty rather than wrong for junk', () => {
    expect(serverLabel('')).toBe('');
    expect(serverLabel('   ')).toBe('');
  });
});

describe('nodeTooltip', () => {
  it('names the whole path down to the collection', () => {
    expect(nodeTooltip({
      connection: 'prod', folder: 'cochise / svil', server: 'admin@localhost:27017',
      database: 'testdb', collection: 'users',
    })).toBe([
      'Connection: prod',
      'Folder: cochise / svil',
      'Server: admin@localhost:27017',
      'Database: testdb',
      'Collection: users',
    ].join('\n'));
  });

  it('drops the lines it has nothing to say about', () => {
    expect(nodeTooltip({ connection: 'prod', server: 'localhost:27017' }))
      .toBe('Connection: prod\nServer: localhost:27017');
  });
});
