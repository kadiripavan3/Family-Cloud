import { Redirect, Stack, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useCircles } from '@/features/circles/current';
import { OfflineStrip } from '@/features/navigation/OfflineStrip';
import { usePushNotifications } from '@/features/notifications/usePushNotifications';
import { takeLink } from '@/lib/links';

// A screen that breaks while drawing shows a friendly page with a way to try again.
export { ErrorBoundary } from '@/features/navigation/ErrorBoundary';

// The tabs are always underneath. When a link or a notification opens the app straight onto a screen, Back
// and Close still have somewhere to go: Home.
export const unstable_settings = { anchor: '(tabs)' };

/**
 * Everything a signed-in person sees: the four tabs, and the screens that open on top of them. All of it is
 * about a circle, so someone who is in none is sent to set one up (or to the invitation that brought them)
 * before any of it is drawn. That is why every screen in here can call `useCircle()`.
 */
export default function AppLayout() {
  const circles = useCircles();
  if (circles.length === 0) return <Redirect href="/setup" />;
  return <SignedInApp />;
}

function SignedInApp() {
  const router = useRouter();

  // A tapped notification opens its screen; a phone that said yes stays connected.
  usePushNotifications();

  // A shared link (an invitation, mostly) that opened the app before the person had signed in is opened now.
  // When the router has shown it already, it is only forgotten.
  const pathname = usePathname();
  useEffect(() => {
    const link = takeLink();
    if (link && link !== pathname) router.navigate(link);
  }, [pathname, router]);

  return (
    // Without a connection a strip across the top says so, and the screens make room for it.
    <OfflineStrip>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        {/* What the + button opens is a sheet on an iPhone, over the tab it was opened from. */}
        <Stack.Screen name="plus" options={{ presentation: 'modal' }} />
      </Stack>
    </OfflineStrip>
  );
}
