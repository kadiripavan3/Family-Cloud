import { beforeSignOut, runBeforeSignOut } from '@/auth/beforeSignOut';

import { FALLBACK, hrefFor } from '../target';

const ID = '0b9f6c1e-3a52-4d6f-9a51-6f0c2a1d7e42';

describe('where a notification opens the app', () => {
  it('opens the screen it names, when that is one of the screens it may open', () => {
    expect(hrefFor('/activity')).toBe('/activity');
    expect(hrefFor('/people')).toBe('/people');
    expect(hrefFor('/you')).toBe('/you');
    // Whatever is tacked on after the path is left behind.
    expect(hrefFor('/you?from=push')).toBe('/you');
  });

  it('lands on Activity for anything it does not know, rather than on a missing screen', () => {
    for (const strange of [undefined, null, 42, '', '/', '/settings/delete-account', '/bills/0b9f6c1e-3a52-4d6f-9a51-6f0c2a1d7e42', '/you/extra', 'https://example.com/elsewhere', 'toString', '__proto__']) {
      expect(hrefFor(strange)).toBe(FALLBACK);
    }
    // An id has to look like one, wherever it stands.
    for (const strange of ['/bill/electricity', '/bill/', `/summary/the-linds?week=2026-11-02`, '/vault/entrusted/someone', `/bill/${ID}/more`]) {
      expect(hrefFor(strange)).toBe(FALLBACK);
    }
  });

  it('opens the thing a notification is about, by its kind: a turn, a bill that is due, something shared, what you asked to see', () => {
    // A reminder that is due or a turn ("Take the bins out tonight"), a nudge, an event about to start.
    expect(hrefFor(`/reminder/${ID}`)).toEqual({ pathname: '/[kind]/[id]', params: { kind: 'reminder', id: ID } });
    expect(hrefFor(`/event/${ID}`)).toEqual({ pathname: '/[kind]/[id]', params: { kind: 'event', id: ID } });
    // A bill that is due, with or without its details ("A bill is due tomorrow · Open to see which one").
    expect(hrefFor(`/bill/${ID}`)).toEqual({ pathname: '/[kind]/[id]', params: { kind: 'bill', id: ID } });
    // A reminder about money in a split, something shared by name, and "yes" to an ask.
    expect(hrefFor(`/split/${ID}`)).toEqual({ pathname: '/[kind]/[id]', params: { kind: 'split', id: ID } });
    expect(hrefFor(`/page/${ID}`)).toEqual({ pathname: '/[kind]/[id]', params: { kind: 'page', id: ID } });
    expect(hrefFor(`/vault-item/${ID}`)).toEqual({ pathname: '/[kind]/[id]', params: { kind: 'vault-item', id: ID } });
  });

  it('opens Activity on the Asks chip when someone asks to see something, or said not now', () => {
    expect(hrefFor('/activity?filter=asks')).toEqual({ pathname: '/activity', params: { filter: 'asks' } });
    // A chip this version doesn't have is left out, not passed on.
    expect(hrefFor('/activity?filter=secrets')).toBe('/activity');
  });

  it('opens Home on the Library for a batch of photos', () => {
    expect(hrefFor('/library')).toEqual({ pathname: '/', params: { place: 'library' } });
  });

  it("opens the Sunday summary on that circle's week", () => {
    expect(hrefFor(`/summary/${ID}?week=2026-11-02`)).toEqual({ pathname: '/summary/[circleId]', params: { circleId: ID, week: '2026-11-02' } });
    expect(hrefFor(`/summary/${ID}`)).toEqual({ pathname: '/summary/[circleId]', params: { circleId: ID } });
    expect(hrefFor(`/summary/${ID}?week=last`)).toEqual({ pathname: '/summary/[circleId]', params: { circleId: ID } });
  });

  it('opens Export and leaving when an export is ready', () => {
    expect(hrefFor('/settings/leaving')).toBe('/settings/leaving');
  });

  it("opens the Vault's own pages for its notices", () => {
    expect(hrefFor('/vault/emergency')).toBe('/vault/emergency');
    expect(hrefFor('/vault/helping')).toBe('/vault/helping');
    expect(hrefFor('/vault/key')).toBe('/vault/key');
    expect(hrefFor(`/vault/entrusted/${ID}`)).toEqual({ pathname: '/vault/entrusted/[id]', params: { id: ID } });
    expect(hrefFor('/vault/entrusted')).toEqual({ pathname: '/', params: { place: 'vault' } });
  });
});

describe('before signing out', () => {
  it('runs every goodbye, survives one that fails, and can take one away again', async () => {
    const fine = jest.fn();
    const broken = jest.fn(() => Promise.reject(new Error('offline')));
    const removed = jest.fn();
    const stops = [beforeSignOut(fine), beforeSignOut(broken)];
    beforeSignOut(removed)();

    await expect(runBeforeSignOut()).resolves.toBeUndefined();

    expect(fine).toHaveBeenCalledTimes(1);
    expect(broken).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
    stops.forEach((stop) => stop());
  });

  it('does not wait for ever on a goodbye that hangs', async () => {
    jest.useFakeTimers();
    const stop = beforeSignOut(() => new Promise<void>(() => {}));
    const done = runBeforeSignOut();
    await jest.advanceTimersByTimeAsync(3000);
    await expect(done).resolves.toBeUndefined();
    stop();
    jest.useRealTimers();
  });
});
