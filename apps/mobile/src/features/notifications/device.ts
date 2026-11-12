import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { forgetDevice, registerDevice } from '@/api/generated/homeport';
import { beforeSignOut } from '@/auth/beforeSignOut';
import { keep } from '@/lib/keep';
import { words } from '@/words';

import { pushSupport } from './support';

type Notifications = typeof import('expo-notifications');

let library: Promise<Notifications> | null = null;

/**
 * The notifications library, loaded the first time it is needed and only where it can work: callers check
 * `pushSupport()` first, so a browser and Expo Go never load it. While the app is open a notification shows
 * as a quiet banner.
 */
export function loadNotifications(): Promise<Notifications> {
  library ??= Promise.resolve().then(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- on purpose: loaded here and nowhere else, only when needed
    const Notifications = require('expo-notifications') as Notifications;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
    return Notifications;
  });
  return library;
}

/**
 * The address of this phone at the push service, once the API knows it, and the time zone it was sent with.
 * The address is also written down on the phone: signing out has to take it back in a later run of the app
 * too, when this run never got as far as connecting (no connection at start-up, say).
 */
let connected: string | null = null;
let sentZone: string | undefined;
const ADDRESS_KEY = 'homeport.push.address';
/** Set once the person has seen the app's own question about notifications on this phone. */
const ASKED_KEY = 'homeport.push.asked';

/** What came of asking: notifications are on, the person (or the phone) said no, or this copy of the app can't have them. */
export type PushAnswer = 'on' | 'off' | 'unavailable';

/** What the phone says now, without asking anything. */
export async function pushAllowed(): Promise<boolean> {
  if (pushSupport() !== 'ready') return false;
  try {
    const Notifications = await loadNotifications();
    return allowed(Notifications, await Notifications.getPermissionsAsync());
  } catch {
    return false;
  }
}

/**
 * Shows the phone's own question and, on a yes, connects this phone. The phone asks only once; after that it
 * answers from memory, and the person changes their mind in the phone's settings.
 */
export async function turnOnPush(): Promise<PushAnswer> {
  if (pushSupport() !== 'ready') return 'unavailable';
  try {
    const Notifications = await loadNotifications();
    await prepareAndroid(Notifications);
    let status = await Notifications.getPermissionsAsync();
    if (!allowed(Notifications, status) && status.canAskAgain) status = await Notifications.requestPermissionsAsync();
    if (!allowed(Notifications, status)) return 'off';
    await connect(Notifications);
    return 'on';
  } catch {
    return 'off';
  }
}

/** Connects this phone when the person has already said yes. Called each time the app opens; quiet when it can't. */
export async function connectThisPhone(): Promise<boolean> {
  if (pushSupport() !== 'ready') return false;
  try {
    const Notifications = await loadNotifications();
    if (!allowed(Notifications, await Notifications.getPermissionsAsync())) return false;
    await prepareAndroid(Notifications);
    return await connect(Notifications);
  } catch {
    return false;
  }
}

/**
 * The app came back to the front. A phone that travelled meanwhile tells the API its new time zone, so
 * reminders keep arriving in the evening and not at night.
 */
export async function reconnectIfMoved(): Promise<void> {
  if (connected && timeZone() !== sentZone) await connectThisPhone();
}

/**
 * Takes this phone off the person's list, so nothing of theirs arrives here once they are signed out, and
 * the next person to sign in here doesn't get their notifications. When the API can't be told (no
 * connection, or the sign-in had ended already), the phone itself stops listening instead; the API then
 * drops the address as soon as the push service says it is gone.
 */
export async function forgetThisPhone(): Promise<void> {
  if (pushSupport() !== 'ready') return;
  const token = connected ?? (await keep.get(ADDRESS_KEY));
  connected = null;
  sentZone = undefined;
  if (!token) return;
  await keep.remove(ADDRESS_KEY);
  try {
    await forgetDevice({ token });
  } catch {
    try {
      const Notifications = await loadNotifications();
      await Notifications.unregisterForNotificationsAsync();
    } catch {
      // Nothing more this phone can do. The API still forgets it once the push service says so.
    }
  }
}

/**
 * True when the app's own question about notifications is still worth showing on this phone: notifications
 * can work here, the phone hasn't been asked (or would ask again), and the person hasn't seen our question
 * on this install.
 */
export async function shouldAskAboutPush(): Promise<boolean> {
  if (pushSupport() !== 'ready') return false;
  if ((await keep.get(ASKED_KEY)) !== null) return false;
  try {
    const Notifications = await loadNotifications();
    const status = await Notifications.getPermissionsAsync();
    return !allowed(Notifications, status) && status.canAskAgain;
  } catch {
    return false;
  }
}

/** The person has seen the app's question about notifications on this phone. It isn't shown again. */
export function askedAboutPush(): Promise<void> {
  return keep.set(ASKED_KEY, '1');
}

// Signing out goes through here first, while the API still knows who is asking.
beforeSignOut(forgetThisPhone);

async function connect(Notifications: Notifications): Promise<boolean> {
  // The push service knows the app by its project. Without one (before the first real build) there is no address to get.
  const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (typeof projectId !== 'string' || !projectId) return false;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const zone = timeZone();
  await registerDevice({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android', timeZone: zone });
  connected = token;
  sentZone = zone;
  await keep.set(ADDRESS_KEY, token);
  return true;
}

function allowed(Notifications: Notifications, status: Awaited<ReturnType<Notifications['getPermissionsAsync']>>): boolean {
  return status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/** Android shows its question only once the app has a channel to put notifications in. */
async function prepareAndroid(Notifications: Notifications): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', { name: words.common.appName, importance: Notifications.AndroidImportance.DEFAULT });
}

/** Where the phone is, such as "Europe/Berlin", so reminders arrive in the evening and not at night. */
function timeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
