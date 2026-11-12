import {
  type AudienceChip,
  type AudienceResponse,
  type ChecklistResponse,
  type CircleResponse,
  getGetAudienceQueryKey,
  getGetChecklistQueryKey,
  getGetCirclesQueryKey,
  getGetMeQueryKey,
  getGetPageQueryKey,
  getGetSettingsQueryKey,
  type MemberResponse,
  type MeResponse,
  type PageResponse,
  type SettingsResponse,
} from '@/api/generated/homeport';
import { firstName } from '@/lib/names';

import type { CacheTools } from './tools';

/** What the chip on a thing says, worked out from the sheet the API just sent back, so every list shows it at once. */
export function chipOf(audience: AudienceResponse): AudienceChip {
  const hiddenNow = audience.people.filter((person) => person.hidden);
  return {
    audience: audience.audience,
    people: audience.audience === 'some' ? audience.people.filter((person) => !person.hidden && person.access && person.access !== 'none').map(({ memberId, name, avatarUrl }) => ({ memberId, name, avatarUrl })) : [],
    hiddenFrom: audience.audience === 'me' ? [] : hiddenNow.map((person) => firstName(person.name)),
  };
}

/**
 * The spine's own changes: the person, their circles and the people in them, who sees a thing, and the two
 * simplest things (a page, a list). The first four are for every place: a thing of any kind that was made,
 * changed or deleted, or whose audience changed.
 */
export const spineCache = (tools: CacheTools) => {
  const { client, stale, staleOnly, put } = tools;
  /** One circle, wherever it is loaded: the list of circles holds whole circles. */
  const putCircle = (circle: CircleResponse) => put((old) => 'myMemberId' in old && 'members' in old, circle);

  return {
    /** The person's own profile was saved: the API sent it back. Whatever else says who they are is asked for again. */
    profileSaved: (profile: NonNullable<MeResponse['profile']>) => {
      client.setQueryData<MeResponse>(getGetMeQueryKey(), (me) => (me ? { ...me, profile } : me));
      return Promise.all([stale('/v1/me'), staleOnly('/v1/circles')]);
    },

    /** Settings were saved: the API sent them back. */
    settingsSaved: (settings: SettingsResponse) => {
      client.setQueryData(getGetSettingsQueryKey(), settings);
    },

    // ---------- things of any kind ----------

    /** A thing of any kind was made in a circle: every list of the circle is asked for again. */
    thingMade: (circleId: string) => tools.thingMade(circleId),

    /** A thing of any kind was changed in a way lists show: its title, where it stands. */
    thingChanged: (thing: { id: string; circleId: string }) => tools.thingChanged(thing),

    /** A thing of any kind was deleted: what was loaded of it is dropped, and the lists are asked for again. */
    thingDeleted: (thing: { id: string; circleId: string }) => tools.thingGone(thing),

    /**
     * Who sees a thing was changed on the audience sheet: the API sent the sheet back. The new chip is written
     * onto every loaded copy of the thing at once, and whatever lists it are asked for again (for the others
     * in the circle it has just appeared or gone; for its owner the lists' "only you" counts changed).
     */
    audienceChanged: (audience: AudienceResponse) => {
      const chip = chipOf(audience);
      tools.patch(audience.thingId, (old) => 'chip' in old, (old) => ({ ...old, chip }));
      const lists = tools.thingChanged({ id: audience.thingId, circleId: audience.circleId });
      // The sheet itself has just been read: it is the one answer about the thing that is not asked for again.
      client.setQueryData(getGetAudienceQueryKey(audience.thingId), audience);
      return lists;
    },

    // ---------- circles and their people ----------

    /** A circle was started or joined: the API sent it back. It joins the list of circles, and everything about "your circles" is asked for again. */
    circleJoined: (circle: CircleResponse) => {
      client.setQueryData<CircleResponse[]>(getGetCirclesQueryKey(), (circles) => (circles ? [...circles.filter((old) => old.id !== circle.id), circle] : circles));
      return Promise.all([staleOnly('/v1/circles', '/v1/me/overview'), stale('/v1/join/')]);
    },

    /** A circle's name, kind, picture or join link changed: the API sent it back. What its kind decides (what a new thing starts as) came with it. */
    circleChanged: (circle: CircleResponse) => {
      putCircle(circle);
      return Promise.all([stale(`/v1/circles/${circle.id}/`), staleOnly('/v1/circles', '/v1/me/overview')]);
    },

    /** Someone was added to a circle, or what the circle keeps about one of its people changed: the API sent the person back. */
    memberSaved: (member: MemberResponse) => {
      put((old) => 'circleId' in old && 'tint' in old, member);
      return Promise.all([staleOnly('/v1/circles'), stale(`/v1/members/${member.id}`)]);
    },

    /** Someone was taken out of a circle (or left it): the circles, and every list of that circle, are asked for again. */
    memberRemoved: (member: { id: string; circleId: string }) => {
      tools.drop(member.id);
      return Promise.all([stale(`/v1/circles/${member.circleId}/`, '/v1/things/'), staleOnly('/v1/circles', '/v1/me/overview')]);
    },

    /** A guest pass was given or ended. */
    guestPassChanged: (circleId: string) => stale(`/v1/circles/${circleId}/guest-passes`, '/v1/guest-passes/'),

    // ---------- a page and a list ----------

    /** A page's title or words were saved: the API sent it back. */
    pageSaved: (page: PageResponse) => {
      client.setQueryData(getGetPageQueryKey(page.id), page);
      return tools.thingChanged(page);
    },

    /** A list changed (a line ticked, added or removed, its name): the API sent the list back. Only what lists show of it is asked for again. */
    checklistSaved: (list: ChecklistResponse) => {
      client.setQueryData(getGetChecklistQueryKey(list.id), list);
      return stale(`/v1/circles/${list.circleId}/`, '/v1/things/', '/v1/members/');
    },
  };
};
