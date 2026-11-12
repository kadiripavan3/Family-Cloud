import type { Query } from '@tanstack/react-query';

import type { BoardResponse, StartedResponse } from '@/api/generated/homeport';

import type { CacheTools } from './tools';

/** True for a loaded answer that is one part of a board picked with `show` (another week, another year), not the board as it opens. */
const isPart = (query: Query) => query.queryKey.some((part) => typeof part === 'object' && part !== null && 'show' in part && (part as { show?: unknown }).show !== undefined);

/**
 * Templates: the gallery, what starting from one makes, and the boards of the templates that do work
 * (whatever place their screens are drawn in: Notes, Keepsakes, Fair and fun, a couple's, a flat's, a
 * crew's). One function per thing that can happen, made of `tools` (see tools.ts); screens call them
 * through `useCache()`. Deleting a board is the spine's `thingDeleted`, and who sees it `audienceChanged`.
 */
export const templatesCache = (tools: CacheTools) => {
  const { client, stale } = tools;
  /** A board's own address, and everything read under it (a list of it read a page at a time). */
  const own = (id: string) => `/v1/boards/${id}`;
  const under = (id: string) => (query: Query) => query.queryKey.some((part) => typeof part === 'string' && part.startsWith(`${own(id)}/`));
  /** What lists show of a board (its line on Today, in search, on a person's page) is asked for again; nothing of the board itself. */
  const lists = (circleId: string) => stale(`/v1/circles/${circleId}/`, '/v1/things/', '/v1/members/');

  return {
    /**
     * A template was started from the gallery: its pages and lists, or its board, are new things in the
     * circle. The board came back with the answer, so opening it asks for nothing.
     */
    templateStarted: (started: StartedResponse, circleId: string, day: string) => {
      if (started.board) client.setQueryData([own(started.board.id), { day }], started.board);
      return tools.thingMade(circleId);
    },

    /**
     * Something on a board changed (an entry was added or changed, a verb was done, its settings or its name
     * were saved): the API sent the board back as it opens today. It is written over every loaded copy of
     * that; the board's other parts (another week, a list read a page at a time) are asked for again, and
     * so is what lists show of it.
     */
    boardSaved: (board: BoardResponse) => {
      for (const query of client.getQueryCache().findAll({ predicate: (one) => one.queryKey[0] === own(board.id) && !isPart(one) })) {
        client.setQueryData(query.queryKey, board);
      }
      return Promise.all([client.invalidateQueries({ predicate: (query) => (query.queryKey[0] === own(board.id) && isPart(query)) || under(board.id)(query) }), lists(board.circleId)]);
    },

    /**
     * Something on a board changed and the API did not send it back (an entry was removed, or someone
     * outside the circle answered through a link): everything loaded of the board is asked for again.
     */
    boardTouched: (board: { id: string; circleId: string }) => Promise.all([client.invalidateQueries({ predicate: (query) => query.queryKey[0] === own(board.id) || under(board.id)(query) }), lists(board.circleId)]),
  };
};
