import { QueryClient } from '@tanstack/react-query';

import { me, nora, settings } from '@/test/samples';

import { cacheFor } from '../cache';
import { more, paged, rows } from '../pages';

/** A client that keeps what it is given and sets no timers, so the test run can end. */
const newClient = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });

describe('what the app does with loaded data after a change', () => {
  it('shows a saved profile at once, and asks again only for what says who the person is', async () => {
    const client = newClient();
    client.setQueryData(['/v1/me'], me(null));
    client.setQueryData(['/v1/me/settings'], settings());
    client.setQueryData(['/v1/circles'], { items: [] });

    await cacheFor(client).profileSaved(nora);

    expect(client.getQueryData(['/v1/me'])).toEqual(me(nora));
    expect(client.getQueryState(['/v1/me'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['/v1/me/settings'])?.isInvalidated).toBe(true);
    // A list that says nothing about the person is left alone.
    expect(client.getQueryState(['/v1/circles'])?.isInvalidated).toBe(false);
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
