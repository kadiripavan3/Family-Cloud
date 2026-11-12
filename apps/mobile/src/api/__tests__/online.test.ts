import { focusManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

import { watchFocus } from '../online';

/** The phone tells the app that it was put away or brought back. */
let appState: (state: AppStateStatus) => void = () => {};

describe('the app being in front', () => {
  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appState = listener as (state: AppStateStatus) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    watchFocus();
    focusManager.subscribe(() => {}); // the app's data layer listens; that is when the phone is watched
  });

  it('is what the data layer goes by: away while in the background, in front again when it comes back', () => {
    appState('background');
    expect(focusManager.isFocused()).toBe(false);
    // An iPhone showing a question of its own on top of the app has not put the app away.
    appState('inactive');
    expect(focusManager.isFocused()).toBe(true);
    appState('background');
    appState('active');
    expect(focusManager.isFocused()).toBe(true);
  });

  it('asks again for what is on screen and out of date when the app comes back, and checks nothing every minute while it is away', async () => {
    jest.useFakeTimers();
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
    client.mount();
    const asked = jest.fn(async () => ({ newCount: 0 }));
    // Something a screen checks every minute while the app is open, such as a dot for "something new".
    const dot = new QueryObserver(client, { queryKey: ['/v1/activity'], queryFn: asked, refetchInterval: 60_000 });
    const stop = dot.subscribe(() => {});
    try {
      await jest.advanceTimersByTimeAsync(0);
      expect(asked).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(asked).toHaveBeenCalledTimes(2);

      appState('background');
      await jest.advanceTimersByTimeAsync(10 * 60_000);
      expect(asked).toHaveBeenCalledTimes(2);

      appState('active');
      await jest.advanceTimersByTimeAsync(0);
      expect(asked).toHaveBeenCalledTimes(3);
    } finally {
      stop();
      client.unmount();
      client.clear();
      jest.useRealTimers();
    }
  });
});
