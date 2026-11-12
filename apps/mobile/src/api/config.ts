import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

const API_PORT = 8080;

/**
 * Where the Homeport API lives.
 *
 * Set EXPO_PUBLIC_API_URL to point at a deployed API. Without it, the app assumes the API runs on the
 * same computer as the Expo dev server, which is how local development works: a phone on the same
 * Wi-Fi reaches both through the computer's address.
 */
export function apiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  }
  const devServerHost = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${devServerHost ?? 'localhost'}:${API_PORT}`;
}

/**
 * Opens one of the web pages the API serves (the terms, the privacy policy, help) in the phone's browser.
 * `path` is the page's own address, such as "/terms".
 */
export function openPage(path: string): void {
  void Linking.openURL(apiBaseUrl() + path).catch(() => undefined);
}
