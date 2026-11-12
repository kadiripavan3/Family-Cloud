import { newClient } from '@/test/phone';
import { alex, audience, checklist, coupleCircle, linds, me, mia, nora, page, settings, sharedWithSome, soloCircle, thing } from '@/test/samples';

import { cacheFor, PARTS } from '../cache';
import { chipOf } from '../cache/spine';
import { toolsFor } from '../cache/tools';
import { more, paged, rows } from '../pages';

describe('what the app does with loaded data after a change', () => {
  it('shows a saved profile at once, and asks again only for what says who the person is', async () => {
    const client = newClient();
    client.setQueryData(['/v1/me'], me(null));
    client.setQueryData(['/v1/me/settings'], settings());
    client.setQueryData(['/v1/circles'], []);
    client.setQueryData(['/v1/circles/c-linds/today'], {});

    await cacheFor(client).profileSaved(nora);

    expect(client.getQueryData(['/v1/me'])).toEqual(me(nora));
    expect(client.getQueryState(['/v1/me'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['/v1/me/settings'])?.isInvalidated).toBe(true);
    // Their name and picture stand in every circle they are in.
    expect(client.getQueryState(['/v1/circles'])?.isInvalidated).toBe(true);
    // A list that says nothing about the person is left alone.
    expect(client.getQueryState(['/v1/circles/c-linds/today'])?.isInvalidated).toBe(false);
  });

  it('does not make up a signed-in person when the profile is saved before "who is this" was answered', async () => {
    const client = newClient();
    await cacheFor(client).profileSaved(nora);
    expect(client.getQueryData(['/v1/me'])).toBeUndefined();
  });

  it('keeps the settings the API sent back, without asking for them again', () => {
    const client = newClient();
    client.setQueryData(['/v1/me/settings'], settings());
    cacheFor(client).settingsSaved(settings({ weeklySummary: false }));
    expect(client.getQueryData(['/v1/me/settings'])).toEqual(settings({ weeklySummary: false }));
    expect(client.getQueryState(['/v1/me/settings'])?.isInvalidated).toBe(false);
  });

  it('loads everything fresh after signing up', async () => {
    const client = newClient();
    client.setQueryData(['/v1/me'], me());
    client.setQueryData(['/v1/circles'], { items: [] });
    await cacheFor(client).everything();
    expect(client.getQueryState(['/v1/me'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['/v1/circles'])?.isInvalidated).toBe(true);
  });
});

const ID = '11111111-1111-4111-8111-111111111111';
const stale = (client: ReturnType<typeof newClient>, key: unknown[]) => client.getQueryState(key)?.isInvalidated;

describe('every place adds its own changes', () => {
  it('in its own file, and no two places use the same name', () => {
    const client = newClient();
    const names = Object.entries(PARTS).flatMap(([part, make]) => Object.keys(make(toolsFor(client))).map((name) => ({ part, name })));
    const twice = names.filter((one) => names.some((other) => other.name === one.name && other.part !== one.part));
    expect(twice).toEqual([]);
    expect(Object.keys(PARTS)).toEqual(['spine', 'plan', 'jot', 'notes', 'templates', 'library', 'money', 'vault', 'keepsakes', 'perks', 'couple', 'flat', 'crew', 'together', 'activity']);
    // What a screen gets from `useCache()` is all of them together.
    const cache = cacheFor(client) as Record<string, unknown>;
    for (const { name } of names) expect(typeof cache[name]).toBe('function');
    expect(typeof cache.everything).toBe('function');
  });
});

describe('a thing of any kind', () => {
  const loadedEverywhere = () => {
    const client = newClient();
    client.setQueryData(['/v1/pages/' + ID], page());
    client.setQueryData(['/v1/things/' + ID + '/audience'], audience());
    client.setQueryData(['/v1/things/' + ID + '/links'], []);
    client.setQueryData(['/v1/circles/c-linds/today', { day: '2026-11-11' }], { items: [], fresh: [] });
    client.setQueryData(['/v1/circles/c-linds/search', { q: 'wifi' }], { words: 'wifi', hits: [{ thing: thing(), snippet: null }] });
    client.setQueryData(['infinite', '/v1/circles/c-linds/pages'], { pages: [{ items: [{ id: ID, title: 'Wi‑Fi and smart home', chip: page().chip }], nextCursor: null }], pageParams: [undefined] });
    client.setQueryData(['/v1/circles/c-couple/today'], { items: [], fresh: [] });
    client.setQueryData(['/v1/members/m-mia'], { member: mia, kept: [thing()] });
    client.setQueryData(['/v1/me/settings'], settings());
    return client;
  };

  it('that was changed is asked for again wherever it shows, and nothing else is', async () => {
    const client = loadedEverywhere();
    await cacheFor(client).thingChanged({ id: ID, circleId: 'c-linds' });
    for (const key of [['/v1/pages/' + ID], ['/v1/things/' + ID + '/links'], ['/v1/circles/c-linds/today', { day: '2026-11-11' }], ['/v1/circles/c-linds/search', { q: 'wifi' }], ['infinite', '/v1/circles/c-linds/pages'], ['/v1/members/m-mia']]) {
      expect(stale(client, key)).toBe(true);
    }
    expect(stale(client, ['/v1/circles/c-couple/today'])).toBe(false);
    expect(stale(client, ['/v1/me/settings'])).toBe(false);
  });

  it("that was made is asked for by its circle's lists", async () => {
    const client = loadedEverywhere();
    await cacheFor(client).thingMade('c-linds');
    expect(stale(client, ['/v1/circles/c-linds/today', { day: '2026-11-11' }])).toBe(true);
    expect(stale(client, ['infinite', '/v1/circles/c-linds/pages'])).toBe(true);
    expect(stale(client, ['/v1/circles/c-couple/today'])).toBe(false);
    expect(stale(client, ['/v1/pages/' + ID])).toBe(false);
  });

  it('that was deleted is dropped, and the lists that held it are asked for again', async () => {
    const client = loadedEverywhere();
    await cacheFor(client).thingDeleted({ id: ID, circleId: 'c-linds' });
    expect(client.getQueryData(['/v1/pages/' + ID])).toBeUndefined();
    expect(client.getQueryData(['/v1/things/' + ID + '/audience'])).toBeUndefined();
    expect(stale(client, ['/v1/circles/c-linds/search', { q: 'wifi' }])).toBe(true);
    expect(stale(client, ['/v1/members/m-mia'])).toBe(true);
  });

  it('shows its new audience on every loaded copy at once, and asks the lists again', async () => {
    const client = loadedEverywhere();
    await cacheFor(client).audienceChanged(sharedWithSome);
    const chip = { audience: 'some', people: [{ memberId: 'm-alex', name: 'Alex Strand', avatarUrl: null }, { memberId: 'm-mia', name: 'Mia', avatarUrl: null }], hiddenFrom: [] };
    expect(chipOf(sharedWithSome)).toEqual(chip);
    expect(client.getQueryData<{ chip: unknown; body: string }>(['/v1/pages/' + ID])).toMatchObject({ chip, body: 'Network: Lind-Home' });
    expect(client.getQueryData<{ hits: { thing: { chip: unknown } }[] }>(['/v1/circles/c-linds/search', { q: 'wifi' }])?.hits[0]?.thing.chip).toEqual(chip);
    expect(client.getQueryData<{ pages: { items: { chip: unknown; title: string }[] }[] }>(['infinite', '/v1/circles/c-linds/pages'])?.pages[0]?.items[0]).toMatchObject({ chip, title: 'Wi‑Fi and smart home' });
    expect(client.getQueryData<{ kept: { chip: unknown }[] }>(['/v1/members/m-mia'])?.kept[0]?.chip).toEqual(chip);
    // The sheet itself has just been read.
    expect(client.getQueryData(['/v1/things/' + ID + '/audience'])).toEqual(sharedWithSome);
    expect(stale(client, ['/v1/things/' + ID + '/audience'])).toBe(false);
    expect(stale(client, ['/v1/circles/c-linds/today', { day: '2026-11-11' }])).toBe(true);
    expect(stale(client, ['/v1/circles/c-couple/today'])).toBe(false);
  });

  it('says "Not Mia" on its chip while it is hidden from her, and nothing about anyone for "Only you"', () => {
    const hidden = { ...sharedWithSome, audience: 'circle' as const, people: sharedWithSome.people.map((person) => (person.memberId === 'm-mia' ? { ...person, access: 'none' as const, hidden: true, hiddenThrough: '2026-12-04' } : person)) };
    expect(chipOf(hidden)).toEqual({ audience: 'circle', people: [], hiddenFrom: ['Mia'] });
    expect(chipOf(audience())).toEqual({ audience: 'me', people: [], hiddenFrom: [] });
  });

  it('keeps a saved page and a saved list as the API sent them', async () => {
    const client = loadedEverywhere();
    const saved = page({ title: 'Wi‑Fi', body: 'New words' });
    await cacheFor(client).pageSaved(saved);
    expect(client.getQueryData(['/v1/pages/' + ID])).toEqual(saved);
    expect(stale(client, ['/v1/circles/c-linds/search', { q: 'wifi' }])).toBe(true);

    const list = checklist();
    await cacheFor(client).checklistSaved(list);
    expect(client.getQueryData(['/v1/checklists/' + list.id])).toEqual(list);
    expect(client.getQueryState(['/v1/checklists/' + list.id])?.isInvalidated).toBe(false);
  });
});

describe('circles and their people', () => {
  it('a circle that was started or joined is there at once', async () => {
    const client = newClient();
    client.setQueryData(['/v1/circles'], [linds]);
    client.setQueryData(['/v1/me/overview'], { circles: ['The Linds'] });
    await cacheFor(client).circleJoined(coupleCircle);
    expect(client.getQueryData(['/v1/circles'])).toEqual([linds, coupleCircle]);
    expect(stale(client, ['/v1/me/overview'])).toBe(true);
    // Joining twice doesn't list it twice.
    await cacheFor(client).circleJoined(coupleCircle);
    expect(client.getQueryData(['/v1/circles'])).toEqual([linds, coupleCircle]);
  });

  it('a circle that changed is written over its old copy', async () => {
    const client = newClient();
    client.setQueryData(['/v1/circles'], [linds, soloCircle]);
    const renamed = { ...linds, name: 'Lind and Strand', kind: 'couple' as const };
    await cacheFor(client).circleChanged(renamed);
    expect(client.getQueryData(['/v1/circles'])).toEqual([renamed, soloCircle]);
  });

  it('a person who was added or changed is written into their circle and their own page', async () => {
    const client = newClient();
    client.setQueryData(['/v1/circles'], [linds]);
    client.setQueryData(['/v1/members/m-mia'], { member: mia, kept: [] });
    const older = { ...mia, facts: ['Shoes 34'] };
    await cacheFor(client).memberSaved(older);
    expect(client.getQueryData<{ member: unknown }>(['/v1/members/m-mia'])?.member).toEqual(older);
    expect(client.getQueryData<(typeof linds)[]>(['/v1/circles'])?.[0]?.members.find((one) => one.id === 'm-mia')).toEqual(older);
    expect(stale(client, ['/v1/circles'])).toBe(true);
  });

  it('a person who was added stands in their circle at once', async () => {
    const client = newClient();
    client.setQueryData(['/v1/circles'], [linds, soloCircle]);
    const astrid = { ...alex, id: 'm-astrid', name: 'Astrid Lind', status: 'invited' as const };
    await cacheFor(client).memberAdded(astrid);
    const circles = client.getQueryData<(typeof linds)[]>(['/v1/circles']);
    expect(circles?.[0]?.members.map((one) => one.id)).toEqual([...linds.members.map((one) => one.id), 'm-astrid']);
    expect(circles?.[1]).toEqual(soloCircle);
    // Adding the same person again (the answer came twice) doesn't list them twice.
    await cacheFor(client).memberAdded(astrid);
    expect(client.getQueryData<(typeof linds)[]>(['/v1/circles'])?.[0]?.members).toHaveLength(linds.members.length + 1);
  });

  it('a ticked line asks for its list again, and for what lists show of it', async () => {
    const client = newClient();
    const list = checklist();
    client.setQueryData(['/v1/checklists/' + list.id], list);
    client.setQueryData(['/v1/circles/c-linds/today'], {});
    client.setQueryData(['/v1/pages/' + ID], page());
    await cacheFor(client).checklistLineChanged(list);
    expect(stale(client, ['/v1/checklists/' + list.id])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/today'])).toBe(true);
    expect(stale(client, ['/v1/pages/' + ID])).toBe(false);
  });

  it('a guest pass that was given or ended asks for the passes again', async () => {
    const client = newClient();
    client.setQueryData(['/v1/circles/c-linds/guest-passes'], []);
    client.setQueryData(['/v1/guest-passes/g-1'], {});
    client.setQueryData(['/v1/circles/c-linds/today'], {});
    await cacheFor(client).guestPassChanged('c-linds');
    expect(stale(client, ['/v1/circles/c-linds/guest-passes'])).toBe(true);
    expect(stale(client, ['/v1/guest-passes/g-1'])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/today'])).toBe(false);
  });

  it('a person who was taken out is forgotten, and the circles are asked for again', async () => {
    const client = newClient();
    client.setQueryData(['/v1/circles'], [linds]);
    client.setQueryData(['/v1/members/m-alex'], { member: alex, kept: [] });
    await cacheFor(client).memberRemoved(alex);
    expect(client.getQueryData(['/v1/members/m-alex'])).toBeUndefined();
    expect(stale(client, ['/v1/circles'])).toBe(true);
  });
});

describe('paged lists', () => {
  it('go on with the cursor the last page handed out, and stop when there is none', () => {
    expect(paged.getNextPageParam({ nextCursor: 'abc' })).toBe('abc');
    expect(paged.getNextPageParam({ nextCursor: null })).toBeUndefined();
  });

  it('show every row loaded so far, in order', () => {
    expect(rows(undefined)).toBeUndefined();
    expect(rows({ pages: [{ items: [1, 2] }, { items: [3] }], pageParams: [] })).toEqual([1, 2, 3]);
  });

  it('never show the same row twice, when one moved down while the next page was on its way', () => {
    const page1 = { items: [{ id: 'a' }, { id: 'b' }] };
    const page2 = { items: [{ id: 'b' }, { id: 'c' }] }; // "b" arrives again
    expect(rows({ pages: [page1, page2], pageParams: [] })?.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    // Rows without an id of their own are all kept.
    expect(rows({ pages: [{ items: ['x', 'x'] }], pageParams: [] })).toEqual(['x', 'x']);
  });

  it('ask for the next page once, and only when there is one', () => {
    const fetchNextPage = jest.fn();
    more({ hasNextPage: true, isFetchingNextPage: false, fetchNextPage }).onEnd();
    more({ hasNextPage: true, isFetchingNextPage: true, fetchNextPage }).onEnd();
    more({ hasNextPage: false, isFetchingNextPage: false, fetchNextPage }).onEnd();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
