import type { CacheTools } from './tools';

/** As much of a thing as these changes need to know of it. */
type Kept = { id: string; circleId: string };

/**
 * Library: photos, videos, documents, albums. What the app does to what it has loaded when something of
 * this place changes: one function per thing that can happen, made of `tools` (see tools.ts). Screens call
 * them through `useCache()`.
 *
 * The wall, its counts, the years, the places, the albums, the files and what is kept are all lists of the
 * circle (`/v1/circles/<id>/…`). What a photo, an album or a document shows on its own page is under
 * `/v1/library/`, `/v1/albums/` and `/v1/documents/`.
 */
export const libraryCache = (tools: CacheTools) => {
  const { stale, staleAbout, patch } = tools;
  /** The pages of single photos, albums and documents: they say which albums a photo is in, how many an album holds. */
  const ownPages = () => stale('/v1/library/', '/v1/albums/', '/v1/documents/');

  return {
    /**
     * A heart was given or taken back. Every loaded copy of the photo shows it at once; its own page (how
     * many hearts, whose) and the wall narrowed to what you love are asked for again.
     */
    photoLoved: (photo: Kept, loved: boolean) => {
      patch(photo.id, (old) => 'loved' in old && 'thumbUrl' in old, (old) => ({ ...old, loved }));
      return Promise.all([staleAbout(photo.id), stale(`/v1/circles/${photo.circleId}/library`)]);
    },

    /** Something was said under a photo, or a comment was removed: the photo's page and its comments are asked for again. */
    photoCommented: (photoId: string) => staleAbout(photoId),

    /**
     * Who is in a photo was changed by hand. The people in photos, the albums that fill themselves, those
     * people's own pages and the photo's own page all follow from it.
     */
    photoTagged: (photo: Kept) => Promise.all([staleAbout(photo.id), tools.thingChanged(photo), stale('/v1/albums/')]),

    /** A photo's caption, or when and where it was taken, was changed. */
    photoChanged: (photo: Kept) => Promise.all([tools.thingChanged(photo), ownPages()]),

    /** Photos, videos or documents were added to a circle's Library: every list of the circle is asked for again. */
    libraryAdded: (circleId: string) => Promise.all([tools.thingMade(circleId), stale('/v1/albums/')]),

    /** An album or a folder was made. */
    albumMade: (album: Kept) => Promise.all([tools.thingMade(album.circleId), stale('/v1/library/')]),

    /** An album was renamed, or things were put into it or taken out. */
    albumChanged: (album: Kept) => Promise.all([tools.thingChanged(album), stale('/v1/library/')]),

    /**
     * Many things were shared, hidden or put into an album at once. The API says how many, not which, so
     * everything that lists or shows them is asked for again.
     */
    selectionChanged: (circleId: string) => Promise.all([tools.thingMade(circleId), ownPages()]),

    /** Many things were deleted at once: what was loaded of each is dropped, and the lists are asked for again. */
    selectionDeleted: (circleId: string, ids: readonly string[]) => {
      for (const id of ids) tools.drop(id);
      return Promise.all([tools.thingMade(circleId), stale('/v1/albums/')]);
    },

    /** A document was renamed, or the words inside it were sent again: its page and the lists of files follow. */
    documentChanged: (document: Kept) => tools.thingChanged(document),

    /** A reminder was made in Plan for a document and linked to it. */
    documentReminded: (document: Kept) => Promise.all([tools.thingMade(document.circleId), staleAbout(document.id)]),
  };
};
