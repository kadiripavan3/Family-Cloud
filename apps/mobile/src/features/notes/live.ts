import { type QueryClient, type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useSyncExternalStore } from 'react';

import { ApiError } from '@/api/fetcher';
import { getChecklist, getGetChecklistQueryKey, getGetPageQueryKey, getPage, useGetChecklist, useGetPage } from '@/api/generated/homeport';
import { isGone } from '@/lib/loading';

import { useWaiting } from './changes/outbox';
import type { Target } from './changes/types';

/** How often an open list or page asks again, so what another person does shows up by itself. */
export const ASK_AGAIN_MS = 4000;

/**
 * Asks for a list or a page the way the API likes to be asked again and again: with the version of the
 * answer the phone already has (`If-None-Match`, in double quotes). While nothing changed the API answers
 * "the same" with nothing in it (304), and the answer the phone has stays exactly as it is: nothing is
 * drawn again.
 */
export function askAgain<T extends { version: string }>(client: QueryClient, key: QueryKey, ask: (options: RequestInit) => Promise<T>) {
  return async ({ signal }: { signal: AbortSignal }): Promise<T> => {
    const have = client.getQueryData<T>(key);
    try {
      return await ask(have?.version ? { signal, headers: { 'If-None-Match': `"${have.version}"` } } : { signal });
    } catch (error) {
      if (have && error instanceof ApiError && error.status === 304) return have;
      throw error;
    }
  };
}

/**
 * Asking again is for the screen in front, and rests while its own changes are on their way: their answer is
 * the newest there is. And it ends when the answer was "this isn't there" (deleted, or no longer shared with
 * this person): the screen says so, and asking the same thing every few seconds wouldn't change it.
 */
function useAskAgainEvery(target: Target) {
  const focused = useIsFocused();
  const { sending } = useWaiting(target);
  const every = focused && !sending ? ASK_AGAIN_MS : false;
  return (asked: { state: { error: unknown } }): number | false => (isGone(asked.state.error) ? false : every);
}

/**
 * What this phone is deleting, or has deleted. Its screen is still there for a moment while it closes, and
 * must not ask for it again: the answer would be "this isn't there", about something the person just deleted.
 */
const leaving = new Set<string>();
const told = new Set<() => void>();
const listen = (tell: () => void) => {
  told.add(tell);
  return () => {
    told.delete(tell);
  };
};

/** Says that a list or a page is being deleted from this phone, or that deleting it didn't work after all. */
export function setLeaving(id: string, is: boolean) {
  if (is) leaving.add(id);
  else leaving.delete(id);
  for (const tell of told) tell();
}

function useStays(id: string): boolean {
  return useSyncExternalStore(
    listen,
    () => !leaving.has(id),
    () => true,
  );
}

/** A list that keeps itself up to date while it is open: it asks again every few seconds with the version it has. */
export function useLiveList(id: string) {
  const client = useQueryClient();
  const every = useAskAgainEvery({ kind: 'checklist', id });
  const enabled = useStays(id);
  const key = getGetChecklistQueryKey(id);
  return useGetChecklist(id, { query: { enabled, queryFn: askAgain(client, key, (options) => getChecklist(id, options)), refetchInterval: every } });
}

/** A page that keeps itself up to date while it is open, the same way. */
export function useLivePage(id: string) {
  const client = useQueryClient();
  const every = useAskAgainEvery({ kind: 'page', id });
  const enabled = useStays(id);
  const key = getGetPageQueryKey(id);
  return useGetPage(id, { query: { enabled, queryFn: askAgain(client, key, (options) => getPage(id, options)), refetchInterval: every } });
}
