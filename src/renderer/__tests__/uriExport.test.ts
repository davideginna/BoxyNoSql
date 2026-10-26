import { describe, it, expect } from 'vitest';
import {
  connectionToUri, exportConnections, connectionsInFolder, exportFileName, uriHasPassword,
} from '../utils/uriExport';
import { parseStudio3TExport } from '../utils/uriImport';

const folders = [
  { id: 'f1', name: 'CAST' },
  { id: 'f2', name: 'prod', parentId: 'f1' },
  { id: 'f3', name: 'other' },
];

describe('connectionToUri', () => {
  it('adds name, group and color as 3t.* params', () => {
    const uri = connectionToUri(
      { name: 'prod cluster', uri: 'mongodb://u:p@h1:27017,h2:27017/admin?authSource=admin', folderId: 'f2', color: '#d32f27' },
      folders,
    );
    expect(uri.startsWith('mongodb://u:p@h1:27017,h2:27017/admin?authSource=admin&')).toBe(true);
    expect(uri).toContain('3t.group=CAST,prod');
    expect(uri).toContain('3t.connection.name=prod%20cluster');
    expect(uri).toContain('3t.defaultColor=211,47,39');
  });

  it('inserts the slash a bare host needs before the query string', () => {
    expect(connectionToUri({ name: 'local', uri: 'mongodb://localhost:27017' }, []))
      .toBe('mongodb://localhost:27017/?3t.connection.name=local');
  });

  it('spells out tls only when the URI does not already say it', () => {
    expect(connectionToUri({ name: 'a', uri: 'mongodb://h', tls: true }, [])).toContain('tls=true');
    const withSsl = connectionToUri({ name: 'a', uri: 'mongodb://h/?ssl=true', tls: true }, []);
    expect(withSsl).not.toContain('tls=true');
  });

  it('replaces a comma in a folder name, which would add a level', () => {
    const uri = connectionToUri({ name: 'a', uri: 'mongodb://h', folderId: 'x' }, [{ id: 'x', name: 'a,b' }]);
    expect(uri).toContain('3t.group=a%20b');
  });
});

describe('export → import round trip', () => {
  it('keeps name, folder path, color, database and TLS settings', () => {
    const text = exportConnections([
      {
        name: 'prod', uri: 'mongodb://u:p%40ss@h1:27017/admin?authSource=admin', folderId: 'f2',
        color: '#01830e', database: 'admin', readOnly: true,
        tls: true, tlsCertificateKeyFile: '/certs/client.pem', tlsCAFile: '/certs/ca.pem',
        tlsAllowInvalidCertificates: true, tlsServername: 'sni.example',
      },
      { name: 'local', uri: 'mongodb://localhost:27017' },
    ], folders);

    const [prod, local] = parseStudio3TExport(text);
    expect(prod).toMatchObject({
      name: 'prod', folderPath: ['CAST', 'prod'], color: '#01830e', database: 'admin', readOnly: true,
      tls: true, tlsCertificateKeyFile: '/certs/client.pem', tlsCAFile: '/certs/ca.pem',
      tlsAllowInvalidCertificates: true, tlsServername: 'sni.example',
    });
    expect(prod.uri).toBe('mongodb://u:p%40ss@h1:27017/admin?authSource=admin&tls=true');
    expect(local).toMatchObject({ name: 'local', folderPath: [], uri: 'mongodb://localhost:27017/' });
    expect(local.readOnly).toBeUndefined();
  });

  it('does not count the header as a connection name', () => {
    const text = exportConnections([{ name: 'x', uri: 'mongodb://h' }], []);
    expect(text.startsWith('// Connections Exported from')).toBe(true);
    expect(parseStudio3TExport(text)).toHaveLength(1);
  });
});

describe('connectionsInFolder', () => {
  it('includes subfolders but not siblings or root connections', () => {
    const conns = [
      { id: 'a', folderId: 'f1' }, { id: 'b', folderId: 'f2' },
      { id: 'c', folderId: 'f3' }, { id: 'd' },
    ];
    expect(connectionsInFolder('f1', conns, folders).map(c => c.id)).toEqual(['a', 'b']);
    expect(connectionsInFolder('f2', conns, folders).map(c => c.id)).toEqual(['b']);
  });
});

describe('helpers', () => {
  it('exportFileName drops characters a file name cannot hold', () => {
    expect(exportFileName('CAST/prod: main')).toBe('CAST_prod_ main.uri');
    expect(exportFileName('  ')).toBe('connections.uri');
  });

  it('uriHasPassword', () => {
    expect(uriHasPassword('mongodb://u:p@h')).toBe(true);
    expect(uriHasPassword('mongodb://u@h')).toBe(false);
    expect(uriHasPassword('mongodb+srv://h.example.net/db')).toBe(false);
  });
});
