/**
 * The paper chain of a countdown, as it is drawn: one link for every sleep there was when it started, the
 * ones that are gone first. Links lie flat and on edge by turns (a wide one, then a narrow one), each
 * overlapping the next, and each keeps its colour for as long as it is on.
 */

/** A link as drawn: gone or still on, which colour (0 is the accent, 1 to 5 the five tints), flat or on edge, and whether it is tonight's. */
export type Link = { off: boolean; tint: number; narrow: boolean; tonight: boolean };

/** The colours down the chain, as the drawing has them, round and round. */
const ORDER = [0, 2, 1, 3, 0, 4, 5, 2, 0, 1, 3, 4] as const;

/** The colour of the link at a place in the chain, counted from its start. The drawing's third link is the first of the round. */
export function tintOf(index: number): number {
  return ORDER[(((index - 2) % ORDER.length) + ORDER.length) % ORDER.length]!;
}

/** Every link of a chain, from its start: `off` of them are gone, and the first that is still on is tonight's while it can be torn. */
export function linksOf(count: { links: number; off: number; canTear: boolean }): Link[] {
  return Array.from({ length: Math.max(count.links, 0) }, (_, index) => ({ off: index < count.off, tint: tintOf(index), narrow: index % 2 === 1, tonight: count.canTear && index === count.off }));
}

/** A flat link is 36 by 24, one on edge 18 by 30; each overlaps its neighbour by 12. */
export const LINK = { wide: { width: 36, height: 24 }, narrow: { width: 18, height: 30 }, overlap: 12, rowHeight: 30 } as const;

/** Where each link of one row stands from the row's left edge, and how wide the row is. */
export function layoutOf(row: readonly Link[]): { lefts: number[]; width: number } {
  const lefts: number[] = [];
  let at = 0;
  for (const link of row) {
    lefts.push(at);
    at += (link.narrow ? LINK.narrow.width : LINK.wide.width) - LINK.overlap;
  }
  return { lefts, width: row.length ? at + LINK.overlap : 0 };
}

/** A long chain in rows of so many links, so sixty of them still fit a phone. */
export function rowsOf<T>(links: readonly T[], perRow: number): T[][] {
  const rows: T[][] = [];
  for (let start = 0; start < links.length; start += perRow) rows.push(links.slice(start, start + perRow));
  return rows;
}
