import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { keep } from './keep';

/** What has been read from the phone, or set, in this run of the app: by key, as the text it is kept as. */
const known = new Map<string, string>();
const asked = new Set<string>();
const listeners = new Set<() => void>();

function tell() {
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A small choice that is remembered on this phone between runs of the app: a switch on a settings page, what
 * was picked at setup. It starts as `initial`, takes the remembered value as soon as the phone has answered,
 * and is written back whenever it changes. Every screen that uses the same `key` sees the same value, at
 * once. The key says whose it is where that matters (`homeport.security.<account id>`).
 */
export function useKept<T>(key: string, initial: T): [value: T, set: (next: T) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => known.get(key),
    () => known.get(key),
  );
  useEffect(() => {
    if (asked.has(key)) return;
    asked.add(key);
    void keep.get(key).then((text) => {
      // Something set meanwhile is newer than what the phone remembered.
      if (text === null || known.has(key)) return;
      known.set(key, text);
      tell();
    });
  }, [key]);
  const set = useCallback(
    (next: T) => {
      const text = JSON.stringify(next);
      known.set(key, text);
      asked.add(key);
      tell();
      void keep.set(key, text);
    },
    [key],
  );
  return [read(stored, initial), set];
}

function read<T>(text: string | undefined, initial: T): T {
  if (text === undefined) return initial;
  try {
    return JSON.parse(text) as T;
  } catch {
    // Something that can't be read is as good as nothing remembered.
    return initial;
  }
}

/** For tests: forgets what was read and set in this run. */
export function forgetKeptChoices(): void {
  known.clear();
  asked.clear();
}
