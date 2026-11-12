import { MutationCache, QueryClient } from '@tanstack/react-query';

import { ApiError, isUnreachable } from './fetcher';
import { changeNotSent } from './online';

/** How long an answer nobody is looking at stays in memory: for as long as the app is likely to stay open. */
const IN_MEMORY_FOR_MS = 24 * 60 * 60 * 1000;

/**
 * The app's data layer, set up once in the root layout.
 *
 *  - Reading waits without a connection (what was loaded stays on screen) and is asked again when it is back.
 *  - A change (a tick, a save) never waits in silence: without a connection it fails at once with the app's
 *    own "can't reach" sentence, so nothing looks done that isn't.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isUnreachable(error)) changeNotSent();
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: IN_MEMORY_FOR_MS,
        // Asking again won't fix "not allowed" or "not found".
        retry: (failures, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
      },
      mutations: { networkMode: 'always' },
    },
  });
}
