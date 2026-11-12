import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { OfflineStrip } from '@/features/navigation/OfflineStrip';
import { AskAboutNotifications } from '@/features/notifications/AskAboutNotifications';
import { usePushNotifications } from '@/features/notifications/usePushNotifications';
import { takeLink } from '@/lib/links';

// A screen that breaks while drawing shows a friendly page with a way to try again.
export { ErrorBoundary } from '@/features/navigation/ErrorBoundary';

// The tabs are always underneath. When a link or a notification opens the app straight onto a screen, Back
// and Close still have somewhere to go: Home.
export const unstable_settings = { anchor: '(tabs)' };

/** Everything a signed-in person sees: the four tabs, and the screens that open on top of them. */
export default function AppLayout() {
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
    <>
      {/* Without a connection a strip across the top says so, and the screens make room for it. */}
      <OfflineStrip>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          {/* What the + button opens is a sheet on an iPhone, over the tab it was opened from. */}
          <Stack.Screen name="plus" options={{ presentation: 'modal' }} />
        </Stack>
      </OfflineStrip>
      {/* The question about notifications, asked once, at a moment when there is something to hear about. */}
      <AskAboutNotifications />
    </>
  );
}
