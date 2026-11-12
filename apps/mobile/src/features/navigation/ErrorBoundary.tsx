import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';

import { reportCrash } from '@/features/crashes/crashes';
import { ErrorScreen } from '@/ui/ErrorScreen';

/**
 * What Expo Router shows when a screen throws while drawing. Each group of screens (sign-in, sign-up, the app)
 * exports it from its layout, so a broken screen takes down only its own group, and "Try again" draws it afresh.
 * The root layout exports it too, for anything that breaks above the groups.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error(error);
    reportCrash(error);
  }, [error]);
  return <ErrorScreen onRetry={() => void retry()} detail={__DEV__ ? error.message : undefined} />;
}
