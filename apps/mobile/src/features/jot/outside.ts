import { AppRegistry, Platform } from 'react-native';

import { ApiError } from '@/api/fetcher';
import { changeChecklistItem, getCircles, getWidgets, jot, type WidgetsResponse } from '@/api/generated/homeport';
import { apiBaseUrl } from '@/api/config';
import { signInService } from '@/auth/signIn';
import { accountOf } from '@/auth/token';
import { pushSupport } from '@/features/notifications/support';
import { newClientId } from '@/lib/ids';
import { keep } from '@/lib/keep';
import { firstName } from '@/lib/names';

import { phoneNow } from './phone';
import { pinnedHere } from './pinned/service';

/**
 * What the app hands to its parts that live outside it: the widgets, the Lock Screen and the list's Live
 * Activity (native/jot). They can't ask the app anything, so the app leaves them a small file with what to
 * show, each time it comes to the front, and on an iPhone a copy of the sign-in for their buttons.
 *
 * NEVER RUN ON A PHONE. `snapshotOf` is tried in a test; the rest only does something in a phone build
 * that was made with JOT_NATIVE=1 (app.config.ts), and is first run there. Without the native parts there
 * is no shared container, and nothing is written. What to look for is in native/jot/README.md.
 */

/** The App Group the iPhone's widgets share with the app, as plugins/withJotIos.js names it from the app's id. */
export const appGroup = (bundleId: string): string => `group.${bundleId}.jot`;
/** The file the native parts read, in the App Group's container (iPhone) or in the app's own files (Android). */
export const SNAPSHOT_FILE = 'jot-widgets.json';
/** Where the widgets' copy of the sign-in is kept on an iPhone: the keychain, shared through the App Group. */
export const TOKEN_KEY = 'homeport.jot.token';
/** The name Android's widgets know the app's task by (JotActionService.kt). */
export const WIDGET_TASK = 'JotWidgetAction';

/** What a widget needs, and nothing more: no ids of people, no pictures. */
export type Snapshot = {
  apiUrl: string;
  circleId: string;
  circleName: string;
  day: string;
  chips: string[];
  shopping: { id: string; title: string; left: number; lines: { id: string; text: string; done: boolean }[] } | null;
  inUse: { id: string; title: string; left: number; lines: { id: string; text: string; done: boolean }[]; by: string; you: boolean; since: string } | null;
  next: { lead: string; title: string }[];
  addedToday: number;
  writtenAt: string;
};

/** The answer of `getWidgets` as the file the native parts read. */
export function snapshotOf(widgets: WidgetsResponse, circle: { circleId: string; circleName: string }, apiUrl: string, now: Date = new Date()): Snapshot {
  const list = (from: NonNullable<WidgetsResponse['shopping']>) => ({ id: from.id, title: from.title, left: from.left, lines: from.lines.map(({ id, text, done }) => ({ id, text, done })) });
  return {
    apiUrl,
    ...circle,
    day: widgets.day,
    chips: widgets.chips.slice(0, 4),
    shopping: widgets.shopping ? list(widgets.shopping) : null,
    inUse: widgets.inUse ? { ...list(widgets.inUse.list), by: firstName(widgets.inUse.by.name), you: widgets.inUse.you, since: widgets.inUse.since } : null,
    next: widgets.next.slice(0, 3).map((line) => ({ lead: line.lead ?? '', title: line.title })),
    addedToday: widgets.addedToday,
    writtenAt: now.toISOString(),
  };
}

type Options = { headers: Record<string, string> } | undefined;

/** A call that also works when the app was started unseen: see `asSignedIn` in pinned/service.ts. */
async function asSignedIn<T>(call: (options: Options) => Promise<T>): Promise<T> {
  try {
    return await call(undefined);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const token = await signInService.restore().catch(() => null);
    if (!token) throw error;
    return call({ headers: { Authorization: `Bearer ${token}` } });
  }
}

/**
 * The circle the widgets are about: the one the pinned note was switched on for, else the one the person
 * last looked at in the app (what `features/circles/current` remembers on the phone), else their first.
 */
