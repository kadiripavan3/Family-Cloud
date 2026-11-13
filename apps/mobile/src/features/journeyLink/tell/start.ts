import type { Href } from 'expo-router';

/** What a journey is drafted from: the moment one photo belongs to, or an album. `circleId` when it isn't the current circle's. */
export type TellFrom = { moment?: string; album?: string; circleId?: string };

/**
 * The way into "Tell it as a journey" (10.5) from anywhere: `router.push(tellHref({ moment: photoId }))`.
 * The screen behind it drafts the journey and opens the draft.
 */
export function tellHref(from: TellFrom): Href {
  return { pathname: '/journey/tell/new', params: { ...(from.moment ? { moment: from.moment } : null), ...(from.album ? { album: from.album } : null), ...(from.circleId ? { circle: from.circleId } : null) } };
}

/** The photos and videos picked on the select screen, on their way to a draft: handed over once, in the phone's memory. */
let picked: ReadonlySet<string> | null = null;

/**
 * Says that only these go into the draft that is started next: the rest of the moment or the album is
 * left out of it. A list of ids is too long for an address, so it is handed over here.
 */
export function tellOnly(ids: Iterable<string>): void {
  picked = new Set(ids);
}

/** What was handed over, once. Null when the whole moment or album is meant. */
export function takeOnly(): ReadonlySet<string> | null {
  const taken = picked;
  picked = null;
  return taken;
}
