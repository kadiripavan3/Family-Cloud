import { jotMade, plumberJot, widgets } from '@/test/samples/jot';

import type { Answer } from '../note';

/**
 * The half of the pinned note that touches the phone, tried in each place the app runs. The phone's own
 * library, what the phone remembers and the API are stand-ins here: what is checked is what the app asks of
 * them. What a real phone then does with it is seen for the first time on a phone build.
 */
type World = {
  os: 'ios' | 'android' | 'web';
  expoGo?: boolean;
  /** What the phone answers when asked for notifications. */
  phone?: 'on' | 'off';
  /** What the phone remembers from before. */
  kept?: Map<string, string>;
  /** The names of the notifications that are showing. */
  presented?: string[];
};

const linds = { circleId: 'c-linds', circleName: 'The Linds' };
const noteOn = () => new Map([['homeport.jot.pinned', JSON.stringify(linds)]]);
const typed = (userText: string, date = 1): Answer => ({ actionIdentifier: 'jot.type', userText, notification: { date, request: { identifier: 'jot.pinned', content: { data: { jot: 'pinned', circleId: 'c-linds', chips: ['Milk', 'Eggs'] } } } } });

function world(w: World) {
  jest.resetModules();
  const kept = w.kept ?? new Map<string, string>();
  jest.doMock('@/lib/keep', () => ({
    keep: {
      get: async (key: string) => kept.get(key) ?? null,
      set: async (key: string, value: string) => void kept.set(key, value),
      remove: async (key: string) => void kept.delete(key),
    },
  }));
  const listeners: ((answer: Answer) => void)[] = [];
  const notifications = {
    setNotificationChannelAsync: jest.fn(async () => null),
    setNotificationCategoryAsync: jest.fn(async () => null),
    scheduleNotificationAsync: jest.fn(async () => 'id'),
    cancelScheduledNotificationAsync: jest.fn(async () => undefined),
    dismissNotificationAsync: jest.fn(async () => undefined),
    getPresentedNotificationsAsync: jest.fn(async () => (w.presented ?? []).map((identifier) => ({ request: { identifier } }))),
    registerTaskAsync: jest.fn(async () => null),
    unregisterTaskAsync: jest.fn(async () => null),
    addNotificationResponseReceivedListener: jest.fn((listener: (answer: Answer) => void) => void listeners.push(listener)),
    getLastNotificationResponse: jest.fn(() => null),
    AndroidImportance: { LOW: 2 },
    SchedulableTriggerInputTypes: { DAILY: 'daily' },
  };
  const loaded = jest.fn(async () => notifications);
  const asked = jest.fn(async () => w.phone ?? 'on');
  jest.doMock('@/features/notifications/device', () => ({ loadNotifications: loaded, pushAllowed: async () => (w.phone ?? 'on') === 'on', turnOnPush: asked }));
  jest.doMock('@/features/notifications/support', () => ({ pushSupport: () => (w.os === 'web' ? 'browser' : w.expoGo ? 'expoGo' : 'ready') }));
  const api = {
    getWidgets: jest.fn(async () => widgets()),
    getJots: jest.fn(async () => ({ items: [jotMade({ createdAt: new Date().toISOString() })], nextCursor: null })),
    jot: jest.fn(async () => [plumberJot]),
  };
  jest.doMock('@/api/generated/homeport', () => api);
  const restore = jest.fn(async () => 'kept-token');
  jest.doMock('@/auth/signIn', () => ({ signInService: { restore } }));
  jest.doMock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
  const tasks = new Map<string, (body: { data: unknown }) => Promise<void>>();
  const defineTask = jest.fn((name: string, run: (body: { data: unknown }) => Promise<void>) => void tasks.set(name, run));
  jest.doMock('expo-task-manager', () => ({ defineTask }));

  const { Platform } = jest.requireActual<typeof import('react-native')>('react-native');
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => w.os });
  const service = jest.requireActual<typeof import('../service')>('../service');
  const { ApiError } = jest.requireActual<typeof import('@/api/fetcher')>('@/api/fetcher');
  return { service, notifications, loaded, asked, api, kept, restore, ApiError, tasks, defineTask, listeners };
}
const posted = (notifications: ReturnType<typeof world>['notifications']) => (notifications.scheduleNotificationAsync.mock.calls as unknown[][]).map(([request]) => request as { identifier: string; content: Record<string, unknown>; trigger: unknown });

