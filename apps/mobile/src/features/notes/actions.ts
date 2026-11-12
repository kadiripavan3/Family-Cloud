import { useMutation } from '@tanstack/react-query';

import { useCache } from '@/api/cache';
import { changeFolder, changePage, deleteThing, fileThing, pinThing, renameChecklist, unpinThing } from '@/api/generated/homeport';

import { setLeaving } from './live';

/** As much of a thing as Notes' own actions need: every row of a folder, a page, a list and a folder have these. */
export type Noted = { id?: string; circleId?: string; kind?: string; title?: string; emoji?: string; pinned?: boolean; mine?: boolean; canEdit?: boolean };

const known = (thing: Noted) => ({ id: thing.id ?? '', circleId: thing.circleId ?? '' });

/** The kinds Notes can rename itself: its own. A sheet or a board that is filed here is renamed where it lives. */
export const canRename = (thing: Noted) => !!thing.canEdit && (thing.kind === 'folder' || thing.kind === 'page' || thing.kind === 'checklist');

/**
 * What can be done to anything that stands in Notes, each with what the app has loaded put right afterwards:
 * pin it or take the pin away, rename it (and give it another emoji), put it somewhere else in its folder's
 * order, delete it. The screens draw the menus; this does the work.
 */
export function useNoteActions() {
  const cache = useCache();

  const pin = useMutation({
    mutationFn: ({ thing, pinned }: { thing: Noted; pinned: boolean }) => (pinned ? pinThing(known(thing).id) : unpinThing(known(thing).id)),
    onSuccess: (_, { thing, pinned }) => cache.notePinned(known(thing), pinned),
  });

  const rename = useMutation({
    mutationFn: async ({ thing, title, emoji }: { thing: Noted; title: string; emoji?: string }) => {
      const { id } = known(thing);
      if (thing.kind === 'folder') return cache.folderSaved(await changeFolder(id, { title, emoji }));
      if (thing.kind === 'page') return cache.pageSent(id, await changePage(id, { title, emoji }));
      return cache.listSent(id, await renameChecklist(id, { title, emoji }));
    },
  });

  /** Puts a thing just after another one in the same folder, or first. */
  const reorder = useMutation({
    mutationFn: ({ thing, folderId, after }: { thing: Noted; folderId: string | null; after: string | null }) => fileThing(known(thing).id, after ? { folderId, after } : { folderId, atStart: true }),
    onSuccess: (_, { thing }) => cache.noteFiled(known(thing)),
  });

  /** Deletes it. From the first moment its own screen stops asking for it; if deleting fails, it asks again. */
  const remove = useMutation({
    mutationFn: (thing: Noted) => deleteThing(known(thing).id),
    onMutate: (thing) => setLeaving(known(thing).id, true),
    onError: (_, thing) => setLeaving(known(thing).id, false),
    onSuccess: (_, thing) => cache.noteGone(known(thing)),
  });

  return { pin, rename, reorder, remove };
}
