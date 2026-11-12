import type { InfiniteData } from '@tanstack/react-query';

import type { ActivityLine, ActivityResponse } from '@/api/generated/homeport';

import { type Group, groupOf } from './when';

/** One row of the list: a label over a group of lines, or a line. */
export type ActivityRow = { type: 'label'; key: string; group: Group } | { type: 'line'; key: string; line: ActivityLine; fresh: boolean; due: boolean };

const ORDER: readonly Group[] = ['today', 'week', 'earlier'];

/**
 * The pages of a circle's Activity as the rows of its list: each line once, under "Today", "Earlier this
 * week" or "Earlier". What is due comes with the first page only and stands under Today, after what is new
 * there and before the rest of the day, as the drawing has it. `stillFresh` are the lines that were new
 * when the tab was opened: they keep their highlight while it is on screen, though the API has been told
 * they were seen.
 */
export function rowsOf(data: InfiniteData<ActivityResponse> | undefined, stillFresh: ReadonlySet<string> = new Set(), now: Date = new Date()): ActivityRow[] {
  if (!data) return [];
  const seen = new Set<string>();
  const once = (line: ActivityLine) => {
    const id = line.id ?? '';
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  };
  const isFresh = (line: ActivityLine) => line.fresh === true || stillFresh.has(line.id ?? '');
  const due = (data.pages[0]?.due ?? []).filter(once);
  const lines = data.pages.flatMap((page) => page.items).filter(once);

  const groups: Record<Group, ActivityRow[]> = { today: [], week: [], earlier: [] };
  for (const line of lines) groups[groupOf(line.at, now)].push({ type: 'line', key: line.id ?? '', line, fresh: isFresh(line), due: false });
  // Today: what is new, then what is due, then the rest of the day.
  const today = groups.today;
  const firstOld = today.findIndex((row) => row.type === 'line' && !row.fresh);
  today.splice(firstOld === -1 ? today.length : firstOld, 0, ...due.map((line): ActivityRow => ({ type: 'line', key: line.id ?? '', line, fresh: false, due: true })));

  return ORDER.flatMap((group) => (groups[group].length ? [{ type: 'label', key: `label-${group}`, group } as const, ...groups[group]] : []));
}

/** The ids of the lines the API calls new, as one piece of text: the same lines give the same text. */
export function freshIds(data: InfiniteData<ActivityResponse> | undefined): string {
  return (data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((line) => line.fresh && line.id)
    .map((line) => line.id)
    .join(',');
}

/** A line's sentence as plain words, for a screen reader and for a sheet's title. */
export function sentenceOf(line: ActivityLine): string {
  return (line.sentence ?? []).map((part) => part.text ?? '').join('');
}
