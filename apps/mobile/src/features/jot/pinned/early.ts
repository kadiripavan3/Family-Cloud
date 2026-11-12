import { AppState } from 'react-native';

import { loadNotifications } from '@/features/notifications/device';
import { pushSupport } from '@/features/notifications/support';

import { type Answer, TASK } from './note';
import { answerPinnedNote, bringBackPinnedNote, pinnedHere } from './service';

/**
 * What the pinned note needs from the moment the app's code loads, before any screen: imported first by
 * the app's entry (apps/mobile/index.ts).
 *
 * NEVER RUN ON A PHONE (see service.ts). Why it can't wait for a screen: when the note is answered while
 * the app is closed, Android starts the app's code unseen and runs the task named here. No screen is drawn
 * then, so a task defined inside one would not exist. An iPhone starts the app in the background instead
 * and hands the answer to the listener.
 *
 * In a browser and in Expo Go this does nothing and loads nothing.
 */
export function startPinnedNote(): boolean {
  if (pushSupport() !== 'ready') return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- on purpose: loaded only where notifications can work
    const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');
    TaskManager.defineTask<Answer | Record<string, unknown>>(TASK, async ({ data }) => {
      // The same task also hears pushes that arrive unseen; only an answer to a notification is Jot's.
      if (data && 'actionIdentifier' in data) await answerPinnedNote(data as Answer);
    });
  } catch {
    // Without the task the note still works while the app is open or in the background.
  }
  void (async () => {
    const Notifications = await loadNotifications();
    Notifications.addNotificationResponseReceivedListener((answer) => void answerPinnedNote(answer));
    // An answer that started the app (an iPhone, with the app closed) arrived before anyone was listening.
    const first = Notifications.getLastNotificationResponse();
    if (first) void answerPinnedNote(first);
    AppState.addEventListener('change', (state) => {
      if (state === 'active') void bringBackPinnedNote();
    });
    if (await pinnedHere()) await Notifications.registerTaskAsync(TASK).catch(() => undefined);
  })().catch(() => undefined);
  return true;
}

startPinnedNote();
