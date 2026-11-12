/**
 * Connecting a phone for notifications, tried in each place the app runs. The phone's own library and the
 * API are stand-ins here; what is checked is what the app asks of them, and that it asks nothing where
 * notifications can't work.
 */
type World = {
  os: 'ios' | 'android' | 'web';
  expoGo?: boolean;
  /** The app's project at the push service; null before the first real build. */
  projectId?: string | null;
  /** What the phone says before anything is asked. */
  granted?: boolean;
  /** What the person answers when the phone asks. */
  answer?: boolean;
  canAskAgain?: boolean;
  /** What the phone remembers from earlier runs of the app. A new one for a fresh install. */
  kept?: Map<string, string>;
};

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
  const notifications = {
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(async () => ({ granted: w.granted ?? false, canAskAgain: w.canAskAgain ?? true })),
    requestPermissionsAsync: jest.fn(async () => ({ granted: w.answer ?? false, canAskAgain: false })),
    getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[this-phone]' })),
    unregisterForNotificationsAsync: jest.fn(async () => undefined),
    setNotificationChannelAsync: jest.fn(async () => null),
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    AndroidImportance: { DEFAULT: 3 },
  };
  const loaded = jest.fn(() => notifications);
  jest.doMock('expo-notifications', loaded);
  jest.doMock('expo-constants', () => ({
    __esModule: true,
    default: {
      executionEnvironment: w.expoGo ? 'storeClient' : 'standalone',
      expoConfig: { extra: { eas: { projectId: w.projectId === undefined ? 'project-1' : w.projectId } } },
    },
    ExecutionEnvironment: { StoreClient: 'storeClient' },
  }));
  const api = { registerDevice: jest.fn(async () => undefined), forgetDevice: jest.fn(async () => undefined) };
  jest.doMock('@/api/generated/homeport', () => api);

  const { Platform } = jest.requireActual<typeof import('react-native')>('react-native');
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => w.os });
  const device = jest.requireActual<typeof import('../device')>('../device');
  const { runBeforeSignOut } = jest.requireActual<typeof import('@/auth/beforeSignOut')>('@/auth/beforeSignOut');
  return { notifications, loaded, api, device, kept, signOut: runBeforeSignOut };
}

