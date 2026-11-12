import { newClient } from '@/test/phone';
import { board, startedLive, startedPlain } from '@/test/samples/templates';

import { cacheFor } from '../cache';

const ID = '33333333-3333-4333-8333-333333333333';
const OWN = `/v1/boards/${ID}`;
const stale = (client: ReturnType<typeof newClient>, key: unknown[]) => client.getQueryState(key)?.isInvalidated;

describe('what the app does with loaded data after a board changes', () => {
  it('writes the board the API sent back over the board as it opens, and asks again for its other parts and its lists', async () => {
    const client = newClient();
    const today = [OWN, { day: '2026-11-11' }];
    const nextWeek = [OWN, { day: '2026-11-11', show: '2026-11-16' }];
    const entries = ['infinite', `${OWN}/entries`, { kind: 'quote' }];
    const boards = ['/v1/circles/c-linds/boards'];
    const todayList = ['/v1/circles/c-linds/today'];
    const another = ['/v1/boards/another', { day: '2026-11-11' }];
    for (const key of [today, nextWeek, entries, boards, todayList, another]) client.setQueryData(key, { old: true });

    const saved = board({ title: 'A new name' });
    await cacheFor(client).boardSaved(saved);

    expect(client.getQueryData(today)).toEqual(saved);
    expect(stale(client, today)).toBe(false);
    // Another week of the same board was not sent back: it is asked for again, and so is a list of its entries.
    expect(client.getQueryData(nextWeek)).toEqual({ old: true });
    expect(stale(client, nextWeek)).toBe(true);
    expect(stale(client, entries)).toBe(true);
    // What lists show of it (its line on Today, among the circle's boards) is asked for again; another board is left alone.
    expect(stale(client, boards)).toBe(true);
    expect(stale(client, todayList)).toBe(true);
    expect(stale(client, another)).toBe(false);
  });

  it('asks for everything of a board again when the API did not send it back', async () => {
    const client = newClient();
    const today = [OWN, { day: '2026-11-11' }];
    const entries = ['infinite', `${OWN}/entries`];
    client.setQueryData(today, board());
    client.setQueryData(entries, { pages: [] });
    await cacheFor(client).boardTouched({ id: ID, circleId: 'c-linds' });
    expect(stale(client, today)).toBe(true);
    expect(stale(client, entries)).toBe(true);
  });

  it('keeps the board a started template came with, so opening it asks for nothing, and tells the circle something was made', async () => {
    const client = newClient();
    client.setQueryData(['/v1/circles/c-linds/today'], {});
    await cacheFor(client).templateStarted(startedLive, 'c-linds', '2026-11-11');
    expect(client.getQueryData([OWN, { day: '2026-11-11' }])).toEqual(startedLive.board);
    expect(stale(client, ['/v1/circles/c-linds/today'])).toBe(true);

    await cacheFor(client).templateStarted(startedPlain, 'c-linds', '2026-11-11');
    expect(client.getQueryCache().findAll({ predicate: (query) => String(query.queryKey[0]).startsWith('/v1/boards/') })).toHaveLength(1);
  });
});
