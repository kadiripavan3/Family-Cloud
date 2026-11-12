import type { ItemResponse } from '@/api/generated/homeport';

/** The lines typed into the box of a new list, one per row, without the empty ones. A list starts with a hundred at most. */
export function linesOf(typed: string): string[] {
  return typed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100);
}

/**
 * A list's lines under their headings, in the list's own order: the lines without a heading first, then
 * each heading where it first comes up.
 */
export function bySection(items: readonly ItemResponse[]): { section: string; items: ItemResponse[] }[] {
  const groups: { section: string; items: ItemResponse[] }[] = [];
  for (const item of items) {
    const group = groups.find((one) => one.section === item.section);
    if (group) group.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups.sort((a, b) => Number(a.section !== '') - Number(b.section !== ''));
}
