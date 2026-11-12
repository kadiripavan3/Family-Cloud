import type { Change, ChangeStore } from './types';

/**
 * Waiting changes in a browser (the web preview): kept in the browser's own storage, where the phone uses
 * SQLite. The name they are kept under carries its version; when the shape of a change changes, the name does.
 */
const KEY = 'homeport.changes.v1';

function read(): Change[] {
  try {
    const stored = globalThis.localStorage?.getItem(KEY);
    const changes: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(changes) ? (changes as Change[]) : [];
  } catch {
    return [];
  }
}

function write(changes: Change[]) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(changes));
  } catch {
    // Storage that is full or switched off: the change still lives for as long as the page is open.
  }
}

export const changeStore: ChangeStore = {
  async load(owner) {
    return read()
      .filter((change) => change.owner === owner)
      .sort((a, b) => a.seq - b.seq);
  },

  async save(change) {
    write([...read().filter((other) => other.key !== change.key), change]);
  },

  async remove(keys) {
    if (keys.length === 0) return;
    write(read().filter((change) => !keys.includes(change.key)));
  },

  async removeAll(owner) {
    write(read().filter((change) => change.owner !== owner));
  },
};
