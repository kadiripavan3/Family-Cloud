import { Platform } from 'react-native';

import { ApiError } from '@/api/fetcher';
import { getJots, getWidgets, jot, type JotResponse, type WidgetsResponse } from '@/api/generated/homeport';
import { signInService } from '@/auth/signIn';
import { loadNotifications, pushAllowed, turnOnPush } from '@/features/notifications/device';
import { pushSupport } from '@/features/notifications/support';
import { newClientId } from '@/lib/ids';
import { keep } from '@/lib/keep';
import { words } from '@/words';

import { phoneNow } from '../phone';
import { type Answer, answerKey, CHANNEL, jotOf, MORNING_ID, morningId, noteCategory, noteLines, notePosts, NOTE_ID, type Os, type Pinned, type Post, postsNow, saidAfter, TASK } from './note';

/**
 * The pinned note, the half that touches the phone: switching it on and off, posting it, and jotting what
 * is typed into it.
 *
 * NEVER RUN ON A PHONE. Everything here is tried in tests with the notifications library replaced by a
 * stand-in (service.test.ts): the tests show what this code asks of the library, not what a phone then
 * does. Its first real run is on a phone build (a development build: the browser and Expo Go have no
 * notifications, and get a sentence from `pushSupport()` before any of this is reached). What to look for
 * on that first run is in native/jot/README.md.
 */

type Notifications = Awaited<ReturnType<typeof loadNotifications>>;
type Options = { headers: Record<string, string> } | undefined;

/** Where this phone remembers that its note is on, and for which circle. */
const KEY = 'homeport.jot.pinned';

const os = (): Os => (Platform.OS === 'ios' ? 'ios' : 'android');

/** What this phone remembers of its note: the circle it adds to, or null while the note is off here. */
export async function pinnedHere(): Promise<Pinned | null> {
  try {
    const kept: unknown = JSON.parse((await keep.get(KEY)) ?? 'null');
    if (typeof kept !== 'object' || kept === null) return null;
    const { circleId, circleName } = kept as Partial<Pinned>;
    return typeof circleId === 'string' && typeof circleName === 'string' ? { circleId, circleName } : null;
  } catch {
    return null;
  }
}

/**
 * A call to the API that also works while the app is closed. With the app open, the session adds the
 * sign-in by itself. Started unseen by an answer to the note, there is no session in memory: the API says
 * "who are you?", the sign-in kept on the phone is read (and renewed if it ran out), and the call is made
 * again with it.
 */
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

/** One post as the library takes it. */
function requestOf(Notifications: Notifications, post: Post, platform: Os) {
  const channel = platform === 'android' ? { channelId: CHANNEL } : {};
  if (post.when === 'now') return { identifier: post.identifier, content: post.content, trigger: platform === 'android' ? { channelId: CHANNEL } : null };
  return { identifier: post.identifier, content: post.content, trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: post.when.hour, minute: post.when.minute, ...channel } as const };
}

/**
 * Posts the note with what stands now: today's lines, the chips, how many were added. `said` is its first
 * line after an answer ("Added: Milk"). When the API can't be reached the note still goes up, without
 * today's lines. False when there is no note to post here: it is off on this phone, or the phone says no.
 */
export async function postPinnedNote(said?: string | null): Promise<boolean> {
  if (pushSupport() !== 'ready') return false;
  const pinned = await pinnedHere();
  if (!pinned || !(await pushAllowed())) return false;
  const Notifications = await loadNotifications();
  const platform = os();

  let widgets: WidgetsResponse | null = null;
  let jots: JotResponse[] = [];
  try {
    [widgets, jots] = await Promise.all([
      asSignedIn((options) => getWidgets(pinned.circleId, phoneNow(), options)),
      asSignedIn((options) => getJots(pinned.circleId, { day: phoneNow().day, limit: 30 }, options)).then((page) => page.items),
    ]);
  } catch {
    // Offline, or signed out meanwhile: the line to type in is still worth having.
  }
  const chips = widgets?.chips ?? [];

  if (platform === 'android') {
    // Low importance: it shows, and never makes a sound or pops up over what the person is doing.
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: words.jot.pinned.note.channel, importance: Notifications.AndroidImportance.LOW, showBadge: false });
  }
  const category = noteCategory(platform, chips);
  await Notifications.setNotificationCategoryAsync(category.identifier, category.actions);
  // An iPhone may still show yesterday's morning note: the fresh one takes its place.
  if (platform === 'ios') await Notifications.dismissNotificationAsync(MORNING_ID).catch(() => undefined);
  for (const post of notePosts({ os: platform, pinned, lines: noteLines(jots), chips, addedToday: widgets?.addedToday ?? 0, said })) {
    await Notifications.scheduleNotificationAsync(requestOf(Notifications, post, platform));
  }
  // So that Android runs the task when the note is answered while the app is closed.
  await Notifications.registerTaskAsync(TASK).catch(() => undefined);
  return true;
}

