import { useCallback, useEffect, useState } from 'react';

import { keep } from './keep';

/**
 * A small choice that is remembered on this phone between runs of the app: a switch on a settings page, what
 * was picked at setup. It starts as `initial`, takes the remembered value as soon as the phone has answered,
 * and is written back whenever it changes. `key` says whose it is where that matters
 * (`homeport.security.<account id>`).
 */
export function useKept<T>(key: string, initial: T): [value: T, set: (next: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let current = true;
    void keep.get(key).then((stored) => {
      if (!current || stored === null) return;
      try {
        setValue(JSON.parse(stored) as T);
      } catch {
        // Something that can't be read is as good as nothing remembered.
      }
    });
    return () => {
      current = false;
    };
  }, [key]);
  const set = useCallback(
    (next: T) => {
      setValue(next);
      void keep.set(key, JSON.stringify(next));
    },
    [key],
  );
  return [value, set];
}
