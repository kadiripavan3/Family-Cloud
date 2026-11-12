import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageFor } from '@/api/fetcher';
import { isGone } from '@/lib/loading';
import { Problem } from '@/ui/Problem';
import { words } from '@/words';

/** Goes to Home from anywhere: closes what is open on top of the tabs, or opens the tabs when there are none underneath. */
export function useGoHome(): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canDismiss()) {
      router.dismissAll();
      router.navigate('/');
    } else {
      router.replace('/');
    }
  }, [router]);
}

type Props = {
  /** What the API (or the network) answered. */
  error: unknown;
  /** Asks again for everything that failed (`loadState(...).retry`). */
  onRetry: () => void;
  retrying?: boolean;
  tone?: 'page' | 'onPhoto';
  /** False on a screen that already keeps clear of the home bar (it sits in a `SafeAreaView` with all its edges). */
  inset?: boolean;
};

/**
 * Something went wrong: a whole page that didn't load. It says what happened in the API's words and offers
 * "Try again" and "Go to Home". Something that isn't there (deleted, or no longer shared) can't be helped
 * by asking again, so that page offers only the way Home.
 */
export function PageProblem({ error, onRetry, retrying, tone, inset = true }: Props) {
  const home = useGoHome();
  const insets = useSafeAreaInsets();
  const gone = isGone(error);
  return (
    <View style={{ flex: 1, paddingBottom: inset ? insets.bottom : 0 }}>
      <Problem tone={tone} title={gone ? words.states.problem.gone : undefined} message={messageFor(error)} onRetry={gone ? undefined : onRetry} retrying={retrying} onHome={home} />
    </View>
  );
}
