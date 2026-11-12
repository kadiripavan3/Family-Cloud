import type { Href } from 'expo-router';

import type { Audience } from '@/api/generated/homeport';

/** The ten things the + sheet makes, in the order of its grid: each one's emoji, and the screen that makes it. */
export const NEW_THINGS = [
  { id: 'note', emoji: '📝', href: '/new/note' },
  { id: 'checklist', emoji: '✅', href: '/new/checklist' },
  { id: 'photos', emoji: '📷', href: '/new/photos' },
  { id: 'scan', emoji: '📄', href: '/new/scan' },
  { id: 'event', emoji: '📅', href: '/new/event' },
  { id: 'reminder', emoji: '🔔', href: '/new/reminder' },
  { id: 'bill', emoji: '🧾', href: '/new/bill' },
  { id: 'sheet', emoji: '📊', href: '/new/sheet' },
  { id: 'password', emoji: '🔑', href: '/new/password' },
  { id: 'goal', emoji: '🎯', href: '/new/goal' },
] as const;

export type NewThing = (typeof NEW_THINGS)[number]['id'];

/**
 * The screen that makes one of the ten. `audience` is who the new thing starts as seen by, when the person
 * changed that from what the circle's kind says: the screen reads it with `useStartsAs()`.
 */
export function newThingHref(thing: NewThing | (string & {}), audience?: Audience): Href {
  // (A word the catalog made up for a thing that isn't one of the ten is a note.)
  const pathname = (NEW_THINGS.find((one) => one.id === thing) ?? NEW_THINGS[0]).href;
  return audience ? { pathname, params: { audience } } : pathname;
}
