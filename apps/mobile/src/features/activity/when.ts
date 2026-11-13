import { daysBetween, formatDay, formatTime, formatTimeOfDay, formatWeekdayShort, timeAgo, toISODate } from '@/lib/dates';
import { words } from '@/words';

/** The label a line stands under. */
export type Group = 'today' | 'week' | 'earlier';

/** How many days back still count as "earlier this week". */
const WEEK = 6;
/** Up to this many hours ago a line says how long ago it was; an older one of today says its time. */
const RECENT_HOURS = 6;

/** Whole days from the day something happened to today, on this phone's calendar. Nought for today, and for something due (no moment). */
function daysAgo(at: string | null | undefined, now: Date): number {
  return at ? Math.max(0, daysBetween(toISODate(new Date(at)), toISODate(now))) : 0;
}

/** Which label a line stands under: Today (and whatever is due), Earlier this week, or Earlier. */
export function groupOf(at: string | null | undefined, now: Date = new Date()): Group {
  const days = daysAgo(at, now);
  return days === 0 ? 'today' : days <= WEEK ? 'week' : 'earlier';
}

/**
 * When a line happened, the way the list writes it: "12 min ago" and "2h ago" for what has just happened,
 * the time for earlier today ("7:40"), the day and time for earlier this week ("Mon 18:02"), a date before
 * that. `gathered` is for a line that counts several moments of a day (a list that two people changed): on
 * another day it says the day alone ("Mon"). Null for something due, which has no moment.
 */
export function lineWhen(at: string | null | undefined, gathered = false, now: Date = new Date()): string | null {
  if (!at) return null;
  const then = new Date(at);
  const day = toISODate(then);
  const days = daysAgo(at, now);
  const time = formatTimeOfDay(formatTime(then));
  if (days === 0) return now.getTime() - then.getTime() < RECENT_HOURS * 3_600_000 ? timeAgo(at, now) : time;
  if (days <= WEEK) return gathered ? formatWeekdayShort(day) : words.activity.weekdayAt(formatWeekdayShort(day), time);
  return formatDay(day);
}
