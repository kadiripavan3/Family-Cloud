import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { connectSession } from '@/api/fetcher';
import { forgetKept, keepWriting, restoreKept } from '@/api/kept';

import { runBeforeSignOut } from './beforeSignOut';
import { signInService, type SignInWay } from './signIn';
import { accountOf } from './token';

type SessionState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn' };

type Session = SessionState & {
  signOut: () => Promise<void>;
  /** How the signed-in person signed in on this phone: by email code, with Apple or with Google. Null until that is known, and while nobody is signed in. */
  provider: SignInWay | null;
};

const SessionContext = createContext<Session | null>(null);

/**
 * Whether someone is signed in. The sign-in service (the test one, or Supabase) says so: when the app starts,
 * when a code or Apple or Google signs someone in, when a token is renewed, and when the sign-in ends.
 *
 * What was read is kept on the phone for the signed-in person (`api/kept`): it is put back when the app
 * starts, before anything is asked, and removed whenever the sign-in ends.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [provider, setProvider] = useState<SignInWay | null>(null);
  const token = useRef<string | null>(null);
  /** True once last time's sign-in has been looked up. Until then the start-up decides what is shown. */
  const started = useRef(false);
  const ending = useRef(false);

  /**
   * The one way a sign-in ends, whoever ended it: the person ("asked"), or the sign-in service, which
   * refused to renew it ("refused"). Either way this phone stops getting the person's notifications, and
   * nothing of them stays in memory or on the phone.
   */
  const end = useCallback(
    async (how: 'asked' | 'refused') => {
      if (ending.current) return;
      ending.current = true;
      try {
        // A refused token can't ask the API for anything any more: the goodbyes then do what they can without it.
        if (how === 'refused') token.current = null;
        await runBeforeSignOut();
        token.current = null;
        if (how === 'asked') await signInService.signOut().catch(() => undefined);
        queryClient.clear();
        await forgetKept();
        setProvider(null);
        setState({ status: 'signedOut' });
      } finally {
        ending.current = false;
      }
    },
    [queryClient],
  );
  const signOut = useCallback(() => end('asked'), [end]);

  useEffect(() => {
    const hear = (next: string | null) => {
      const was = token.current;
      if (!next) {
        if (was) void end('refused');
        return;
      }
      // Someone else's sign-in, without a sign-out in between: nothing of the person before stays.
      if (was && accountOf(was) !== accountOf(next)) {
        queryClient.clear();
        void forgetKept();
      }
      token.current = next;
      if (started.current && !was) setState({ status: 'signedIn' });
    };
    connectSession({
      getToken: () => token.current,
      renew: async () => {
        const fresh = await signInService.renew();
        if (fresh) token.current = fresh;
        return fresh;
      },
      onSignedOut: () => void end('asked'),
    });
    const stopHearing = signInService.onToken(hear);
    const stopWriting = keepWriting(queryClient, () => accountOf(token.current));
    void signInService
      .restore()
      .catch(() => null)
      .then(async (saved) => {
        // A token heard meanwhile (a renewal) is newer than the one that was saved.
        token.current ??= saved;
        await restoreKept(queryClient, accountOf(token.current));
        started.current = true;
        setState({ status: token.current ? 'signedIn' : 'signedOut' });
      });
    return () => {
      stopHearing();
      stopWriting();
    };
  }, [queryClient, end]);

  const signedIn = state.status === 'signedIn';
  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    void signInService
      .signedInWith()
      .catch(() => null)
      .then((way) => {
        if (current) setProvider(way);
      });
    return () => {
      current = false;
    };
  }, [signedIn]);

  const value = useMemo(() => ({ ...state, signOut, provider }), [state, signOut, provider]);
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');
  return session;
}
