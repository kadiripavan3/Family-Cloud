import { usePreventRemove } from 'expo-router';
import { useRef, useState } from 'react';

/**
 * Guards a screen that can lose what was typed. While `unsaved` is true, leaving it (the X, Android's back
 * button, a swipe) asks first: draw a `ConfirmSheet` while `asking`, with `stay` and `leave` as its two
 * answers. After saving, call `release()` before going on to another screen, so the guard doesn't ask about
 * what has just been saved.
 */
export function useUnsaved(unsaved: boolean): { asking: boolean; stay: () => void; leave: () => void; release: () => void } {
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const goOn = useRef<(() => void) | null>(null);
  const stopGuard = usePreventRemove(unsaved && !leaving, ({ repeat }) => {
    goOn.current = repeat;
    setAsking(true);
  });
  return {
    asking,
    stay: () => {
      goOn.current = null;
      setAsking(false);
    },
    leave: () => {
      setAsking(false);
      setLeaving(true);
      const carryOn = goOn.current;
      goOn.current = null;
      carryOn?.();
    },
    release: () => {
      setLeaving(true);
      stopGuard();
    },
  };
}
