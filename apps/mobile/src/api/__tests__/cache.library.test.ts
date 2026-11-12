import { newClient } from '@/test/phone';
import { canoe, libraryItem, wallPage } from '@/test/samples/library';

import { cacheFor } from '../cache';

const stale = (client: ReturnType<typeof newClient>, key: unknown[]) => client.getQueryState(key)?.isInvalidated;
const wallKey = ['infinite', '/v1/circles/c-linds/library', { limit: 60 }];
const itemKey = [`/v1/library/${canoe.id}`, { moment: canoe.id }];

/** A data layer that has loaded a bit of everything the Library shows, and one answer that is none of its business. */
function loadedClient() {
  const client = newClient();
  client.setQueryData(wallKey, { pages: [wallPage()], pageParams: [undefined] });
  client.setQueryData(itemKey, libraryItem());
  client.setQueryData([`/v1/library/${canoe.id}/comments`], { items: [] });
  client.setQueryData(['/v1/circles/c-linds/library/lenses'], {});
  client.setQueryData(['/v1/circles/c-linds/albums', { tab: 'shared' }], {});
  client.setQueryData(['/v1/albums/a-1'], {});
  client.setQueryData(['/v1/circles/c-linds/files', {}], {});
  client.setQueryData(['/v1/documents/d-1', { day: '2026-11-12' }], {});
  client.setQueryData(['/v1/circles/c-linds/storage'], {});
  client.setQueryData(['/v1/circles/c-other/library'], {});
  client.setQueryData(['/v1/me/settings'], {});
  return client;
}

describe("what the app does with loaded data after a change in the Library", () => {
  it('shows a heart on every loaded copy of the photo at once, and asks again for its page and the wall', async () => {
    const client = loadedClient();
    await cacheFor(client).photoLoved({ id: canoe.id, circleId: 'c-linds' }, false);
    const wall = client.getQueryData<{ pages: { items: { id: string; loved: boolean }[] }[] }>(wallKey);
    expect(wall?.pages[0]?.items.find((item) => item.id === canoe.id)?.loved).toBe(false);
    expect(client.getQueryData<{ item: { loved: boolean } }>(itemKey)?.item.loved).toBe(false);
    expect(stale(client, itemKey)).toBe(true);
    expect(stale(client, wallKey)).toBe(true);
    expect(stale(client, ['/v1/circles/c-other/library'])).toBe(false);
    expect(stale(client, ['/v1/me/settings'])).toBe(false);
  });

  it('asks again for a photo and its comments after something was said under it', async () => {
    const client = loadedClient();
    await cacheFor(client).photoCommented(canoe.id);
    expect(stale(client, itemKey)).toBe(true);
    expect(stale(client, [`/v1/library/${canoe.id}/comments`])).toBe(true);
    expect(stale(client, wallKey)).toBe(false);
  });

  it('follows a tag through the people in photos and the albums that fill themselves', async () => {
    const client = loadedClient();
    await cacheFor(client).photoTagged({ id: canoe.id, circleId: 'c-linds' });
    expect(stale(client, itemKey)).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/library/lenses'])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/albums', { tab: 'shared' }])).toBe(true);
    expect(stale(client, ['/v1/albums/a-1'])).toBe(true);
  });

  it('asks for every list of the circle again after photos were added', async () => {
    const client = loadedClient();
    await cacheFor(client).libraryAdded('c-linds');
    for (const key of [wallKey, ['/v1/circles/c-linds/library/lenses'], ['/v1/circles/c-linds/files', {}], ['/v1/circles/c-linds/storage'], ['/v1/albums/a-1']]) expect(stale(client, key)).toBe(true);
    expect(stale(client, ['/v1/circles/c-other/library'])).toBe(false);
  });

  it('asks for the albums and the photos that say which albums they are in, after an album changed', async () => {
    const client = loadedClient();
    await cacheFor(client).albumChanged({ id: 'a-1', circleId: 'c-linds' });
    expect(stale(client, ['/v1/albums/a-1'])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/albums', { tab: 'shared' }])).toBe(true);
    expect(stale(client, itemKey)).toBe(true);
    await cacheFor(loadedClient()).albumMade({ id: 'a-2', circleId: 'c-linds' });
  });

  it('asks for everything that lists or shows what many were shared or hidden', async () => {
    const client = loadedClient();
    await cacheFor(client).selectionChanged('c-linds');
    for (const key of [wallKey, itemKey, ['/v1/albums/a-1'], ['/v1/documents/d-1', { day: '2026-11-12' }]]) expect(stale(client, key)).toBe(true);
  });

  it('forgets what was loaded of the deleted ones, and asks for the lists again', async () => {
    const client = loadedClient();
    await cacheFor(client).selectionDeleted('c-linds', [canoe.id]);
    expect(client.getQueryData(itemKey)).toBeUndefined();
    expect(stale(client, wallKey)).toBe(true);
    expect(stale(client, ['/v1/albums/a-1'])).toBe(true);
  });

  it("asks for a document's page and the lists of files after it changed or got a reminder", async () => {
    const client = loadedClient();
    await cacheFor(client).documentChanged({ id: 'd-1', circleId: 'c-linds' });
    expect(stale(client, ['/v1/documents/d-1', { day: '2026-11-12' }])).toBe(true);
    expect(stale(client, ['/v1/circles/c-linds/files', {}])).toBe(true);
    const other = loadedClient();
    await cacheFor(other).documentReminded({ id: 'd-1', circleId: 'c-linds' });
    expect(stale(other, ['/v1/documents/d-1', { day: '2026-11-12' }])).toBe(true);
    await cacheFor(other).photoChanged({ id: canoe.id, circleId: 'c-linds' });
    expect(stale(other, itemKey)).toBe(true);
  });
});
