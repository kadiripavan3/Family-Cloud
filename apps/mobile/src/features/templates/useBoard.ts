import { keepPreviousData, useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import {
  actOnBoard,
  addBoardEntry,
  type BoardResponse,
  changeBoard,
  changeBoardEntry,
  type NewEntryRequest,
  removeBoardEntry,
  useGetBoard,
} from '@/api/generated/homeport';
import { looksLikeId } from '@/features/things/open';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';

import type { Board } from './types';

/** What a template takes for an entry, a verb or its settings: names and values its guide lists (`x-board-templates` in the API's description). */
export type Fields = Record<string, unknown>;

/**
 * Reads a board as it stands on this phone's day. `show` picks another part where a template has more than
 * one (another week, an earlier year); while that part is on its way, the part that was showing stays.
 */
export function useBoard(id: string, show?: string) {
  return useGetBoard(id, show ? { day: today(), show } : { day: today() }, { query: { enabled: looksLikeId(id), placeholderData: show ? keepPreviousData : undefined } });
}

/**
 * Another part of a board a screen already has (next week's wheel, last year's jar): the board itself until
 * `show` names a part, then that part, typed like the board. `waiting` is true while the part asked for is
 * not the one on screen yet.
 */
export function useBoardPart<View, Settings>(board: Board<View, Settings>, show: string | undefined): { board: Board<View, Settings>; waiting: boolean; problem: string | null } {
  const asked = useGetBoard(board.id, { day: today(), show }, { query: { enabled: !!show, placeholderData: keepPreviousData } });
  if (!show) return { board, waiting: false, problem: null };
  // One template's board stays that template's, whatever part of it is shown.
  const part = asked.data as Board<View, Settings> | undefined;
  return { board: part ?? board, waiting: asked.isPlaceholderData || !part, problem: asked.isError && !part ? messageFor(asked.error) : null };
}

type Change =
  | { what: 'add'; kind: string; fields: Fields; clientId: string }
  | { what: 'change'; entryId: string; fields: Fields }
  | { what: 'remove'; entryId: string }
  | { what: 'act'; verb: string; body: Fields }
  | { what: 'set'; title?: string; settings?: Fields };

type Done = { board: BoardResponse | null; entryId: string | null };

/**
 * The API's description has two requests called `NewEntryRequest` (a goal's and a board's), and the
 * generated client kept the goal's. What a board takes is `{ clientId, kind, fields }` (`BoardController`),
 * so it is sent as that; this is the one place that knows.
 */
const newEntry = (entry: { clientId: string; kind: string; fields: Fields }) => entry as unknown as NewEntryRequest;

/**
 * Every way a board is changed, the same for all templates: add an entry, change one, remove one, do one of
 * the template's verbs, save its settings or its name. Each sends the phone's day, tells the cache what
 * happened, and answers when it is done: the board as it now opens (the new entry's id for `add`), or null
 * when it didn't work, with the reason in `problem`. Nothing here throws.
 *
 * A form keeps the `clientId` of what it is adding (`newClientId()`, once per draft) and hands it to `add`,
 * so a second tap doesn't add it twice. A component that changes two things at once (a sheet that adds
 * while a row is ticked behind it) asks for two of these.
 */
export function useBoardChanges(board: { id: string; circleId: string }) {
  const cache = useCache();
  const { id, circleId } = board;
  const sending = useMutation({
    mutationFn: async (change: Change): Promise<Done> => {
      const params = { day: today() };
      switch (change.what) {
        case 'add': {
          const added = await addBoardEntry(id, newEntry({ clientId: change.clientId, kind: change.kind, fields: change.fields }), params);
          return { board: added.board, entryId: added.entryId };
        }
        case 'change':
          return { board: await changeBoardEntry(change.entryId, { fields: change.fields }, params), entryId: change.entryId };
        case 'remove':
          await removeBoardEntry(change.entryId);
          return { board: null, entryId: change.entryId };
        case 'act':
          return { board: await actOnBoard(id, { verb: change.verb, body: change.body }, params), entryId: null };
        case 'set':
          return { board: await changeBoard(id, { title: change.title, settings: change.settings }, params), entryId: null };
      }
    },
    onSuccess: (done) => (done.board ? cache.boardSaved(done.board) : cache.boardTouched({ id, circleId })),
  });
  const { mutateAsync, isPending, error, reset, variables } = sending;

  return useMemo(() => {
    const send = (change: Change): Promise<Done | null> => mutateAsync(change).catch(() => null);
    return {
      /** Adds one entry of a kind the template knows. Answers the new entry's id. */
      add: async (kind: string, fields: Fields, clientId: string = newClientId()) => (await send({ what: 'add', kind, fields, clientId }))?.entryId ?? null,
      /** Changes one entry: a name that is left out keeps its value. */
      change: async (entryId: string, fields: Fields) => (await send({ what: 'change', entryId, fields }))?.board ?? null,
      /** Removes one entry. True when it is gone. */
      remove: async (entryId: string) => (await send({ what: 'remove', entryId })) !== null,
      /** One of the template's own verbs: seal, open, tick. */
      act: async (verb: string, body: Fields = {}) => (await send({ what: 'act', verb, body }))?.board ?? null,
      /** Saves settings (a name that is left out keeps its value), the board's name, or both. */
      set: async (settings?: Fields, title?: string) => (await send({ what: 'set', settings, title }))?.board ?? null,
      /** True while a change is on its way. */
      busy: isPending,
      /** The entry the change that is on its way is about, for the one row that shows it. */
      busyWith: isPending && variables && 'entryId' in variables ? variables.entryId : null,
      /** Why the last change didn't work, in a sentence, until the next one is tried or `forget()` is called. */
      problem: error ? messageFor(error) : null,
      forget: reset,
    };
  }, [mutateAsync, isPending, error, reset, variables]);
}

export type BoardChanges = ReturnType<typeof useBoardChanges>;
