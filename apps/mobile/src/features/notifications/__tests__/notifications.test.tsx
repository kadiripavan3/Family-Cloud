import { beforeSignOut, runBeforeSignOut } from '@/auth/beforeSignOut';

import { FALLBACK, hrefFor } from '../target';

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