/** What came of switching the note on: it is up, the phone (or the person) said no to notifications, or this copy of the app can't have any. */
export type PinnedAnswer = 'on' | 'blocked' | 'unavailable';

/**
 * Switches the note on, on this phone: asks the phone for notifications if it hasn't been asked (the
 * phone's own question, once), remembers the circle, and posts the note.
 */
export async function turnOnPinnedNote(pinned: Pinned): Promise<PinnedAnswer> {
  if (pushSupport() !== 'ready') return 'unavailable';
  if ((await turnOnPush()) !== 'on') return 'blocked';
  await keep.set(KEY, JSON.stringify(pinned));
  try {
    return (await postPinnedNote()) ? 'on' : 'blocked';
  } catch {
    return 'blocked';
  }
}

/** Switches the note off on this phone: it is taken down, the morning's is cancelled, and nothing runs for it any more. */
export async function turnOffPinnedNote(): Promise<void> {
  await keep.remove(KEY);
  if (pushSupport() !== 'ready') return;
  try {
    const Notifications = await loadNotifications();
    await Notifications.cancelScheduledNotificationAsync(morningId(os())).catch(() => undefined);
    await Notifications.dismissNotificationAsync(NOTE_ID).catch(() => undefined);
    await Notifications.dismissNotificationAsync(MORNING_ID).catch(() => undefined);
    await Notifications.unregisterTaskAsync(TASK).catch(() => undefined);
  } catch {
    // Nothing more this phone can do; the note is off as far as the app is concerned.
  }
}

/** The app came to the front. On Android, a note that was swiped away comes back. */
export async function bringBackPinnedNote(): Promise<boolean> {
  if (pushSupport() !== 'ready' || !(await pinnedHere())) return false;
  try {
    const Notifications = await loadNotifications();
    const presented = (await Notifications.getPresentedNotificationsAsync()).map((one) => one.request.identifier);
    return postsNow(os(), 'front', presented) ? await postPinnedNote() : false;
  } catch {
    return false;
  }
}

/** The answers that were jotted already in this run of the app. */
const answered = new Set<string>();

/**
 * An answer to a notification arrived: from the listener while the app is alive, or from the background
 * task when Android started the app unseen. If it is the pinned note's and has words, they are jotted
 * (`source: notification`) and the note is posted again with "Added: …". A plain tap is left to the
 * app's own handling, which opens the jot bar.
 */
export async function answerPinnedNote(answer: Answer): Promise<'jotted' | 'failed' | 'open' | 'ignored'> {
  const asked = jotOf(answer);
  if (!asked) return 'ignored';
  if (asked.kind === 'open') return 'open';
  const key = answerKey(answer);
  if (answered.has(key)) return 'ignored';
  answered.add(key);
  try {
    const made = await asSignedIn((options) => jot(asked.circleId, { clientId: newClientId(), text: asked.text, ...phoneNow(), source: 'notification' }, options));
    await postPinnedNote(saidAfter(made)).catch(() => false);
    return 'jotted';
  } catch {
    // Not sent (offline, most likely). The note says so instead of quietly losing the words.
    answered.delete(key);
    await postPinnedNote(words.jot.pinned.note.failed).catch(() => false);
    return 'failed';
  }
}

/** For tests: forgets which answers were jotted. */
export function forgetAnswers(): void {
  answered.clear();
}
