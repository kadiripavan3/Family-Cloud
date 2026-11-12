import type { Query, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { keep } from '@/lib/keep';

/**
 * What was read stays on the phone, so the app opens without a connection: who you are, and what you looked
 * at lately. It is the data layer's own memory written down, a little after each change, and put back before
 * the first request of the next run.
 *
 * It belongs to one sign-in. It is written with the account it was read for and only put back for that same
 * account, and it is removed when the person signs out.
 */
const KEY = 'homeport.kept.v1';

/** How long something that was read stays on the phone without being read again. */
export const KEEP_FOR_MS = 7 * 24 * 60 * 60 * 1000;
/** How many answers are kept at most, and how much text. The newest stay. */
const MOST = 60;
const MOST_TEXT = 1_500_000;
/** How long after a change the phone's copy is written. Changes in between are written together. */
const WRITE_AFTER_MS = 3000;

/** Always kept, whatever else was read since: without these the app can't open. */
const NEEDED = ['/v1/me'];
/**
 * Never kept, by how the address starts. Nothing yet. What belongs here as it is built: searches, addresses
 * that hold a one-time invitation, and everything of the Vault, which must not be written to the phone in
 * the clear.
 */
const NOT_KEPT: string[] = [];

type KeptQuery = { key: readonly unknown[]; data: unknown; at: number };
type Kept = { owner: string; queries: KeptQuery[] };

/** The API address a request was for: the part of its key that looks like one. */
function addressOf(query: Pick<Query, 'queryKey'>): string | null {
  const address = query.queryKey.find((part) => typeof part === 'string' && part.startsWith('/'));
  return typeof address === 'string' ? address : null;
}

function mayKeep(address: string): boolean {
  return !NOT_KEPT.some((start) => address.startsWith(start));
}

/** What to write: the needed answers first, then the newest, as text, within the limits. */
export function snapshot(client: QueryClient, owner: string, now = Date.now()): string {
  const queries = client
    .getQueryCache()
    .getAll()
    .flatMap((query) => {
      const address = addressOf(query);
      const { data, dataUpdatedAt: at } = query.state;
      if (!address || data === undefined || !mayKeep(address) || now - at > KEEP_FOR_MS) return [];
      return [{ needed: NEEDED.includes(address), at, kept: { key: query.queryKey, data, at } satisfies KeptQuery }];
    })
    .sort((a, b) => Number(b.needed) - Number(a.needed) || b.at - a.at)
    .slice(0, MOST);
  const texts: string[] = [];
  let size = 0;
  for (const { kept } of queries) {
    const text = JSON.stringify(kept);
    if (size + text.length > MOST_TEXT) continue;
    size += text.length;
    texts.push(text);
  }
  return `{"owner":${JSON.stringify(owner)},"queries":[${texts.join(',')}]}`;
}

/**
 * Puts back what was kept for this account at the last run. Call it once, before the first request. For
 * anyone else (or nobody) the phone's copy is removed instead.
 */
export async function restoreKept(client: QueryClient, owner: string | null, now = Date.now()): Promise<void> {
  const stored = await keep.get(KEY);
  if (!stored) return;
  try {
    const kept = JSON.parse(stored) as Partial<Kept>;
    if (!owner || kept.owner !== owner || !Array.isArray(kept.queries)) {
      await keep.remove(KEY);
      return;
    }
    for (const query of kept.queries) {
      if (!Array.isArray(query.key) || query.data === undefined || typeof query.at !== 'number' || now - query.at > KEEP_FOR_MS) continue;
      // Newer than what the phone kept? Then it stays. (Nothing has been asked yet when this runs at start-up.)
      if ((client.getQueryState(query.key)?.dataUpdatedAt ?? 0) >= query.at) continue;
      client.setQueryData(query.key, query.data, { updatedAt: query.at });
    }
    // It is shown at once, and every bit of it is asked for again as soon as a screen needs it: the app was
    // away, so even what was read a moment before it closed may have changed.
    await client.invalidateQueries({ refetchType: 'none' });
  } catch {
    // A copy that can't be read is as good as none.
    await keep.remove(KEY);
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Writes what is loaded to the phone, a little after each change and when the app is put away. `owner` says
 * whose it is right now (null while nobody is signed in: then nothing is written). Returns how to stop.
 */
export function keepWriting(client: QueryClient, owner: () => string | null): () => void {
  const write = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const whose = owner();
    if (whose) void keep.set(KEY, snapshot(client, whose));
  };
  const stopCache = client.getQueryCache().subscribe((event) => {
    const changed = event.type === 'removed' || (event.type === 'updated' && event.action.type === 'success');
    if (changed && !timer) timer = setTimeout(write, WRITE_AFTER_MS);
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state !== 'active' && timer) write();
  });
  return () => {
    stopCache();
    appState.remove();
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

/** Removes the phone's copy: the person signed out. Anything about to be written is dropped as well. */
export async function forgetKept(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  await keep.remove(KEY);
}
