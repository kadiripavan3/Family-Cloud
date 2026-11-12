import type { WidgetLineResponse } from '@/api/generated/homeport';

/**
 * The lines a small widget shows: the first few of the list. A line that was ticked here keeps its place
 * until the screen is left, although the list itself now starts with what is still to buy: a tick that made
 * its line vanish at once would look like a mistake.
 *
 * `shown` is what the widget showed last, `fresh` what the API says now (what is left first, then what was
 * ticked). A line that is gone from the list and wasn't ticked was removed by someone, and goes.
 */
export function widgetLines(fresh: readonly WidgetLineResponse[], shown: readonly WidgetLineResponse[], room: number): WidgetLineResponse[] {
  const now = new Map(fresh.map((line) => [line.id, line]));
  const kept = shown.flatMap((line) => {
    const same = now.get(line.id);
    return same ? [same] : line.done ? [line] : [];
  });
  const ids = new Set(kept.map((line) => line.id));
  return [...kept, ...fresh.filter((line) => !ids.has(line.id))].slice(0, room);
}

/** True when two rows of lines would draw the same. */
export function sameLines(a: readonly WidgetLineResponse[], b: readonly WidgetLineResponse[]): boolean {
  return a.length === b.length && a.every((line, index) => line.id === b[index]!.id && line.done === b[index]!.done && line.text === b[index]!.text);
}
