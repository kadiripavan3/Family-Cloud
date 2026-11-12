import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { takeLink } from '@/lib/links';

// A screen that breaks while drawing shows a friendly page with a way to try again.
export { ErrorBoundary } from '@/features/navigation/ErrorBoundary';

/**
 * 2 Getting into a circle: setting one up (the steps a new person goes through after their profile is made,
 * and again from "New circle"), and joining one by a link. Open to anyone with a profile, whether or not
 * they are in a circle yet.
 */
export default function SetupLayout() {
  const router = useRouter();
  // Someone who came by an invitation and had to sign up first is taken to it now, instead of making a circle of their own.
  const pathname = usePathname();
  useEffect(() => {
    const link = takeLink();
    if (link && link !== pathname) router.replace(link);
  }, [pathname, router]);
  return <Stack screenOptions={{ headerShown: false }} />;
}
