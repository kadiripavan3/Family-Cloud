import { rememberLink, screenFor } from '@/lib/links';

/**
 * Called by the router for every link that opens the app on a phone. A shared web address
 * (homeport.app/join/…) is turned into the screen it is about, and remembered in case the person
 * has to sign in first. The app's own links (`homeport://jot`, which a widget, a quick-settings tile
 * and a long press on the icon open) already name their screen: they are remembered the same way.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const screen = screenFor(path);
    // "homeport://jot" and "homeport:///jot" are both the screen "/jot".
    rememberLink(screen.replace(/^[a-z][a-z0-9+.-]*:\/\/\/?/i, '/'));
    return screen;
  } catch {
    return path;
  }
}
