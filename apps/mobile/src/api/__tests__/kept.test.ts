import { QueryClient } from '@tanstack/react-query';

import { forgetKept, KEEP_FOR_MS, keepWriting, restoreKept, snapshot } from '../kept';

const mockKept = new Map<string, string>();
jest.mock('@/lib/keep', () => ({
  keep: {
    get: (key: string) => Promise.resolve(mockKept.get(key) ?? null),
    set: (key: string, value: string) => Promise.resolve(void mockKept.set(key, value)),
    remove: (key: string) => Promise.resolve(void mockKept.delete(key)),
  },
}));

/** A client that sets no timers of its own, so the test run can end. */
const newClient = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
const KEY = 'homeport.kept.v1';
const addresses = (text: string) => (JSON.parse(text) as { queries: { key: unknown[] }[] }).queries.map((query) => query.key.find((part) => typeof part === 'string' && part.startsWith('/')));

describe('what was read stays on the phone', () => {
  beforeEach(() => mockKept.clear());

  it('comes back at the next start, for the same person, with the time it was read', async () => {
    const before = newClient();
    const readAt = Date.now() - 60_000;
    before.setQueryData(['/v1/me'], { id: 'nora', profile: { displayName: 'Nora' } }, { updatedAt: readAt });
    before.setQueryData(['infinite', '/v1/circles', { limit: 100 }], { pages: [{ items: [{ id: 'c1' }], nextCursor: null }], pageParams: [undefined] }, { updatedAt: readAt });
    mockKept.set(KEY, snapshot(before, 'nora'));

    const after = newClient();
    await restoreKept(after, 'nora');

    expect(after.getQueryData(['/v1/me'])).toEqual({ id: 'nora', profile: { displayName: 'Nora' } });
    expect(after.getQueryData(['infinite', '/v1/circles', { limit: 100 }])).toMatchObject({ pages: [{ items: [{ id: 'c1' }] }] });
    // It is as old as it was, and marked to be asked for again: shown at once, fresh as soon as it can be.
    expect(after.getQueryState(['/v1/me'])).toMatchObject({ dataUpdatedAt: readAt, isInvalidated: true });
  });

  it('is never put back for another person, or for nobody: it is removed instead', async () => {
    const before = newClient();
    before.setQueryData(['/v1/me'], { id: 'nora' });
    mockKept.set(KEY, snapshot(before, 'nora'));

    const other = newClient();
    await restoreKept(other, 'alex');
    expect(other.getQueryData(['/v1/me'])).toBeUndefined();
    expect(mockKept.has(KEY)).toBe(false);

    mockKept.set(KEY, snapshot(before, 'nora'));
    await restoreKept(newClient(), null);
    expect(mockKept.has(KEY)).toBe(false);
  });

  it('leaves out anything too old, and what was never an answer from the API; a copy that cannot be read counts as none', async () => {
    const client = newClient();
    const now = Date.now();
    client.setQueryData(['/v1/circles'], { items: [] });
    client.setQueryData(['/v1/circles/c1'], { id: 'c1' }, { updatedAt: now - KEEP_FOR_MS - 1000 });
    client.setQueryData(['something of the app\'s own'], { open: true });

    expect(addresses(snapshot(client, 'nora', now))).toEqual(['/v1/circles']);

    mockKept.set(KEY, '{"owner":"nora","queries":[{"key":');
    const after = newClient();
    await restoreKept(after, 'nora');
    expect(after.getQueryCache().getAll()).toHaveLength(0);
    expect(mockKept.has(KEY)).toBe(false);
  });

  it('keeps what the app cannot open without, whatever else was read since', () => {
    const client = newClient();
    const now = Date.now();
    client.setQueryData(['/v1/me'], { id: 'nora' }, { updatedAt: now - 5 * 60 * 60 * 1000 });
    for (let i = 0; i < 80; i += 1) client.setQueryData([`/v1/circles/c${i}`], { id: `c${i}` }, { updatedAt: now - i * 1000 });

    const kept = addresses(snapshot(client, 'nora', now));

    expect(kept).toHaveLength(60);
    expect(kept[0]).toBe('/v1/me');
    expect(kept).toContain('/v1/circles/c0');
    expect(kept).not.toContain('/v1/circles/c79');
  });

  it('never writes down what was searched for, or an invitation', () => {
    const client = newClient();
    const now = Date.now();
    client.setQueryData(['/v1/me'], { id: 'nora' }, { updatedAt: now });
    client.setQueryData(['/v1/circles'], [], { updatedAt: now });
    client.setQueryData(['/v1/circles/c1/today', { day: '2026-11-11' }], {}, { updatedAt: now });
    client.setQueryData(['/v1/circles/c1/search', { q: 'passport' }], { words: 'passport', hits: [] }, { updatedAt: now });
    client.setQueryData(['/v1/join/the-linds'], { name: 'The Linds' }, { updatedAt: now });
    expect(addresses(snapshot(client, 'nora', now)).sort()).toEqual(['/v1/circles', '/v1/circles/c1/today', '/v1/me']);
  });

  it('is written a little after a change, only while someone is signed in, and removed on sign-out', async () => {
    jest.useFakeTimers();
    try {
      const client = newClient();
      let owner: string | null = 'nora';
      const stop = keepWriting(client, () => owner);

      client.setQueryData(['/v1/me'], { id: 'nora' });
      expect(mockKept.has(KEY)).toBe(false);
      await jest.advanceTimersByTimeAsync(3000);
      expect(JSON.parse(mockKept.get(KEY) ?? '{}')).toMatchObject({ owner: 'nora', queries: [{ key: ['/v1/me'], data: { id: 'nora' } }] });

      // Signing out: the copy goes, and what is cleared from memory right after doesn't write it back.
      owner = null;
      client.setQueryData(['/v1/circles'], { items: [] });
      await forgetKept();
      client.clear();
      await jest.advanceTimersByTimeAsync(3000);
      expect(mockKept.has(KEY)).toBe(false);
      stop();
    } finally {
      jest.useRealTimers();
    }
  });
});