describe('switching the pinned note on', () => {
  it('on Android: asks the phone, remembers the circle, and posts an ongoing note in a silent channel of its own, now and every morning', async () => {
    const { service, notifications, asked, kept, api } = world({ os: 'android' });

    expect(await service.turnOnPinnedNote(linds)).toBe('on');

    expect(asked).toHaveBeenCalledTimes(1);
    expect(JSON.parse(kept.get('homeport.jot.pinned')!)).toEqual(linds);
    expect(api.getWidgets).toHaveBeenCalledWith('c-linds', expect.objectContaining({ day: expect.stringMatching(/^\d{4}-\d\d-\d\d$/) }), undefined);
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith('jot', { name: 'Pinned note', importance: 2, showBadge: false });
    const [category, actions] = notifications.setNotificationCategoryAsync.mock.calls[0] as unknown as [string, { identifier: string; textInput?: object }[]];
    expect(category).toBe('jotnote');
    expect(actions.map((action) => action.identifier)).toEqual(['jot.type', 'jot.chip.0', 'jot.chip.1']);
    expect(actions[0]!.textInput).toEqual({ submitButtonTitle: 'Add', placeholder: 'Add anything' });

    const [now, morning] = posted(notifications);
    expect(now).toMatchObject({ identifier: 'jot.pinned', trigger: { channelId: 'jot' }, content: { title: 'Jot it down', subtitle: 'pinned · The Linds', sticky: true, autoDismiss: false, categoryIdentifier: 'jotnote' } });
    expect(now!.content.body).toMatch(/^Milk · Groceries · \d+:\d\d$/);
    // The morning's takes the place of the one that is there: the same name.
    expect(morning).toMatchObject({ identifier: 'jot.pinned', trigger: { type: 'daily', hour: 7, minute: 0, channelId: 'jot' } });
    expect(notifications.registerTaskAsync).toHaveBeenCalledWith('homeport.jot.pinned');
  });

  it("on an iPhone: no channel, a note that doesn't stay, and the morning's under a name of its own", async () => {
    const { service, notifications } = world({ os: 'ios' });
    expect(await service.turnOnPinnedNote(linds)).toBe('on');
    expect(notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    const [now, morning] = posted(notifications);
    expect(now).toMatchObject({ identifier: 'jot.pinned', trigger: null, content: { title: 'Jot it down', body: 'Press and hold to type. 3 added today.', interruptionLevel: 'passive' } });
    expect(now!.content.sticky).toBeUndefined();
    expect(morning).toMatchObject({ identifier: 'jot.pinned.morning', trigger: { type: 'daily', hour: 7, minute: 0 } });
    // Yesterday's morning note makes way for the fresh one.
    expect(notifications.dismissNotificationAsync).toHaveBeenCalledWith('jot.pinned.morning');
  });

  it('takes a no from the phone: nothing is remembered and nothing is posted', async () => {
    const { service, notifications, kept } = world({ os: 'ios', phone: 'off' });
    expect(await service.turnOnPinnedNote(linds)).toBe('blocked');
    expect(kept.size).toBe(0);
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('says so, and loads nothing, in a browser and in Expo Go', async () => {
    for (const where of [{ os: 'web' } as const, { os: 'ios', expoGo: true } as const, { os: 'android', expoGo: true } as const]) {
      const { service, loaded, asked, api } = world({ ...where, kept: noteOn() });
      expect(await service.turnOnPinnedNote(linds)).toBe('unavailable');
      expect(await service.postPinnedNote()).toBe(false);
      expect(await service.bringBackPinnedNote()).toBe(false);
      await service.turnOffPinnedNote();
      expect(loaded).not.toHaveBeenCalled();
      expect(asked).not.toHaveBeenCalled();
      expect(api.getWidgets).not.toHaveBeenCalled();
    }
  });

  it("still posts the note when the API can't be reached, without today's lines", async () => {
    const { service, notifications, api } = world({ os: 'android', kept: noteOn() });
    api.getWidgets.mockRejectedValue(new Error('offline'));
    expect(await service.postPinnedNote()).toBe(true);
    expect(posted(notifications)[0]!.content.body).toBe('Type a line here, or tap to open the jot bar.');
  });

  it('switches off: the note comes down, the morning is cancelled, the task stops, and the phone forgets', async () => {
    const { service, notifications, kept } = world({ os: 'android', kept: noteOn() });
    await service.turnOffPinnedNote();
    expect(kept.size).toBe(0);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('jot.pinned');
    expect(notifications.dismissNotificationAsync).toHaveBeenCalledWith('jot.pinned');
    expect(notifications.unregisterTaskAsync).toHaveBeenCalledWith('homeport.jot.pinned');
    expect(await service.postPinnedNote()).toBe(false);
  });
});

describe('answering the pinned note', () => {
  it('jots what was typed as coming from the notification, then posts the note again with what was added', async () => {
    const { service, notifications, api } = world({ os: 'android', kept: noteOn() });

    expect(await service.answerPinnedNote(typed('Call the plumber tomorrow at 9'))).toBe('jotted');

    expect(api.jot).toHaveBeenCalledWith('c-linds', expect.objectContaining({ clientId: 'client-1', text: 'Call the plumber tomorrow at 9', source: 'notification', day: expect.any(String) }), undefined);
    expect(posted(notifications)[0]).toMatchObject({ identifier: 'jot.pinned', content: { title: 'Added: Call the plumber' } });
    // The morning's note doesn't repeat the news.
    expect(posted(notifications)[1]!.content.title).toBe('Jot it down');
  });

  it('jots the same answer once, however often the phone hands it over', async () => {
    const { service, api } = world({ os: 'android', kept: noteOn() });
    const answer = typed('Milk');
    // Android gives it to the listener and to the background task while the app is alive but unseen.
    expect(await Promise.all([service.answerPinnedNote(answer), service.answerPinnedNote(answer)])).toEqual(['jotted', 'ignored']);
    expect(api.jot).toHaveBeenCalledTimes(1);
    // The same words typed into the note after it was posted again are a new answer.
    expect(await service.answerPinnedNote(typed('Milk', 2))).toBe('jotted');
    expect(api.jot).toHaveBeenCalledTimes(2);
  });

  it("jots a chip from its button, and leaves a plain tap and other notifications to the app's own handling", async () => {
    const { service, api } = world({ os: 'ios', kept: noteOn() });
    const answer = typed('');
    expect(await service.answerPinnedNote({ ...answer, actionIdentifier: 'jot.chip.1' })).toBe('jotted');
    expect(api.jot).toHaveBeenLastCalledWith('c-linds', expect.objectContaining({ text: 'Eggs', source: 'notification' }), undefined);
    expect(await service.answerPinnedNote({ ...answer, actionIdentifier: 'expo.modules.notifications.actions.DEFAULT' })).toBe('open');
    expect(await service.answerPinnedNote({ ...answer, actionIdentifier: 'jot.type', notification: { request: { content: { data: { url: '/activity' } } } } })).toBe('ignored');
    expect(api.jot).toHaveBeenCalledTimes(1);
  });

  it('works with the app closed: the sign-in kept on the phone is read when the API asks who is there', async () => {
    const { service, api, restore, ApiError } = world({ os: 'android', kept: noteOn() });
    const whoAreYou = () => Promise.reject(new ApiError(401, 'unauthorized', 'Sign in first.'));
    api.jot.mockImplementationOnce(whoAreYou);
    api.getWidgets.mockImplementationOnce(whoAreYou);
    api.getJots.mockImplementationOnce(whoAreYou);

    expect(await service.answerPinnedNote(typed('Milk'))).toBe('jotted');

    expect(restore).toHaveBeenCalled();
    expect(api.jot).toHaveBeenLastCalledWith('c-linds', expect.objectContaining({ text: 'Milk' }), { headers: { Authorization: 'Bearer kept-token' } });
    expect(api.getWidgets).toHaveBeenLastCalledWith('c-linds', expect.anything(), { headers: { Authorization: 'Bearer kept-token' } });
  });

  it("says so on the note when the words couldn't be sent, and takes them again later", async () => {
    const { service, notifications, api } = world({ os: 'android', kept: noteOn() });
    api.jot.mockRejectedValueOnce(new Error('offline'));
    const answer = typed('Milk');
    expect(await service.answerPinnedNote(answer)).toBe('failed');
    expect(posted(notifications)[0]!.content.title).toBe("That one didn't go through. Type it again when you're back online.");
    expect(await service.answerPinnedNote(answer)).toBe('jotted');
  });
});

describe('keeping the note there', () => {
  it('brings back a note that was swiped away when the app comes to the front, on Android only', async () => {
    const gone = world({ os: 'android', kept: noteOn(), presented: [] });
    expect(await gone.service.bringBackPinnedNote()).toBe(true);
    expect(gone.notifications.scheduleNotificationAsync).toHaveBeenCalled();

    const there = world({ os: 'android', kept: noteOn(), presented: ['jot.pinned'] });
    expect(await there.service.bringBackPinnedNote()).toBe(false);
    expect(there.notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    const iphone = world({ os: 'ios', kept: noteOn(), presented: [] });
    expect(await iphone.service.bringBackPinnedNote()).toBe(false);

    const off = world({ os: 'android', presented: [] });
    expect(await off.service.bringBackPinnedNote()).toBe(false);
    expect(off.loaded).not.toHaveBeenCalled();
  });

  it("names the task as soon as the app's code loads, so an answer given while the app is closed is jotted", async () => {
    const { tasks, defineTask, api, listeners, notifications } = world({ os: 'android', kept: noteOn() });
    jest.requireActual<typeof import('../early')>('../early');
    expect(defineTask).toHaveBeenCalledWith('homeport.jot.pinned', expect.any(Function));

    await tasks.get('homeport.jot.pinned')!({ data: typed('Milk') });
    expect(api.jot).toHaveBeenCalledWith('c-linds', expect.objectContaining({ text: 'Milk', source: 'notification' }), undefined);
    // A push that arrives unseen runs the same task and is not an answer.
    await tasks.get('homeport.jot.pinned')!({ data: { notification: null, data: {} } });
    expect(api.jot).toHaveBeenCalledTimes(1);

    // While the app is alive, the listener hears answers too, and the task is registered for a phone whose note is on.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listeners).toHaveLength(1);
    expect(notifications.registerTaskAsync).toHaveBeenCalledWith('homeport.jot.pinned');
  });

  it('does nothing at all in a browser when the code loads', () => {
    const { defineTask, loaded } = world({ os: 'web' });
    const early = jest.requireActual<typeof import('../early')>('../early');
    expect(early.startPinnedNote()).toBe(false);
    expect(defineTask).not.toHaveBeenCalled();
    expect(loaded).not.toHaveBeenCalled();
  });
});
