import { focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Tells the data layer when the phone has no connection. Without a connection, reading waits instead of
 * failing: what was loaded stays on screen (no "can't reach Homeport" over a page you were reading), and
 * whatever was waiting is asked again by itself when the connection is back. Called once, before the first
 * request, from the root layout.
 */
export function watchConnection() {
  onlineManager.setEventListener((setOnline) => {
    // "Unknown" counts as connected, as it does for the offline strip.
    const heard = (state: Network.NetworkState) => setOnline(state.isConnected !== false);
    const subscription = Network.addNetworkStateListener(heard);
    void Network.getNetworkStateAsync()
      .then(heard)
      .catch(() => undefined);
    return () => subscription.remove();
  });
}

/**
 * Tells the data layer when the app is in front. Coming back from being put away, whatever is on screen and
 * out of date is asked for again; while the app is away nothing is asked at all, also not what is otherwise
 * checked every minute. (A browser tells the data layer this by itself.) Called once from the root layout.
 */
export function watchFocus() {
  if (Platform.OS === 'web') return;
  focusManager.setEventListener((setFocused) => {
    // "Inactive" is an iPhone showing something of its own on top for a moment (a question, the app
    // switcher): the app is still in front.
    const subscription = AppState.addEventListener('change', (state) => setFocused(state !== 'background'));
    return () => subscription.remove();
  });
}

const subscribe = (heard: () => void) => onlineManager.subscribe(heard);
const isOnline = () => onlineManager.isOnline();

/**
 * Whether the phone has a connection. One answer for the whole app: the same one the data layer acts on, so
 * what a screen says ("you're offline") and what the app does (wait, don't fail) can't disagree.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}

/** How long the offline strip says that something wasn't sent, before it goes back to its usual sentence. */
const NOT_SENT_FOR_MS = 5000;

/** True for a few seconds after a change (a tick, a save) failed because nothing answered. */
let notSent = false;
let forget: ReturnType<typeof setTimeout> | null = null;
const waiting = new Set<() => void>();

function say(next: boolean) {
  notSent = next;
  waiting.forEach((heard) => heard());
}

/**
 * A change couldn't be sent. Changes never wait in silence the way reading does: they fail at once with the
 * app's own "can't reach Homeport" sentence, and the offline strip says so too for a few seconds, for the
 * controls that have no room for a sentence of their own (a tick in a list, a switch).
 */
export function changeNotSent(): void {
  if (forget) clearTimeout(forget);
  forget = setTimeout(() => {
    forget = null;
    say(false);
  }, NOT_SENT_FOR_MS);
  say(true);
}

/** True for a few seconds after a change couldn't be sent, for the offline strip. */
export function useChangeNotSent(): boolean {
  return useSyncExternalStore(
    (heard) => {
      waiting.add(heard);
      return () => waiting.delete(heard);
    },
    () => notSent,
    () => false,
  );
}
