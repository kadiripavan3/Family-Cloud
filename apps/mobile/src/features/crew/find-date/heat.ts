import { addDays, daysBetween, mondayOf } from '@/lib/dates';

/** How dark a day is drawn: 0 for a day nobody can do, 1 for a few, 2 for most, 3 for the most there is. */
export type Heat = 0 | 1 | 2 | 3;

/** The most people who can do any one of the days. */
export function mostOf(days: readonly { free: number }[]): number {
  return days.reduce((most, day) => Math.max(most, day.free), 0);
}

/**
 * How dark a day is, by how many can do it and the most who can do any day: the day (or days) with the most
 * is the darkest, up to half of that is pale, and what lies between is in between.
 */
export function heatOf(free: number, most: number): Heat {
  if (free <= 0 || most <= 0) return 0;
  if (free >= most) return 3;
  return free * 2 <= most ? 1 : 2;
}

/** The counts the pale colour stands for, for the key under the calendar: "1 or 2 of you". Null when no day can be pale. */
export function paleRange(most: number): { from: number; to: number } | null {
  const to = Math.floor(most / 2);
  return most > 1 && to >= 1 ? { from: 1, to } : null;
}

/** One square of the calendar: a day, and what is offered on it. Null for a day of the week that isn't offered. */
export type Cell<Day> = { day: string; offered: Day | null };

/** Whole weeks, Monday first, that hold the days offered. The days before the first and after the last are empty squares. */
export function weeksOf<Day extends { day: string }>(days: readonly Day[]): Cell<Day>[] {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return [];
  const byDay = new Map(days.map((one) => [one.day, one]));
  const start = mondayOf(first.day);
  const count = daysBetween(start, addDays(mondayOf(last.day), 6)) + 1;
  return Array.from({ length: count }, (_, index) => {
    const day = addDays(start, index);
    return { day, offered: byDay.get(day) ?? null };
  });
}

/** Two of the theme's colours mixed: `part` of the first (0 to 1), the rest of the second. Both as the tokens write them, "#RRGGBB". */
export function mix(first: string, second: string, part: number): string {
  const channel = (color: string, at: number) => parseInt(color.slice(at, at + 2), 16);
  const mixed = [1, 3, 5].map((at) => Math.round(channel(first, at) * part + channel(second, at) * (1 - part)));
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}
