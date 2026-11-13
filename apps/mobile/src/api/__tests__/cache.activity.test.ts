import { newClient } from '@/test/phone';
import { linds, coupleCircle } from '@/test/samples';
import { activityPage, ask, exported, ids } from '@/test/samples/activity';

import { cacheFor } from '../cache';

const ACTIVITY = ['infinite', '/v1/circles/c-linds/activity', { filter: 'all' }];
const ASKS = ['infinite', '/v1/circles/c-linds/activity', { filter: 'asks' }];
const UNREAD = ['/v1/circles/c-linds/activity/unread'];
const pages = (page = activityPage()) => ({ pages: [page], pageParams: [undefined] });

describe('what the app does with loaded data after something in Activity, an export or leaving', () => {
  it('takes the dot off the tab once Activity was seen, and leaves the list as it is', () => {
    const client = newClient();
    client.setQueryData(UNREAD, { fresh: 2, asks: 1 });
    client.setQueryData(ACTIVITY, pages());
    cacheFor(client).activitySeen('c-linds');
    expect(client.getQueryData(UNREAD)).toEqual({ fresh: 0, asks: 1 });
    expect(client.getQueryState(ACTIVITY)?.isInvalidated).toBe(false);
    // Nothing is made up for a circle whose dot was never asked for.
    cacheFor(client).activitySeen('c-couple');
    expect(client.getQueryData(['/v1/circles/c-couple/activity/unread'])).toBeUndefined();
  });

  it('shows a circle as muted at once, under every chip, and only that circle', () => {
    const client = newClient();
    client.setQueryData(ACTIVITY, pages());
    client.setQueryData(ASKS, pages());
    client.setQueryData(['infinite', '/v1/circles/c-couple/activity', { filter: 'all' }], pages());
    cacheFor(client).circleMuted('c-linds', true);
    expect((client.getQueryData(ACTIVITY) as ReturnType<typeof pages>).pages[0]?.muted).toBe(true);
    expect((client.getQueryData(ASKS) as ReturnType<typeof pages>).pages[0]?.muted).toBe(true);
    expect((client.getQueryData(['infinite', '/v1/circles/c-couple/activity', { filter: 'all' }]) as ReturnType<typeof pages>).pages[0]?.muted).toBe(false);
  });

  it('asks again for where you stand with a thing, and for Activity, after you asked or took a question back', async () => {
    const client = newClient();
    client.setQueryData([`/v1/things/${ids.pin}/ask`], { canAsk: true, ask: null });
    client.setQueryData(ACTIVITY, pages());
    client.setQueryData(['/v1/circles/c-linds/today'], {});
    await cacheFor(client).askChanged({ id: ids.pin, circleId: 'c-linds' });
    expect(client.getQueryState([`/v1/things/${ids.pin}/ask`])?.isInvalidated).toBe(true);
    expect(client.getQueryState(ACTIVITY)?.isInvalidated).toBe(true);
    expect(client.getQueryState(['/v1/circles/c-linds/today'])?.isInvalidated).toBe(false);
  });

  it('asks again for Activity, the dot and the thing itself after an ask was answered', async () => {
    const client = newClient();
    client.setQueryData(ACTIVITY, pages());
    client.setQueryData(UNREAD, { fresh: 0, asks: 1 });
    client.setQueryData([`/v1/vault/items/${ids.pin}`], {});
    client.setQueryData([`/v1/vault/items/${ids.pin}/sharing`], {});
    await cacheFor(client).askAnswered(ask({ state: 'allowed' }));
    expect(client.getQueryState(ACTIVITY)?.isInvalidated).toBe(true);
    expect(client.getQueryState(UNREAD)?.isInvalidated).toBe(true);
    expect(client.getQueryState([`/v1/vault/items/${ids.pin}`])?.isInvalidated).toBe(true);
    expect(client.getQueryState([`/v1/vault/items/${ids.pin}/sharing`])?.isInvalidated).toBe(true);
  });

  it('puts a new export first in the list at once, and takes a removed one out', async () => {
    const client = newClient();
    const older = exported({ id: 'older' });
    const made = exported({ id: 'newer', state: 'waiting', url: null });
    client.setQueryData(['/v1/circles/c-linds/exports'], [older]);
    await cacheFor(client).exportAsked(made);
    expect(client.getQueryData(['/v1/circles/c-linds/exports'])).toEqual([made, older]);
    // Asked for twice with one tap: still one.
    await cacheFor(client).exportAsked(made);
    expect(client.getQueryData(['/v1/circles/c-linds/exports'])).toEqual([made, older]);
    cacheFor(client).exportRemoved(older);
    expect(client.getQueryData(['/v1/circles/c-linds/exports'])).toEqual([made]);
  });

  it('takes a circle you left out of your circles at once, forgets what was loaded of it, and asks again for what counts across circles', async () => {
    const client = newClient();
    client.setQueryData(['/v1/circles'], [linds, coupleCircle]);
    client.setQueryData(['/v1/circles/c-linds/today'], {});
    client.setQueryData(['/v1/circles/c-couple/today'], {});
    client.setQueryData(['/v1/me/overview'], {});
    client.setQueryData(['/v1/home/circles'], {});
    await cacheFor(client).circleLeft(linds);
    expect(client.getQueryData(['/v1/circles'])).toEqual([coupleCircle]);
    expect(client.getQueryData(['/v1/circles/c-linds/today'])).toBeUndefined();
    expect(client.getQueryData(['/v1/circles/c-couple/today'])).toEqual({});
    expect(client.getQueryState(['/v1/circles'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['/v1/me/overview'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['/v1/home/circles'])?.isInvalidated).toBe(true);
  });
});
