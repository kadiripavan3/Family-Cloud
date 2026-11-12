import type { ReadingResponse } from '@/api/generated/homeport';

/** One thing read from a letter that was shared in: each is a row with a switch, and is made when it stays on. */
export type Found =
  | { id: string; kind: 'event'; title: string; day: string; time: string | null }
  | { id: string; kind: 'reminder'; title: string; day: string; time: string | null }
  | { id: string; kind: 'bill'; title: string; cents: number; currency: string; dueOn: string }
  | { id: string; kind: 'keep'; title: string; body: string };

/** What a letter is called: its first line, kept short. */
export function letterTitle(text: string, fallback: string): string {
  const first = text.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? '';
  const sentence = first.split(/(?<=[.!?])\s/)[0] ?? first;
  const title = sentence.length <= 70 ? sentence : `${sentence.slice(0, 69).trimEnd()}…`;
  return title.replace(/[.:]$/, '') || fallback;
}

/**
 * What the API read from a text, as the rows the share screen offers: a day is an event, a day something is
 * due by is a reminder, an amount of money is a bill (due on the first deadline in the letter, else on its
 * first day, else today), and the letter itself can be kept. A short text that reads as a line gives its
 * events and reminders the same way.
 */
export function foundIn(reading: ReadingResponse | undefined, text: string, today: string, fallbackTitle: string): Found[] {
  const title = letterTitle(text, fallbackTitle);
  const found: Found[] = [];
  const dates = reading?.dates ?? [];
  dates.forEach((date, index) => {
    found.push({ id: `date-${index}`, kind: date.deadline ? 'reminder' : 'event', title: date.title.trim() || title, day: date.day, time: date.time });
  });
  (reading?.items ?? []).forEach((item, index) => {
    if (item.day && (item.as === 'event' || item.as === 'reminder')) found.push({ id: `item-${index}`, kind: item.as, title: item.title, day: item.day, time: item.time });
  });
  const dueOn = dates.find((date) => date.deadline)?.day ?? dates[0]?.day ?? today;
  (reading?.amounts ?? []).forEach((amount, index) => {
    found.push({ id: `amount-${index}`, kind: 'bill', title, cents: amount.cents, currency: amount.currency, dueOn });
  });
  if (text.trim()) found.push({ id: 'keep', kind: 'keep', title, body: text.trim() });
  return found;
}
