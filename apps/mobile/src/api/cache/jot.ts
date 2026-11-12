import { getGetJotWaysQueryKey, type JotResponse, type WaysResponse } from '@/api/generated/homeport';

import type { CacheTools } from './tools';

type Bag = Record<string, unknown>;
/** True for a jot among whatever is loaded: a jot is the one thing that came from a batch and became something. */
const isJot = (old: Bag) => 'batchId' in old && 'became' in old;

/**
 * Jot: what was typed, said or shared in from outside the app. What the app does to what it has loaded when
 * something of this place changes: one function per thing that can happen, made of `tools` (see tools.ts).
 * Screens call them through `useCache()`.
 *
 * A jot is small, but what it makes belongs to other places (an event, a reminder, a line of a list, a
 * note), so filing, undoing and moving one are each "a thing of some kind was made or is gone" for the rest
 * of the app.
 */
export const jotCache = (tools: CacheTools) => {
  const { client, stale } = tools;
  /** The lists a jot put a line on, or took one off: their own pages are asked for again. */
  const lists = (jots: readonly JotResponse[]) => {
    const ids = [...new Set(jots.filter((one) => one.became === 'list_item' && one.thingId).map((one) => one.thingId as string))];
    return ids.length ? stale(...ids.map((id) => `/v1/checklists/${id}`)) : Promise.resolve();
  };
  /** Takes jots out of every loaded list of jots at once, a page at a time or as one answer. */
  const takeOut = (circleId: string, gone: (jot: JotResponse) => boolean) => {
    const keep = (items: JotResponse[] | undefined) => items?.filter((one) => !gone(one));
    client.setQueriesData<{ items?: JotResponse[]; pages?: { items?: JotResponse[] }[] }>(
      { predicate: (query) => query.queryKey.some((part) => typeof part === 'string' && part.startsWith(`/v1/circles/${circleId}/jots`)) },
      (data) => (data ? { ...data, ...(data.items ? { items: keep(data.items) } : {}), ...(data.pages ? { pages: data.pages.map((page) => ({ ...page, items: keep(page.items) })) } : {}) } : data),
    );
  };

  return {
    /** A line was jotted: the API sent back what it made. Today, Plan, the lists and the widgets all ask again. */
    jotFiled: (circleId: string, made: readonly JotResponse[]) => Promise.all([lists(made), tools.thingMade(circleId)]),

    /**
     * A jot was undone: it leaves the list at once, what it made is gone, and whatever listed that asks
     * again. (A held-back code made nothing: only the jot goes.)
     */
    jotUndone: (circleId: string, jot: JotResponse) => {
      takeOut(circleId, (one) => one.id === jot.id);
      if (jot.thingId && jot.became !== 'list_item') return tools.thingGone({ id: jot.thingId, circleId });
      return Promise.all([lists([jot]), tools.thingMade(circleId)]);
    },

    /** A jot was moved to another kind or list: the API sent it back as it is now. What it had made before is gone. */
    jotMoved: (circleId: string, before: JotResponse, after: JotResponse) => {
      tools.put(isJot, after);
      if (before.thingId && before.became !== 'list_item' && before.thingId !== after.thingId) tools.drop(before.thingId);
      return Promise.all([lists([before, after]), tools.thingMade(circleId)]);
    },

    /** The ways in, or where jots go, were saved: the API sent them back. The widgets may now show another list. */
    jotWaysSaved: (circleId: string, ways: WaysResponse) => {
      client.setQueryData(getGetJotWaysQueryKey(circleId), ways);
      return stale(`/v1/circles/${circleId}/widgets`);
    },

    /** Someone started or stopped using a list (at the shop): what the Lock Screen shows is asked for again. */
    listInUseChanged: (circleId: string) => stale(`/v1/circles/${circleId}/widgets`),

    /** What was read from a letter that was shared in has been saved: events, reminders, a bill, the letter itself. */
    letterSaved: (circleId: string) => tools.thingMade(circleId),
  };
};
