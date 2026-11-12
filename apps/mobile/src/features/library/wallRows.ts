import type { MomentResponse } from '@/api/generated/homeport';

import type { WallItem } from './types';

/** One photo in a row of the wall, and how much of the row's width it takes. */
export type Cell = { item: WallItem; flex: number };

/** A row of two or three photos, edge to edge. */
export type PhotoRow = { type: 'row'; key: string; height: number; cells: Cell[] };

/** The line above a day's photos: the moment they belong to, or just the day. */
export type DayRow = { type: 'day'; key: string; day: string; moment: MomentResponse | null; first: WallItem };

export type WallRow = DayRow | PhotoRow;

/** The gap between two photos, across and down. */
export const WALL_GAP = 3;

/**
 * The rhythm of the wall, as drawn: a row of two with the first one wide, a row of three with the last one
 * wide, a row of two with the second one wide, and round again. `height` is how tall each is drawn when
 * its photos allow it.
 */
type Shape = { weights: number[]; height: number };
export const WALL_SHAPES: Shape[] = [
  { weights: [1.5, 1], height: 150 },
  { weights: [1, 1, 1.3], height: 104 },
  { weights: [1, 1.45], height: 128 },
];
/** The same rhythm on a moment's own page, where the rows are a little lower. */
export const MOMENT_SHAPES: Shape[] = [
  { weights: [1.5, 1], height: 138 },
  { weights: [1, 1, 1.3], height: 100 },
  { weights: [1, 1.45], height: 120 },
];
/** Three photos that are all there is of a day stand side by side, alike. */
const THREE_ALIKE: Shape = { weights: [1, 1, 1], height: 120 };
/** A photo on its own takes the whole row, up to this height. */
const ALONE_MOST = 240;
const LOWEST = 88;

/** How wide a photo is for its height. A video whose size isn't known is taken to be a little wider than tall. */
export function aspectOf(item: Pick<WallItem, 'width' | 'height' | 'kind'>): number {
  if (!item.width || !item.height) return item.kind === 'video' ? 4 / 3 : 1;
  return Math.min(Math.max(item.width / item.height, 0.5), 2.4);
}

/**
 * Lays photos out in rows the way the wall is drawn: twos and threes in turn, each photo as wide as its
 * own shape and its place in the rhythm ask for, and no photo left alone at the end of a day unless it is
 * the only one. A row is as tall as its photos need to fill the width, and never taller than drawn.
 */
export function photoRows(items: readonly WallItem[], width: number, shapes: Shape[] = WALL_SHAPES): PhotoRow[] {
  const rows: PhotoRow[] = [];
  let at = 0;
  let turn = 0;
  while (at < items.length) {
    const left = items.length - at;
    let shape = shapes[turn % shapes.length]!;
    if (left === 1) shape = { weights: [1], height: ALONE_MOST };
    else if (left === 2) shape = shape.weights.length === 2 ? shape : (shapes.find((one) => one.weights.length === 2) ?? shape);
    else if (left === 3) shape = at === 0 ? THREE_ALIKE : (shapes.find((one) => one.weights.length === 3) ?? THREE_ALIKE);
    else if (left - shape.weights.length === 1) shape = shapes.find((one) => one.weights.length !== shape.weights.length) ?? shape;
    const taken = items.slice(at, at + shape.weights.length);
    const cells = taken.map((item, index) => ({ item, flex: aspectOf(item) * shape.weights[index]! }));
    // What the photos themselves would need to fill the row without being cut.
    const natural = (width - WALL_GAP * (taken.length - 1)) / taken.reduce((sum, item) => sum + aspectOf(item), 0);
    rows.push({ type: 'row', key: taken[0]!.id, height: Math.round(Math.max(LOWEST, Math.min(natural, shape.height))), cells });
    at += taken.length;
    turn += 1;
  }
  return rows;
}

/** The day a photo was taken, "2026-11-07", by the clock where it was taken. */
export function dayOf(item: Pick<WallItem, 'takenLocal' | 'takenAt'>): string {
  return (item.takenLocal ?? item.takenAt ?? '').slice(0, 10);
}

/**
 * The wall as rows for a list: each run of photos from one moment under its own line, then its rows of
 * photos. The photos arrive newest first and page after page; the moments of each page come with it.
 */
export function wallRows(items: readonly WallItem[], moments: readonly MomentResponse[], width: number, shapes: Shape[] = WALL_SHAPES): WallRow[] {
  const byId = new Map(moments.map((moment) => [moment.id, moment]));
  const rows: WallRow[] = [];
  let at = 0;
  while (at < items.length) {
    const first = items[at]!;
    const group = first.momentId ?? dayOf(first);
    let end = at + 1;
    while (end < items.length && (items[end]!.momentId ?? dayOf(items[end]!)) === group) end += 1;
    rows.push({ type: 'day', key: `day-${first.id}`, day: dayOf(first), moment: (first.momentId ? byId.get(first.momentId) : null) ?? null, first });
    rows.push(...photoRows(items.slice(at, end), width, shapes));
    at = end;
  }
  return rows;
}

/** The last day of a month, "2026-11-30" for "2026-11": where the wall starts when it jumps to that month. */
export function lastDayOf(month: string): string {
  const [year, number] = month.split('-').map(Number);
  // Day 0 of the month after is the last day of this one.
  const last = new Date(year!, number!, 0).getDate();
  return `${month.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}
