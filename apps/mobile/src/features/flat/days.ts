import { daysBetween, formatDay, formatWeekdayLong, today } from '@/lib/dates';
import { words } from '@/words';

/**
 * A day that isn't long ago, the way a flatmate would say it: "today", "yesterday", "Tuesday" within the
 * week, and the date after that ("2 Nov", with its year when it isn't this one).
 */
export function recentDay(day: string, from: string = today()): string {
  const ago = daysBetween(day, from);
  if (ago === 0) return words.flat.days.today;
  if (ago === 1) return words.flat.days.yesterday;
  if (ago > 1 && ago < 7) return formatWeekdayLong(day);
  return formatDay(day);
}

/** How long ago something was written, in whole words: "just now", "an hour ago", "3 days ago", then the date. */
export function writtenAgo(instant: string, now: Date = new Date()): string {
  const then = new Date(instant);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return words.flat.ago.now;
  if (minutes < 60) return words.flat.ago.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return words.flat.ago.hours(hours);
  const days = Math.floor(hours / 24);
  if (days < 7) return words.flat.ago.days(days);
  const local = `${then.getFullYear()}-${String(then.getMonth() + 1).padStart(2, '0')}-${String(then.getDate()).padStart(2, '0')}`;
  return formatDay(local);
}
