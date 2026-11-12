import { useCallback, useEffect, useRef, useState } from 'react';

type State = { busy: boolean; error: unknown; /** How far a slow sum is, from 0 to 1. Null when nothing is being worked out. */ progress: number | null };

const IDLE: State = { busy: false, error: null, progress: null };

/**
 * Runs something that handles keys or what they open, and says only whether it is busy and whether it
 * failed. This stands in for the data layer's `useMutation` on purpose: that one keeps what it was given
 * and what came back (a typed Vault key, an opened password) in its cache, and nothing secret may ever be
 * there. What the work produces stays in the work's own closure, or in the screen's state.
 */
export function useSecretAction() {
  const [state, setState] = useState<State>(IDLE);
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);

  /** Runs the work. Resolves true when it went through, false when it failed (the failure is in `error`). */
  const run = useCallback(async (work: (progress: (done: number) => void) => Promise<void>): Promise<boolean> => {
    setState({ busy: true, error: null, progress: null });
    try {
      await work((done) => {
        if (shown.current) setState((old) => (old.busy ? { ...old, progress: done } : old));
      });
      if (shown.current) setState(IDLE);
      return true;
    } catch (error) {
      if (shown.current) setState({ busy: false, error, progress: null });
      return false;
    }
  }, []);
  const clear = useCallback(() => setState(IDLE), []);

  return { ...state, run, clear };
}
