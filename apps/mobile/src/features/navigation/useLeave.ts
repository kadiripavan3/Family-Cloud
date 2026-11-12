import { type Href, useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * Leaves the current screen: back to where the person came from, or, when there is nowhere to go back to
 * (the app was opened straight onto this screen by a link or a notification), to Home. Every Back and Close
 * uses this, so no screen can become a dead end.
 */
export function useLeave(fallback: Href = '/'): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}