async function circleOutside(): Promise<{ circleId: string; circleName: string } | null> {
  const pinned = await pinnedHere();
  if (pinned) return pinned;
  const account = accountOf(await signInService.restore().catch(() => null));
  if (!account) return null;
  const circles = await asSignedIn((options) => getCircles(options));
  const chosen = await keep.get(`homeport.circle.${account}`);
  const circle = circles.find((one) => one.id === chosen) ?? circles[0];
  return circle ? { circleId: circle.id, circleName: circle.name } : null;
}

/**
 * Writes what the widgets show. Quiet when it can't: nobody signed in, no native parts in this build, no
 * connection.
 */
export async function fillOutside(): Promise<boolean> {
  if (pushSupport() !== 'ready') return false;
  try {
    const circle = await circleOutside();
    if (!circle) return false;
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- on purpose: the phone's files are only touched in a phone build
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the same
    const Constants = (require('expo-constants') as typeof import('expo-constants')).default;
    const bundleId = Constants.expoConfig?.ios?.bundleIdentifier;
    const folder = Platform.OS === 'ios' ? (bundleId ? Paths.appleSharedContainers[appGroup(bundleId)] : undefined) : Paths.document;
    // An iPhone build without the widget extension has no shared container: there is nobody to write for.
    if (!folder) return false;
    const widgets = await asSignedIn((options) => getWidgets(circle.circleId, phoneNow(), options));
    const file = new File(folder, SNAPSHOT_FILE);
    if (!file.exists) file.create();
    file.write(JSON.stringify(snapshotOf(widgets, circle, apiBaseUrl())));
    if (Platform.OS === 'ios' && bundleId) {
      // The widgets' buttons call the API themselves, so they get a copy of the sign-in. It stays in the
      // keychain, readable only by this app and its own widgets, and only after the phone was unlocked once.
      const token = await signInService.restore().catch(() => null);
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the same
      const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
      if (token) await SecureStore.setItemAsync(TOKEN_KEY, token, { accessGroup: appGroup(bundleId), keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
      else await SecureStore.deleteItemAsync(TOKEN_KEY, { accessGroup: appGroup(bundleId) });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * The sign-in is ending: the widgets' file goes, and on an iPhone their copy of the sign-in. They show
 * "open the app" until someone signs in again.
 */
export async function forgetOutside(): Promise<void> {
  if (pushSupport() !== 'ready') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- on purpose: the phone's files are only touched in a phone build
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the same
    const bundleId = (require('expo-constants') as typeof import('expo-constants')).default.expoConfig?.ios?.bundleIdentifier;
    const folder = Platform.OS === 'ios' ? (bundleId ? Paths.appleSharedContainers[appGroup(bundleId)] : undefined) : Paths.document;
    if (folder) {
      const file = new File(folder, SNAPSHOT_FILE);
      if (file.exists) file.delete();
    }
    if (Platform.OS === 'ios' && bundleId) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the same
      const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
      await SecureStore.deleteItemAsync(TOKEN_KEY, { accessGroup: appGroup(bundleId) });
    }
  } catch {
    // Nothing more this phone can do: without a sign-in the widgets' buttons are refused by the API anyway.
  }
}

/** What an Android widget asks of the app when one of its buttons is pressed. */
export type WidgetAction = { kind: 'chip'; circleId: string; text: string } | { kind: 'tick'; itemId: string; done: boolean };

/**
 * Android's widgets have no sign-in of their own: a press starts the app's code unseen (JotActionService.kt)
 * and it does the work here, with the sign-in the phone keeps for the app. Then the file is written again,
 * and the widget draws itself from it.
 */
export async function widgetAction(action: WidgetAction): Promise<void> {
  try {
    if (action.kind === 'chip') await asSignedIn((options) => jot(action.circleId, { clientId: newClientId(), text: action.text, ...phoneNow(), source: 'widget' }, options));
    else await asSignedIn((options) => changeChecklistItem(action.itemId, { done: action.done }, options));
  } finally {
    await fillOutside();
  }
}

/** Called once when the app's code loads (pinned/early.ts): names the task Android's widgets start. */
export function startOutside(): void {
  if (Platform.OS === 'android') AppRegistry.registerHeadlessTask(WIDGET_TASK, () => (action: WidgetAction) => widgetAction(action));
}