describe('turning notifications on', () => {
  it('asks the phone, and on a yes tells the API this phone, its kind and its time zone', async () => {
    const { device, notifications, api } = await world({ os: 'ios', answer: true });

    expect(await device.turnOnPush()).toBe('on');

    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(api.registerDevice).toHaveBeenCalledWith({
      token: 'ExponentPushToken[this-phone]',
      platform: 'ios',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });

  it('takes a no for an answer and tells the API nothing', async () => {
    const { device, api } = await world({ os: 'ios', answer: false });
    expect(await device.turnOnPush()).toBe('off');
    expect(api.registerDevice).not.toHaveBeenCalled();
  });

  it("doesn't ask again when the phone already said yes, or when it won't ask a second time", async () => {
    const yes = await world({ os: 'android', granted: true });
    expect(await yes.device.turnOnPush()).toBe('on');
    expect(yes.notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    // Android shows its question only once there is a channel to put notifications in.
    expect(yes.notifications.setNotificationChannelAsync).toHaveBeenCalledWith('default', { name: 'Homeport', importance: 3 });
    expect(yes.api.registerDevice).toHaveBeenCalledWith(expect.objectContaining({ platform: 'android' }));

    const never = await world({ os: 'ios', granted: false, canAskAgain: false });
    expect(await never.device.turnOnPush()).toBe('off');
    expect(never.notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('says so, and loads nothing, in a browser and in Expo Go', async () => {
    for (const where of [{ os: 'web' } as const, { os: 'ios', expoGo: true } as const, { os: 'android', expoGo: true } as const]) {
      const { device, loaded, api } = await world({ ...where, granted: true });
      expect(await device.turnOnPush()).toBe('unavailable');
      expect(await device.connectThisPhone()).toBe(false);
      expect(await device.pushAllowed()).toBe(false);
      expect(loaded).not.toHaveBeenCalled();
      expect(api.registerDevice).not.toHaveBeenCalled();
    }
  });

  it('keeps going when the phone has no address yet or the API is out of reach', async () => {
    // Before the first real build there is no project at the push service: the yes is kept, nothing is sent.
    const early = await world({ os: 'ios', answer: true, projectId: null });
    expect(await early.device.turnOnPush()).toBe('on');
    expect(early.api.registerDevice).not.toHaveBeenCalled();

    const offline = await world({ os: 'ios', granted: true });
    offline.api.registerDevice.mockRejectedValueOnce(new Error('offline'));
    expect(await offline.device.connectThisPhone()).toBe(false);
  });
});

describe('opening the app and signing out', () => {
  it('connects the phone again each time the app opens, only if the person said yes', async () => {
    const yes = await world({ os: 'ios', granted: true });
    expect(await yes.device.connectThisPhone()).toBe(true);
    expect(yes.api.registerDevice).toHaveBeenCalledTimes(1);

    const no = await world({ os: 'ios', granted: false });
    expect(await no.device.connectThisPhone()).toBe(false);
    expect(no.notifications.requestPermissionsAsync).not.toHaveBeenCalled(); // opening the app never asks
    expect(no.api.registerDevice).not.toHaveBeenCalled();
  });

  it('takes the phone off the list before the person is signed out, once', async () => {
    const { device, api, signOut } = await world({ os: 'ios', granted: true });
    await device.connectThisPhone();

    await signOut();
    expect(api.forgetDevice).toHaveBeenCalledWith({ token: 'ExponentPushToken[this-phone]' });

    await signOut();
    expect(api.forgetDevice).toHaveBeenCalledTimes(1);
  });

  it('signs out all the same when the API cannot be told, and then the phone itself stops listening', async () => {
    const offline = await world({ os: 'ios', granted: true });
    await offline.device.connectThisPhone();
    offline.api.forgetDevice.mockRejectedValueOnce(new Error('offline'));
    await expect(offline.signOut()).resolves.toBeUndefined();
    // Nothing of the person who signed out arrives here any more, whatever the API still believes.
    expect(offline.notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(1);

    const reached = await world({ os: 'ios', granted: true });
    await reached.device.connectThisPhone();
    await reached.signOut();
    expect(reached.notifications.unregisterForNotificationsAsync).not.toHaveBeenCalled();

    const never = await world({ os: 'web' });
    await never.signOut();
    expect(never.api.forgetDevice).not.toHaveBeenCalled();
  });

  it('takes the phone off the list in a later run of the app too, when that run never got to connect it', async () => {
    const first = await world({ os: 'ios', granted: true });
    await first.device.connectThisPhone();

    // The app is opened again without a connection: the phone can't be connected this time. Then the person signs out.
    const later = await world({ os: 'ios', granted: true, kept: first.kept });
    later.api.registerDevice.mockRejectedValue(new Error('offline'));
    expect(await later.device.connectThisPhone()).toBe(false);
    await later.signOut();
    expect(later.api.forgetDevice).toHaveBeenCalledWith({ token: 'ExponentPushToken[this-phone]' });

    // And only once: the address is forgotten with it.
    const afterwards = await world({ os: 'ios', granted: true, kept: first.kept });
    await afterwards.signOut();
    expect(afterwards.api.forgetDevice).not.toHaveBeenCalled();
  });

  it('tells the API the new time zone when the phone has travelled, and nothing when it has not', async () => {
    const { device, api } = await world({ os: 'ios', granted: true });
    await device.connectThisPhone();
    await device.reconnectIfMoved();
    expect(api.registerDevice).toHaveBeenCalledTimes(1);

    const zone = jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'Asia/Tokyo' } as Intl.ResolvedDateTimeFormatOptions);
    try {
      await device.reconnectIfMoved();
      expect(api.registerDevice).toHaveBeenCalledTimes(2);
      expect(api.registerDevice).toHaveBeenLastCalledWith(expect.objectContaining({ timeZone: 'Asia/Tokyo' }));
      await device.reconnectIfMoved();
      expect(api.registerDevice).toHaveBeenCalledTimes(2);
    } finally {
      zone.mockRestore();
    }

    // A phone that never said yes has nothing to tell.
    const no = await world({ os: 'ios', granted: false });
    await no.device.reconnectIfMoved();
    expect(no.api.registerDevice).not.toHaveBeenCalled();
  });
});

describe('asking someone who never saw the question', () => {
  it('is worth it once per install, while the phone has not been asked', async () => {
    const fresh = await world({ os: 'ios', granted: false, canAskAgain: true });
    expect(await fresh.device.shouldAskAboutPush()).toBe(true);
    await fresh.device.askedAboutPush();
    expect(await fresh.device.shouldAskAboutPush()).toBe(false);

    // The next run of the app remembers; a new install doesn't.
    const nextRun = await world({ os: 'ios', granted: false, canAskAgain: true, kept: fresh.kept });
    expect(await nextRun.device.shouldAskAboutPush()).toBe(false);
    const reinstalled = await world({ os: 'ios', granted: false, canAskAgain: true });
    expect(await reinstalled.device.shouldAskAboutPush()).toBe(true);
  });

  it('is never worth it when the phone has answered already, or where notifications cannot work', async () => {
    const yes = await world({ os: 'android', granted: true });
    expect(await yes.device.shouldAskAboutPush()).toBe(false);
    const no = await world({ os: 'ios', granted: false, canAskAgain: false });
    expect(await no.device.shouldAskAboutPush()).toBe(false);
    for (const where of [{ os: 'web' } as const, { os: 'ios', expoGo: true } as const]) {
      const nowhere = await world(where);
      expect(await nowhere.device.shouldAskAboutPush()).toBe(false);
      expect(nowhere.loaded).not.toHaveBeenCalled();
    }
  });
});
