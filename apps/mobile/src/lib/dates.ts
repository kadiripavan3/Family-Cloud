/**
 * Small date helpers. Days travel between the app and the API as "2026-04-03".
 * How a day is written for a person ("3 Apr", "Yesterday", "2h ago") is the language's own: `words.dates`.
 */
import { words } from '@/words';

/** A local calendar day as "2026-04-03". */
export function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "2026-04-03" as a local date at midnight. */
export function fromISODate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function today(): string {
  return toISODate(new Date());
}

export function addDays(day: string, count: number): string {
  const date = fromISODate(day);
  date.setDate(date.getDate() + count);
  return toISODate(date);
}

/** Whole days from one day to another; negative when "to" is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((fromISODate(to).getTime() - fromISODate(from).getTime()) / 86_400_000);
}

/** "3 Apr", or "3 Apr 2025" when it isn't this year. */
export function formatDay(day: string): string {
  const date = fromISODate(day);
  return words.dates.day(date.getDate(), date.getMonth(), yearIfNotThis(date));
}

/** The year, for a date that isn't in this one: only then is it worth saying. */
function yearIfNotThis(date: Date): number | undefined {
  return date.getFullYear() === new Date().getFullYear() ? undefined : date.getFullYear();
}

/** "Today", "Yesterday" or "1 April". */
export function formatDayLong(day: string): string {
  const diff = daysBetween(day, today());
  if (diff === 0) return words.dates.today;
  if (diff === 1) return words.dates.yesterday;
  const date = fromISODate(day);
  return words.dates.dayLong(date.getDate(), date.getMonth(), yearIfNotThis(date));
}

/** "just now", "5 min ago", "2h ago", "yesterday", "4 days ago" or a date. */
export function timeAgo(instant: string, now: Date = new Date()): string {
  const then = new Date(instant);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return words.dates.justNow;
  if (minutes < 60) return words.dates.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return words.dates.hoursAgo(hours);
  const days = daysBetween(toISODate(then), toISODate(now));
  if (days <= 1) return words.dates.aDayAgo;
  if (days < 7) return words.dates.daysAgo(days);
  return formatDay(toISODate(then));
}

/** "Fri 4 Dec": a day with its weekday. */
export function formatWeekday(day: string): string {
  const date = fromISODate(day);
  return words.dates.dayWithWeekday(date.getDay(), date.getDate(), date.getMonth());
}

/** "Today", "Tomorrow" or "Fri 4 Dec": a day that is coming up. */
export function formatComingDay(day: string, from: string = today()): string {
  const diff = daysBetween(from, day);
  if (diff === 0) return words.dates.today;
  if (diff === 1) return words.dates.tomorrow;
  return formatWeekday(day);
}

/** "18:00": the time of day of a moment, on this phone's clock. */
export function formatTime(instant: string | Date): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  return words.dates.time(date.getHours(), date.getMinutes());
}

/** "Today, 18:00 to 23:30", or "Fri 4 Dec 18:00 to Sat 5 Dec 10:00" when it ends on another day. */
export function formatSpan(startsAt: string, endsAt: string, from: string = today()): string {
  const [start, end] = [new Date(startsAt), new Date(endsAt)];
  const [startDay, endDay] = [toISODate(start), toISODate(end)];
  if (startDay === endDay) return words.dates.span(formatComingDay(startDay, from), formatTime(start), formatTime(end));
  return words.dates.spanDays(formatComingDay(startDay, from), formatTime(start), formatComingDay(endDay, from), formatTime(end));
}

/** The moment a day and a time of day ("18:00") mean on this phone, or null when the time isn't one. */
export function atTime(day: string, time: string): Date | null {
  const match = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(time);
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours > 23 || minutes > 59) return null;
  const date = fromISODate(day);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/** How old someone born on `birthday` is on a day. */
export function ageOn(birthday: string, day: string = today()): number {
  const [born, on] = [fromISODate(birthday), fromISODate(day)];
  const hadBirthday = on.getMonth() > born.getMonth() || (on.getMonth() === born.getMonth() && on.getDate() >= born.getDate());
  return on.getFullYear() - born.getFullYear() - (hadBirthday ? 0 : 1);
}

/** The next time a birthday comes round, on or after a day: the day itself, and how many days away it is. */
export function nextBirthday(birthday: string, from: string = today()): { day: string; inDays: number } {
  const [born, on] = [fromISODate(birthday), fromISODate(from)];
  let next = new Date(on.getFullYear(), born.getMonth(), born.getDate());
  if (toISODate(next) < from) next = new Date(on.getFullYear() + 1, born.getMonth(), born.getDate());
  const day = toISODate(next);
  return { day, inDays: daysBetween(from, day) };
}
