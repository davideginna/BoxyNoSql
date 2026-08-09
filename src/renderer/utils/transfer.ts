/**
 * Wording for copy/paste of a database or a collection.
 *
 * Both ends of the operation can be on different servers, so every message
 * names the connection: "testdb" alone says nothing about which of the two
 * `testdb`s is being moved, or where it is about to land.
 */

export interface TransferItem {
  kind: 'database' | 'collection';
  /** Name of the connection the item was copied from. */
  connectionName: string;
  db: string;
  /** Set for a collection, absent for a database. */
  col?: string;
}

export interface TransferTarget {
  connectionName: string;
  /** Target database — absent when pasting a whole database onto a connection. */
  db?: string;
}

const label = (item: TransferItem) =>
  item.kind === 'collection' ? `${item.db}.${item.col}` : item.db;

/** Toast text right after Ctrl+C. */
export function copiedMessage(item: TransferItem): string {
  const what = item.kind === 'collection' ? 'Collection' : 'Database';
  return `${what} "${label(item)}" copied from "${item.connectionName}"`;
}

export interface TransferConfirm { title: string; message: string; detail: string }

/**
 * The dialog shown *before* anything is written: what is being copied, from
 * where, to where. Copying across connections is the whole point of the
 * feature and also the way to overwrite the wrong server, so the two ends are
 * always spelled out, even when they are the same connection.
 */
export function pasteConfirm(item: TransferItem, target: TransferTarget): TransferConfirm {
  const what = item.kind === 'collection' ? 'collection' : 'database';
  const to = item.kind === 'collection'
    ? `"${target.db}" on "${target.connectionName}"`
    : `"${target.connectionName}"`;
  const sameConnection = item.connectionName === target.connectionName;
  return {
    title: `Copy ${what}`,
    message: `Copy ${what} "${label(item)}" to ${to}?`,
    detail: sameConnection
      ? `From: ${item.connectionName} (same connection)\nTo:   ${target.connectionName}${target.db ? ` / ${target.db}` : ''}`
      : `From: ${item.connectionName} / ${label(item)}\nTo:   ${target.connectionName}${target.db ? ` / ${target.db}` : ''}`,
  };
}
