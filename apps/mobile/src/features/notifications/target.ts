import type { Href } from 'expo-router';

/** Where the app opens when a notification says nothing this version understands. */
export const FALLBACK: Href = '/activity';

/**
 * The screens a notification may open, by the path the API sends with it. The tabs, and the jot bar (a tap
 * on the pinned note, which the phone itself posts). A screen
 * that a notification is about (a bill, an album, a job) gets a line here when it is built, with a check
 * that its id looks like an id.
 */
const SCREENS: Record<string, Href> = { '/activity': '/activity', '/people': '/people', '/you': '/you', '/jot': '/jot' };

/**
 * Where a notification opens the app. The API sends a path with each push; only the screens named here are
 * opened, so a strange or newer path lands on Activity instead of on a missing screen.
 */
export function hrefFor(path: unknown): Href {
  if (typeof path !== 'string') return FALLBACK;
  const [pathname = ''] = path.split('?');
  return (Object.hasOwn(SCREENS, pathname) ? SCREENS[pathname] : undefined) ?? FALLBACK;
}
