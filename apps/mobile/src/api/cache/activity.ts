import type { InfiniteData } from '@tanstack/react-query';

import {
  type ActivityResponse,
  type AskResponse,
  type CircleResponse,
  type ExportResponse,
  getGetCirclesQueryKey,
  getGetExportsQueryKey,
  getGetUnreadActivityQueryKey,
  type UnreadResponse,
} from '@/api/generated/homeport';

import type { CacheTools } from './tools';

/**
 * Activity, asks, exports and leaving: what ties the places together. What the app does to what it has
 * loaded when something of this place changes: one function per thing that can happen, made of `tools` (see
 * tools.ts). Screens call them through `useCache()`.
 */
export const activityCache = (tools: CacheTools) => {
  const { client, stale, staleOnly } = tools;
  /** A circle's Activity under every chip, and the tab's dot. */
  const activityOf = (circleId: string) => stale(`/v1/circles/${circleId}/activity`);
  /** Every loaded page of a circle's Activity, under every chip. */
  const pagesOf = (circleId: string) => client.getQueryCache().findAll({ predicate: (query) => query.queryKey[0] === 'infinite' && query.queryKey[1] === `/v1/circles/${circleId}/activity` });

  return {
    /**
     * Activity was looked at, and the API was told: nothing is new any more, so the tab's dot goes at once.
     * The lines on screen keep their highlight until the list is read again.
     */
    activitySeen: (circleId: string) => {
      client.setQueryData<UnreadResponse>(getGetUnreadActivityQueryKey(circleId), (unread) => (unread ? { ...unread, fresh: 0 } : unread));
    },

    /** A circle was muted, or let be heard again: every loaded page of its Activity says so at once. */
    circleMuted: (circleId: string, muted: boolean) => {
      for (const query of pagesOf(circleId)) {
        const data = query.state.data as InfiniteData<ActivityResponse> | undefined;
        if (data) query.setState({ data: { ...data, pages: data.pages.map((page) => ({ ...page, muted })) } });
      }
    },

    /** A question about a thing was asked or taken back by the person themselves: where they stand with it is asked for again. */
    askChanged: (thing: { id: string; circleId: string }) => Promise.all([stale(`/v1/things/${thing.id}/ask`), activityOf(thing.circleId)]),

    /**
     * An ask was answered (allowed or not now): the API sent it back. The line with its buttons goes, the
     * number on the Asks chip and the dot follow, and the thing itself has another person on it when it was allowed.
     */
    askAnswered: (ask: AskResponse) => tools.thingChanged({ id: ask.thingId, circleId: ask.circleId }),

    /** An export was asked for: the API sent it back, and it stands first in the list at once. */
    exportAsked: (made: ExportResponse) => {
      client.setQueryData<ExportResponse[]>(getGetExportsQueryKey(made.circleId), (exports) => (exports ? [made, ...exports.filter((old) => old.id !== made.id)] : exports));
      return staleOnly(`/v1/circles/${made.circleId}/exports`);
    },

    /** An export was removed: it leaves the list at once. */
    exportRemoved: (gone: { id: string; circleId: string }) => {
      client.setQueryData<ExportResponse[]>(getGetExportsQueryKey(gone.circleId), (exports) => exports?.filter((old) => old.id !== gone.id));
      tools.drop(gone.id);
    },

    /**
     * The person left a circle themselves. It leaves their list of circles at once (so the app is on another
     * one, or on setting one up, before anything is asked again), what was loaded of it is forgotten, and
     * what counts across circles is asked for again.
     */
    circleLeft: (circle: { id: string }) => {
      client.setQueryData<CircleResponse[]>(getGetCirclesQueryKey(), (circles) => circles?.filter((old) => old.id !== circle.id));
      tools.drop(circle.id);
      return staleOnly('/v1/circles', '/v1/me/overview', '/v1/home/circles');
    },
  };
};
