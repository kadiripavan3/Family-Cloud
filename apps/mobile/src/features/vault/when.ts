import { addDays, formatComingDay, formatTime, formatWeekday, fromISODate, toISODate } from '@/lib/dates';
import { words } from '@/words';

/** "on Fri 4 Dec at 18:00", "today at 18:00": a moment the API named, for the middle of a sentence. */
export function momentOf(instant: string): string {
  const date = new Date(instant);
  return words.vault.moment(formatComingDay(toISODate(date)), formatTime(date));
}

/** "Fri 4 Dec at 18:00", "today at 18:00": the same after a word of its own ("Until …"). */
export function plainMomentOf(instant: string): string {
  const date = new Date(instant);
  return words.vault.momentPlain(formatComingDay(toISODate(date)), formatTime(date));
}

/** The hour of the evening a share "stops working" on its day. */
const EVENING = 22;

/** The moment a share stops when it runs until the evening of a day ("2026-11-15"). */
export function eveningOf(day: string): Date {
  const date = fromISODate(day);
  date.setHours(EVENING, 0, 0, 0);
  return date;
}

/** "Sun 15 Nov evening": the evening a share stops, for the row that says so. */
export function eveningLabel(day: string): string {
  return words.vault.share.evening(formatWeekday(day));
}

/** The day a moment falls on, on this phone's calendar. */
export function dayOf(instant: string): string {
  return toISODate(new Date(instant));
}

/** The coming Sunday: what "stops working" starts on when it is switched on. Today, when today is Sunday. */
export function comingSunday(from: string): string {
  const weekday = fromISODate(from).getDay();
  return addDays(from, (7 - weekday) % 7);
}

/** The moment a share stops when it runs until a day: that evening, or the very end of the day when the evening has already passed. */
export function stopsAtOf(day: string, now: Date = new Date()): Date {
  const evening = eveningOf(day);
  if (evening > now) return evening;
  const end = fromISODate(day);
  end.setHours(23, 59, 59, 0);
  return end;
}
