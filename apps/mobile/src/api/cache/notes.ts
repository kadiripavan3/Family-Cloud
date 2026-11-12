import type { Query } from '@tanstack/react-query';

import { type BlockResponse, type ChecklistResponse, type FolderResponse, getGetChecklistQueryKey, getGetFolderQueryKey, getGetPageQueryKey, type PageResponse } from '@/api/generated/homeport';

import type { CacheTools } from './tools';

type Bag = Record<string, unknown>;

/** True for a whole list (the answer of `/v1/checklists/<id>`, or the copy a page draws), and not for a row that only names one. */
const isList = (old: Bag) => 'items' in old && 'sections' in old;
const isFolder = (old: Bag) => 'space' in old && 'folders' in old;

/** True for a loaded page that draws this list in one of its blocks. */
const drawsList = (listId: string) => (query: Query) => {
  const blocks = (query.state.data as { blocks?: BlockResponse[] } | undefined)?.blocks;
  return Array.isArray(blocks) && blocks.some((block) => block.checklist?.id === listId);
};

/**
 * Notes: spaces, folders, pages with blocks, lists. What the app does to what it has loaded when something
 * of this place changes: one function per thing that can happen, made of `tools` (see tools.ts). Screens
 * call them through `useCache()`.
 */
export const notesCache = (tools: CacheTools) => {
  const { client, stale, staleOnly, staleAbout, put, patch } = tools;
  /** Everything that lists what Notes holds: its home, and what is in each folder. */
  const shelves = (circleId: string) => stale(`/v1/circles/${circleId}/notes`, '/v1/folders/');

  return {
    /**
     * A list changed and the API sent it back as it stands: a part of its queue of changes went in, ticked
     * lines were cleared, it was renamed, the person chose to show or hide what is ticked. It takes the place
     * of every loaded copy (its own screen, and each page that draws it), and whatever was being asked about
     * it at that moment is dropped: an answer from before the change must not be shown after it. Lists of
     * things only show its counts, and are asked for again.
     */
    listSent: (id: string, list: ChecklistResponse | undefined) => {
      if (!list) return staleAbout(id);
      void client.cancelQueries({ queryKey: getGetChecklistQueryKey(id) });
      void client.cancelQueries({ predicate: drawsList(id) });
      put(isList, list);
      client.setQueryData(getGetChecklistQueryKey(id), list);
      return stale(`/v1/circles/${list.circleId}/`, '/v1/folders/', '/v1/things/', '/v1/members/');
    },

    /** A page changed and the API sent it back as it stands: a part of its queue of block changes went in, or its title or emoji were saved. */
    pageSent: (id: string, page: PageResponse | undefined) => {
      if (!page) return staleAbout(id);
      void client.cancelQueries({ queryKey: getGetPageQueryKey(id) });
      client.setQueryData(getGetPageQueryKey(id), page);
      return stale(`/v1/circles/${page.circleId}/`, '/v1/folders/', '/v1/things/', '/v1/members/');
    },

    /** A page, a list or a folder was made in Notes: its folder and every list of the circle are asked for again. */
    noteMade: (circleId: string) => Promise.all([tools.thingMade(circleId), stale('/v1/folders/')]),

    /** A space or a folder was renamed or got another emoji: the API sent it back. */
    folderSaved: (folder: FolderResponse) => {
      put(isFolder, folder);
      client.setQueryData(getGetFolderQueryKey(folder.id), folder);
      return Promise.all([tools.thingChanged(folder), stale('/v1/folders/')]);
    },

    /** Something was moved to another folder, out of one, or to another place in the order: where it stood and where it stands are asked for again. */
    noteFiled: (thing: { id: string; circleId: string }) => Promise.all([staleAbout(thing.id), shelves(thing.circleId)]),

    /** Something was pinned to the top of Notes, or its pin was taken away: every loaded copy says so at once. */
    notePinned: (thing: { id: string; circleId: string }, pinned: boolean) => {
      patch(thing.id, (old) => 'pinned' in old, (old) => ({ ...old, pinned }));
      return staleOnly(`/v1/circles/${thing.circleId}/notes`);
    },

    /** A page, a list or a folder of Notes was deleted. */
    noteGone: (thing: { id: string; circleId: string }) => Promise.all([tools.thingGone(thing), stale('/v1/folders/')]),

    /** The things in a folder, or the lists in a page, were given the audience of what holds them. */
    insideShared: (holder: { id: string; circleId: string }) => Promise.all([tools.thingChanged(holder), stale('/v1/folders/', '/v1/pages/', '/v1/checklists/')]),
  };
};
