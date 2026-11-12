import * as SQLite from 'expo-sqlite';

import type { Change, ChangeStore } from './types';

/**
 * Waiting changes on the phone: one row each in a small SQLite database, so a tick made in a shop with no
 * signal is still there when the app is opened again at home.
 */
let opened: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * The version of what is kept, written into the database itself. When the table or the shape of a change
 * has to change, raise this and add the step that brings an older database up to it (`if (version < 2) …`).
 */
const VERSION = 1;

function database(): Promise<SQLite.SQLiteDatabase> {
  opened ??= SQLite.openDatabaseAsync('changes.db').then(async (db) => {
    const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
    if (version < 1) {
      await db.execAsync('CREATE TABLE IF NOT EXISTS changes (key TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, target TEXT NOT NULL, seq INTEGER NOT NULL, payload TEXT NOT NULL)');
    }
    if (version < VERSION) await db.execAsync(`PRAGMA user_version = ${VERSION}`);
    return db;
  });
  return opened;
}

export const changeStore: ChangeStore = {
  async load(owner) {
    const db = await database();
    const stored = await db.getAllAsync<{ payload: string }>('SELECT payload FROM changes WHERE owner = ? ORDER BY seq', owner);
    const changes: Change[] = [];
    for (const row of stored) {
      try {
        changes.push(JSON.parse(row.payload) as Change);
      } catch {
        // A row that can't be read is left alone rather than sent broken.
      }
    }
    return changes;
  },

  async save(change) {
    const db = await database();
    await db.runAsync(
      'INSERT INTO changes (key, owner, target, seq, payload) VALUES (?, ?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET owner = excluded.owner, target = excluded.target, seq = excluded.seq, payload = excluded.payload',
      change.key,
      change.owner,
      `${change.target.kind}:${change.target.id}`,
      change.seq,
      JSON.stringify(change),
    );
  },

  async remove(keys) {
    if (keys.length === 0) return;
    const db = await database();
    for (const key of keys) await db.runAsync('DELETE FROM changes WHERE key = ?', key);
  },

  async removeAll(owner) {
    const db = await database();
    await db.runAsync('DELETE FROM changes WHERE owner = ?', owner);
  },
};
