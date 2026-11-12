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
