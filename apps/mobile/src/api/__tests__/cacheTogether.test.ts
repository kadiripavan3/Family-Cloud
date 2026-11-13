import { newClient } from '@/test/phone';
import { atHome, away, check, draft, DRAFT, goodnight, homeSettings, id, job, kept, KEPT, miaBrief, NIGHT, noraBrief, TRIP, trip } from '@/test/samples/together';

import { cacheFor } from '../cache';

const stale = (client: ReturnType<typeof newClient>, key: unknown[]) => client.getQueryState(key)?.isInvalidated;
const DAY = { day: '2026-11-12' };

/** What a phone has loaded of the link with Journey, and a few things around it. */
function loadedEverywhere() {
  const client = newClient();
  client.setQueryData(['/v1/circles/c-linds/today', DAY], { items: [], cards: [], fresh: [] });
  client.setQueryData(['/v1/circles/c-linds/journey/at-home', DAY], atHome());
  client.setQueryData(['/v1/circles/c-linds/journey/kept'], { pages: [{ items: [kept()], nextCursor: null }], pageParams: [undefined] });
  client.setQueryData(['/v1/circles/c-linds/journey/settings'], homeSettings());
  client.setQueryData(['/v1/circles/c-linds/trips', DAY], [{ id: TRIP }]);
  client.setQueryData(['/v1/circles/c-linds/notes'], { spaces: [] });
  client.setQueryData([`/v1/trips/${TRIP}`, DAY], trip());
  client.setQueryData([`/v1/folders/${TRIP}`], { id: TRIP });
  client.setQueryData([`/v1/journey/drafts/${DRAFT}`], draft());
  client.setQueryData([`/v1/journey/drafts/${DRAFT}/check`], check());
  client.setQueryData(['/v1/journey/journeys'], { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] });
  client.setQueryData(['/v1/journey/me'], {});
  client.setQueryData([`/v1/journey/jobs/${job().id}`], job());
  client.setQueryData([`/v1/goodnights/${NIGHT}`], goodnight());
  client.setQueryData(['/v1/circles/c-couple/today'], {});
  client.setQueryData(['/v1/me/settings'], {});
  return client;
}

