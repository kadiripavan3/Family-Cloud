import type { JotResponse } from '@/api/generated/homeport';
import { toISODate } from '@/lib/dates';

/** Jots that follow each other within this long are one go: "4 filed just now". */
const ONE_GO_MS = 10 * 60 * 1000;

/**
 * Today's jots, the latest first, in the two groups the screen draws: what was filed just now (the latest
 * go, when it is fresh) and what came earlier today. When nothing is fresh, everything is "today".
 */
export function todaysJots(jots: readonly JotResponse[], now: Date = new Date()): { fresh: boolean; latest: JotResponse[]; earlier: JotResponse[] } {
  const day = toISODate(now);
  const today = jots.filter((jot) => toISODate(new Date(jot.createdAt)) === day);
  const newest = today[0];
  if (!newest || now.getTime() - new Date(newest.createdAt).getTime() > ONE_GO_MS) return { fresh: false, latest: [...today], earlier: [] };
  let end = 1;
  while (end < today.length && new Date(today[end - 1]!.createdAt).getTime() - new Date(today[end]!.createdAt).getTime() <= ONE_GO_MS) end += 1;
  return { fresh: true, latest: today.slice(0, end), earlier: today.slice(end) };
}

/** One line someone typed, and what came of it: "Milk, Bread" that both went to Groceries at 8:12. */
export type Batch = { id: string; became: JotResponse['became']; titles: string[]; where: string; at: string };

/**
 * Jots as the pinned note lists them: the oldest first, and the things one line made that went to the same
 * place on one row ("Milk, Bread · Groceries · 8:12").
 */
export function batches(jots: readonly JotResponse[]): Batch[] {
  const rows: Batch[] = [];
  for (const jot of [...jots].reverse()) {
    const last = rows[rows.length - 1];
    if (last && last.id === `${jot.batchId}:${jot.where}`) last.titles.push(jot.title);
    else rows.push({ id: `${jot.batchId}:${jot.where}`, became: jot.became, titles: [jot.title], where: jot.where, at: jot.createdAt });
  }
  return rows;
}
