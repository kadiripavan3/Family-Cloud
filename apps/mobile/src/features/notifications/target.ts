import type { Href } from 'expo-router';

import { placeHref } from '@/features/home/places';
import { looksLikeId, thingHref } from '@/features/things/open';

/** Where the app opens when a notification says nothing this version understands. */
export const FALLBACK: Href = '/activity';

/**
 * The screens a notification may open that take nothing from its address, by the path the API sends: the
 * tabs, the jot bar (a tap on the pinned note, which the phone itself posts), "Export and leaving" (an export
 * is ready), and the Vault's own pages for what only the person themselves can do there.
 */
const SCREENS: Record<string, Href> = {
  '/activity': '/activity',
  '/people': '/people',
  '/you': '/you',
  '/jot': '/jot',
  '/settings/leaving': '/settings/leaving',
  '/vault/emergency': '/vault/emergency',
  '/vault/helping': '/vault/helping',
  '/vault/key': '/vault/key',
};

/** The kinds of things there are, each at the address its kind gives it: a `vault_item` at "/vault-item/<id>". */
const KINDS = ['page', 'checklist', 'photo', 'video', 'document', 'album', 'folder', 'board', 'vault-item', 'event', 'reminder', 'goal', 'bill', 'sheet', 'split'];
/** The chips of Activity a notification can open it on. */
const CHIPS = ['all', 'asks', 'photos', 'money', 'plan'];
const isDay = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Where a tapped notification opens the app, by the path the API sends with each push. What each kind opens:
 *
 *  - a turn or a reminder that is due, a nudge, an event about to start, a bill that is due, a reminder about
 *    money, something shared by name, and "yes" to what you asked to see: the thing itself (`/bill/<id>`,
 *    `/reminder/<id>`, `/vault-item/<id>`, …), by its kind, the way every list of things opens it;
 *  - someone asks to see something, or said "not now": Activity on the Asks chip (`/activity?filter=asks`);
 *  - a batch of photos: Home on the Library (`/library`);
 *  - the Sunday summary: that circle's week (`/summary/<circle>?week=<a day of it>`);
 *  - an export that is ready: Export and leaving;
 *  - the Vault's notices: emergency access, helping someone back in, a Vault you are trusted with.
 *
 * Only what is named here is opened, and an id has to look like one, so a strange or newer path lands on
 * Activity instead of on a missing screen.
 */
export function hrefFor(path: unknown): Href {
  if (typeof path !== 'string') return FALLBACK;
  const [pathname = '', query = ''] = path.split('?');
  const asked = new URLSearchParams(query);

  if (pathname === '/activity') {
    const filter = asked.get('filter');
    return filter && CHIPS.includes(filter) ? { pathname: '/activity', params: { filter } } : '/activity';
  }
  if (Object.hasOwn(SCREENS, pathname)) return SCREENS[pathname] ?? FALLBACK;
  if (pathname === '/library') return placeHref('library');
  // The Vaults a person is trusted with are listed in the Vault itself; one of them has its own page.
  if (pathname === '/vault/entrusted') return placeHref('vault');

  const parts = pathname.split('/').filter(Boolean);
  const [first, second, third] = parts;
  if (parts.length === 2 && first === 'summary' && second && looksLikeId(second)) {
    const week = asked.get('week');
    return { pathname: '/summary/[circleId]', params: isDay(week) ? { circleId: second, week } : { circleId: second } };
  }
  if (parts.length === 3 && first === 'vault' && second === 'entrusted' && third && looksLikeId(third)) return { pathname: '/vault/entrusted/[id]', params: { id: third } };
  // A thing of any kind, at the address its kind gives it: "/vault-item/<id>".
  if (parts.length === 2 && first && KINDS.includes(first) && looksLikeId(second)) return thingHref({ kind: first, id: second });
  return FALLBACK;
}