describe('what the app does with loaded data after something of the link with Journey changed', () => {
  it('asks every list of the circle again once a journey has come home, and what the keeping screens show', async () => {
    const client = loadedEverywhere();
    await cacheFor(client).journeyKept('c-linds');
    // A book in Notes, an album in the Library, a card on Today, the kept journeys, a trip's book.
    expect(stale(client, ['/v1/circles/c-linds/notes'])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/today', DAY])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/journey/kept'])).toBe(true);
    expect(stale(client, [`/v1/trips/${TRIP}`, DAY])).toBe(true);
    expect(stale(client, ['/v1/journey/journeys'])).toBe(true);
    expect(stale(client, ['/v1/circles/c-couple/today'])).toBe(false);
    expect(stale(client, ['/v1/me/settings'])).toBe(false);
  });

  it('asks what says "kept" again after a journey is no longer kept', async () => {
    const client = loadedEverywhere();
    await cacheFor(client).journeyUnkept({ id: KEPT, circleId: 'c-linds' });
    expect(stale(client, ['/v1/circles/c-linds/journey/kept'])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/today', DAY])).toBe(true);
    // The page and the album stay as they are: nothing of Notes is asked again.
    expect(stale(client, ['/v1/circles/c-linds/notes'])).toBe(false);
  });

  it('shows a changed draft as the API sent it back, and asks for its check again', async () => {
    const client = loadedEverywhere();
    const changed = draft({ title: 'Three days at the lake' });
    await cacheFor(client).journeyDraftChanged(changed);
    expect(client.getQueryData([`/v1/journey/drafts/${DRAFT}`])).toEqual(changed);
    expect(stale(client, [`/v1/journey/drafts/${DRAFT}`])).toBe(false);
    expect(stale(client, [`/v1/journey/drafts/${DRAFT}/check`])).toBe(true);
  });

  it('keeps the check the API sent back after a switch was turned, without asking again', () => {
    const client = loadedEverywhere();
    const turned = check({ photosGoing: 49 });
    cacheFor(client).journeyDraftChecked(turned);
    expect(client.getQueryData([`/v1/journey/drafts/${DRAFT}/check`])).toEqual(turned);
    expect(stale(client, [`/v1/journey/drafts/${DRAFT}/check`])).toBe(false);
    // A check that was never asked for is not made up.
    cacheFor(client).journeyDraftChecked(check({ draftId: id(77) }));
    expect(client.getQueryData([`/v1/journey/drafts/${id(77)}/check`])).toBeUndefined();
  });

  it('forgets a draft that was thrown away', () => {
    const client = loadedEverywhere();
    cacheFor(client).journeyDraftGone(DRAFT);
    expect(client.getQueryData([`/v1/journey/drafts/${DRAFT}`])).toBeUndefined();
    expect(client.getQueryData([`/v1/journey/drafts/${DRAFT}/check`])).toBeUndefined();
    expect(client.getQueryData(['/v1/journey/journeys'])).toBeDefined();
  });

  it('asks the draft and your journeys again once a draft became a journey', async () => {
    const client = loadedEverywhere();
    await cacheFor(client).journeyDraftSent(DRAFT);
    expect(stale(client, [`/v1/journey/drafts/${DRAFT}`])).toBe(true);
    expect(stale(client, ['/v1/journey/journeys'])).toBe(true);
    expect(stale(client, ['/v1/journey/me'])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/today', DAY])).toBe(false);
  });

  it('asks the trip, its folder and the trips of the circle again after a folder was given dates or became a journey', async () => {
    const client = loadedEverywhere();
    await cacheFor(client).tripSaved({ id: TRIP, circleId: 'c-linds' });
    expect(stale(client, [`/v1/trips/${TRIP}`, DAY])).toBe(true);
    expect(stale(client, [`/v1/folders/${TRIP}`])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/trips', DAY])).toBe(true);
    expect(stale(client, ['/v1/journey/journeys'])).toBe(true);
  });

  it('asks only the trips of the circle again after a folder stopped being a trip: nothing asks about the trip that is no more', async () => {
    const client = loadedEverywhere();
    await cacheFor(client).tripRemoved({ id: TRIP, circleId: 'c-linds' });
    expect(stale(client, ['/v1/circles/c-linds/trips', DAY])).toBe(true);
    expect(stale(client, [`/v1/trips/${TRIP}`, DAY])).toBe(false);
    expect(stale(client, [`/v1/folders/${TRIP}`])).toBe(false);
  });

  it('keeps the home settings the API sent back, and asks Today again: a goodnight waits until bedtime', async () => {
    const client = loadedEverywhere();
    const saved = homeSettings({ bedtime: '19:30' });
    await cacheFor(client).homeSettingsSaved(saved);
    expect(client.getQueryData(['/v1/circles/c-linds/journey/settings'])).toEqual(saved);
    expect(stale(client, ['/v1/circles/c-linds/journey/at-home', DAY])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/today', DAY])).toBe(true);
    expect(stale(client, ['/v1/circles/c-couple/today'])).toBe(false);
  });

  it('shows a heart given at home at once, wherever who is away is loaded', () => {
    const client = loadedEverywhere();
    const hearted = [away({ latest: { ...away().latest, lovedBy: [miaBrief, noraBrief], loved: true } })];
    cacheFor(client).awayHearted('c-linds', hearted);
    const now = client.getQueryData<ReturnType<typeof atHome>>(['/v1/circles/c-linds/journey/at-home', DAY]);
    expect(now?.away).toEqual(hearted);
    // The rest of the answer is as it was.
    expect(now?.goodnights).toEqual(atHome().goodnights);
    expect(stale(client, ['/v1/circles/c-linds/journey/at-home', DAY])).toBe(false);
  });

  it("shows a goodnight's heart on every loaded copy of it: its own page and Journey at home", () => {
    const client = loadedEverywhere();
    const loved = goodnight({ loved: true, lovedBy: [miaBrief, noraBrief] });
    cacheFor(client).goodnightLoved(loved);
    expect(client.getQueryData([`/v1/goodnights/${NIGHT}`])).toEqual(loved);
    expect(client.getQueryData<ReturnType<typeof atHome>>(['/v1/circles/c-linds/journey/at-home', DAY])?.goodnights[0]).toEqual(loved);
  });

  it('asks the goodnight it answers, and the lists of the circle, again after one was sent back', async () => {
    const client = loadedEverywhere();
    await cacheFor(client).goodnightSent(goodnight({ id: id(31), replyTo: NIGHT, mine: true }));
    expect(stale(client, [`/v1/goodnights/${NIGHT}`])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/today', DAY])).toBe(true);
  });

  it('forgets a goodnight that was deleted, and asks the lists again', async () => {
    const client = loadedEverywhere();
    await cacheFor(client).goodnightDeleted({ id: NIGHT, circleId: 'c-linds' });
    expect(client.getQueryData([`/v1/goodnights/${NIGHT}`])).toBeUndefined();
    expect(stale(client, ['/v1/circles/c-linds/journey/at-home', DAY])).toBe(true);
  });
});
