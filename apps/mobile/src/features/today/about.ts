import type { TodayItem } from '@/api/generated/homeport';

/** Something with no time of its own sorts to the end of the day: this many minutes since midnight. */
const NO_TIME = 1440;

/**
 * What the day is still about, for the summary card's bold line: the things that are not done and not over
 * yet, in the day's own order. A thing with a time counts until that time has passed; one without a time
 * counts all day. When all of it is done or over, the day is about everything that was on.
 */
export function stillOn(items: readonly TodayItem[], now: Date = new Date()): TodayItem[] {
  const minute = now.getHours() * 60 + now.getMinutes();
  const open = items.filter((item) => item.done !== true);
  const ahead = open.filter((item) => (item.minute ?? NO_TIME) >= NO_TIME || (item.minute ?? NO_TIME) >= minute);
  return ahead.length ? ahead : open.length ? open : [...items];
}
