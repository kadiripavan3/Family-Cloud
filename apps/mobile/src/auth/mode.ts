import { Platform } from 'react-native';

export type AuthMode = 'local' | 'supabase';

/**
 * Which sign-in a build uses. The build setting EXPO_PUBLIC_AUTH_MODE says so ("local" or "supabase").
 * Without it: the test sign-in while developing and in the browser preview, and real sign-in in any built
 * app. A build for a phone never falls back to the test sign-in by itself: one that forgot the setting says
 * "sign-in isn't set up" rather than letting anyone in with the test code.
 */
export function authModeFor(setting: string | undefined, developing: boolean, os: string): AuthMode {
  if (setting === 'local' || setting === 'supabase') return setting;
  return developing || os === 'web' ? 'local' : 'supabase';
}

/**
 * How sign-in works in this build. "local" talks to the API's test sign-in (any email, a fixed code);
 * "supabase" is real sign-in.
 */
export const authMode: AuthMode = authModeFor(process.env.EXPO_PUBLIC_AUTH_MODE, __DEV__, Platform.OS);

/** The code that works in local mode. It matches homeport.auth.local.code in the API. */
export const LOCAL_TEST_CODE = '123456';
