import { useEffect, useSyncExternalStore } from 'react';

import { type KeptHow, keptHow } from './keeper';

/**
 * How this phone keeps the key between unlocks, for the screens: "device" (behind Face ID), "passcode", or
 * null when it keeps none. `undefined` while the phone hasn't answered yet. Whoever changes it (keeping the
 * key after typing it, signing out) calls `keptChanged`, and every screen sees the new answer.
 */
const known = new Map<string, KeptHow | null>();
const listeners = new Set<() => void>();

function subscribe(heard: () => void) {
  listeners.add(heard);
  return () => {
    listeners.delete(heard);
  };
}

async function ask(account: string) {
  const how = await keptHow(account);
  known.set(account, how);
  for (const heard of listeners) heard();
}

/** Asks the phone again: something was kept or forgotten. */
export function keptChanged(account: string): Promise<void> {
  return ask(account);
}

export function useKeptHow(account: string | undefined): KeptHow | null | undefined {
  const how = useSyncExternalStore(
    subscribe,
    () => (account ? known.get(account) : undefined),
    () => undefined,
  );
  useEffect(() => {
    if (account && !known.has(account)) void ask(account);
  }, [account]);
  return how;
}

/** For tests: forgets what was asked. */
export function forgetKnown(): void {
  known.clear();
}
