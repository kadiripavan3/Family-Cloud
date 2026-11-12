import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useOnboarding } from '@/auth/onboarding';

/**
 * Ends setting up (or joining) a circle and opens Home on it. For a new person this is also where sign-up
 * ends; for someone who came from "New circle" the steps simply close.
 */
export function useFinishSetup(): () => void {
  const router = useRouter();
  const onboarding = useOnboarding();
  return useCallback(() => {
    onboarding.finish();
    // Back to Home when it is underneath; otherwise Home takes this screen's place.
    router.dismissTo('/');
  }, [onboarding, router]);
}
