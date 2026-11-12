import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/** "system" follows the phone; "light" and "dark" stay put whatever the phone says. */
export type Appearance = 'system' | 'light' | 'dark';

const KEY = 'homeport.appearance';
let current: Appearance = 'system';
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The person's choice of light, dark or automatic. Every screen that reads the theme follows it. */
export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

export function setAppearance(next: Appearance) {
  current = next;
  listeners.forEach((listener) => listener());
  void save(next);
}

/** Reads the saved choice when the app starts. */
export async function loadAppearance(): Promise<void> {
  try {
    const saved = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    if (saved === 'light' || saved === 'dark') {
      current = saved;
      listeners.forEach((listener) => listener());
    }
  } catch {
    // Automatic is a fine fallback.
  }
}

async function save(next: Appearance) {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, next);
    else await SecureStore.setItemAsync(KEY, next);
  } catch {
    // The choice holds for this run of the app.
  }
}
