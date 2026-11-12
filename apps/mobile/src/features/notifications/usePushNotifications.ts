import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { connectThisPhone, loadNotifications, reconnectIfMoved } from './device';
import { pushSupport } from './support';
import { hrefFor } from './target';

/** The notification opened last, so the one that started the app isn't opened a second time by the listener. */
let lastOpened: string | null = null;

/**
 * For the signed-in app: keeps this phone connected for notifications (if the person said yes), tells the
 * API when the phone's time zone has changed, and opens the right screen when a notification is tapped, also
 * when that tap is what started the app. In a browser and in Expo Go it does nothing.
 */
export function usePushNotifications() {
  const router = useRouter();

  useEffect(() => {
    if (pushSupport() !== 'ready') return;
    let mounted = true;
    let stop: (() => void) | undefined;
    // Back from being put away: a phone that changed time zone meanwhile says so.
    const resumed = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconnectIfMoved();
    });

    void (async () => {
      try {
        const Notifications = await loadNotifications();
        if (!mounted) return;
        void connectThisPhone();

        const open = (response: { actionIdentifier: string; notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } } }) => {
          // Only a plain tap opens a screen. A button on a notification, or words typed into one (the pinned
          // note's line), is an answer given without opening the app: Jot hears those itself.
          if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
          const { identifier, content } = response.notification.request;
          if (identifier === lastOpened) return;
          lastOpened = identifier;
          router.push(hrefFor(content.data?.url));
        };

        const first = Notifications.getLastNotificationResponse();
        if (first) {
          open(first);
          Notifications.clearLastNotificationResponse();
        }
        const listener = Notifications.addNotificationResponseReceivedListener(open);
        stop = () => listener.remove();
        if (!mounted) stop();
      } catch {
        // Without notifications the app is the same app; Activity shows everything.
      }
    })();

    return () => {
      mounted = false;
      resumed.remove();
      stop?.();
    };
  }, [router]);
}
