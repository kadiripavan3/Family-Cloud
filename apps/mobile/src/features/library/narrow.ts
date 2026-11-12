import type { Href } from 'expo-router';

import type { GetWallParams } from '@/api/generated/homeport';

/**
 * How the wall is narrowed: to photos or videos, to what you love, to one person's, one place's, one
 * album's or one moment's. The same narrowing travels with a photo when it is opened, so stepping to its
 * neighbours stays inside what the person was looking at, and with the screen for selecting many.
 */
export type Narrow = Pick<GetWallParams, 'kind' | 'loved' | 'by' | 'about' | 'place' | 'album' | 'moment'>;

type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

/** The narrowing an address carries ("?album=…&by=…"). Anything else in the address is left alone. */
export function narrowFrom(params: Params): Narrow {
  const kind = one(params.kind);
  return {
    kind: kind === 'photo' || kind === 'video' ? kind : undefined,
    loved: one(params.loved) === 'true' ? true : undefined,
    by: one(params.by),
    about: one(params.about),
    place: one(params.place),
    album: one(params.album),
    moment: one(params.moment),
  };
}

/** The same narrowing as the parts of an address: only what is set. */
export function narrowParams(narrow: Narrow): Record<string, string> {
  const out: Record<string, string> = {};
  if (narrow.kind) out.kind = narrow.kind;
  if (narrow.loved) out.loved = 'true';
  for (const key of ['by', 'about', 'place', 'album', 'moment'] as const) {
    const value = narrow[key];
    if (value) out[key] = value;
  }
  return out;
}

/** What to ask the API with: the narrowing without its empty parts, so the same narrowing is the same request. */
export function cleaned(narrow: Narrow): Narrow {
  return Object.fromEntries(Object.entries(narrow).filter(([, value]) => value !== undefined && value !== '' && value !== false)) as Narrow;
}

/**
 * Where a photo or a video opens: `/photo/<id>` or `/video/<id>`, by the convention every kind follows,
 * with the narrowing it was opened from. With none, it stays inside its own moment: that is what the
 * counter ("12 of 51") and the strip of neighbours are about.
 */
export function viewerHref(item: { id: string; kind?: string | null }, narrow: Narrow = {}): Href {
  const within = cleaned(narrow);
  const params = narrowParams(Object.keys(within).length > 0 ? within : { moment: item.id });
  // The same address `thingHref` makes for it (features/things/open), with the narrowing after it.
  return { pathname: '/[kind]/[id]', params: { kind: item.kind === 'video' ? 'video' : 'photo', id: item.id, ...params } };
}

/** The screen for selecting many, over the same narrowing, with one photo picked already. */
export function selectHref(narrow: Narrow, first?: string): Href {
  return { pathname: '/library/select', params: { ...narrowParams(cleaned(narrow)), ...(first ? { first } : {}) } };
}
