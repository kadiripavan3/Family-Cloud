import type { AwayResponse, GoodnightResponse, HomeSettingsResponse, JourneyDraftResponse, LeavingCheckResponse } from '../generated/homeport';
import type { CacheTools } from './tools';

/** As much of something kept in a circle as these changes need to know of it. */
type Kept = { id: string; circleId: string };
type Bag = Record<string, unknown>;

/** True for a goodnight as the API sends it, wherever it stands: its own page, Journey at home, a list. */
const isGoodnight = (old: Bag) => 'clip' in old && 'forDay' in old;
/** True for a draft of a journey as the API sends it. */
const isDraft = (old: Bag) => 'days' in old && 'from' in old && 'visibility' in old;

/**
 * With Journey: journeys kept and told, trips, Journey at home, goodnights. What the app does to what it has
 * loaded when something of this place changes: one function per thing that can happen, made of `tools`
 * (see tools.ts). Screens call them through `useCache()`.
 *
 * What Journey itself says (your journeys, a draft, a job) is under `/v1/journey/`; what a circle keeps of
 * it under `/v1/circles/<id>/journey/`, `/v1/trips/` and `/v1/goodnights/`.
 */
export const togetherCache = (tools: CacheTools) => {
  const { client, stale, staleAbout, put, drop } = tools;
  /** Writes one answer at one exact address, when that address has been asked for. */
  const set = (address: string, data: unknown) => {
    for (const query of client.getQueryCache().findAll({ predicate: (one) => one.queryKey[0] === address })) client.setQueryData(query.queryKey, data);
  };

  return {
    /**
     * A journey was kept, or what is new of it was brought home: a book appeared in Notes, an album and its
     * photos in the Library, a route on the map. Every list of the circle follows, and so does what the
     * keeping screens show of the journey.
     */
    journeyKept: (circleId: string) => Promise.all([tools.thingMade(circleId), stale('/v1/journey/', '/v1/albums/', '/v1/library/', '/v1/pages/', '/v1/trips/')]),

    /** A journey is no longer kept. Its page, album and photos stay; only what says "kept" follows. */
    journeyUnkept: (kept: Kept) => {
      drop(kept.id);
      return stale(`/v1/circles/${kept.circleId}/journey`, `/v1/circles/${kept.circleId}/today`, '/v1/journey/', '/v1/trips/');
    },

    /** A draft was changed and the API sent it back: it is shown as it stands, and its check is asked for again. */
    journeyDraftChanged: (draft: JourneyDraftResponse) => {
      put(isDraft, draft);
      return stale(`/v1/journey/drafts/${draft.id}/check`);
    },

    /** A switch of "Before it leaves home" was turned and the API sent the whole check back. */
    journeyDraftChecked: (check: LeavingCheckResponse) => set(`/v1/journey/drafts/${check.draftId}/check`, check),

    /** A draft was thrown away. */
    journeyDraftGone: (draftId: string) => drop(draftId),

    /** A draft became a journey in Journey: the draft says so, and your journeys there are one more. */
    journeyDraftSent: (draftId: string) => Promise.all([staleAbout(draftId), stale('/v1/journey/journeys', '/v1/journey/me')]),

    /** A folder was given dates (it is a trip from then on), its dates were changed, or it became a journey. */
    tripSaved: (trip: Kept) => Promise.all([staleAbout(trip.id), stale(`/v1/circles/${trip.circleId}/trips`, '/v1/journey/journeys', '/v1/journey/me')]),

    /**
     * A folder stopped being a trip. The folder and what is in it stay. Only the list of trips is asked for
     * again: the folder's screen then draws it as a folder, and nothing asks about the trip that is no more.
     */
    tripRemoved: (trip: Kept) => stale(`/v1/circles/${trip.circleId}/trips`),

    /** Where home is, or when bedtime is, was changed: Today holds a goodnight until bedtime. */
    homeSettingsSaved: (settings: HomeSettingsResponse) => {
      set(`/v1/circles/${settings.circleId}/journey/settings`, settings);
      return stale(`/v1/circles/${settings.circleId}/journey/at-home`, `/v1/circles/${settings.circleId}/today`);
    },

    /** A heart was given at home to an entry of someone who is away, or taken back. The API sent everyone who is away. */
    awayHearted: (circleId: string, away: AwayResponse[]) => {
      for (const query of client.getQueryCache().findAll({ predicate: (one) => one.queryKey[0] === `/v1/circles/${circleId}/journey/at-home` })) {
        const old = query.state.data as Bag | undefined;
        if (old) client.setQueryData(query.queryKey, { ...old, away });
      }
    },

    /** A goodnight got a heart, or lost one: every loaded copy shows it. */
    goodnightLoved: (goodnight: GoodnightResponse) => put(isGoodnight, goodnight),

    /** A goodnight was sent, or one back in answer: the one it answers counts it, and the circle's lists have one more. */
    goodnightSent: (goodnight: GoodnightResponse) => Promise.all([tools.thingMade(goodnight.circleId), goodnight.replyTo ? staleAbout(goodnight.replyTo) : null]),

    /** A goodnight was deleted. */
    goodnightDeleted: (goodnight: Kept) => tools.thingGone(goodnight),
  };
};
