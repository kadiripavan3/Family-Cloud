import { rememberLink, screenFor } from '@/lib/links';

/**
 * Called by the router for every link that opens the app on a phone. A shared web address
 * (homeport.app/join/…) is turned into the screen it is about, and remembered in case the person
 * has to sign in first.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const screen = screenFor(path);
    rememberLink(screen.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '/'));
    return screen;
  } catch {
    return path;
  }
}
