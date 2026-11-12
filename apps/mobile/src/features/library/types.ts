import type { ItemRow, PersonBrief } from '@/api/generated/homeport';

/** A photo or a video on the wall: a row of the API that is sure to have its id. */
export type WallItem = ItemRow & { id: string };

/** Keeps the rows that can be shown and opened: the ones with an id. */
export function wallItems(items: readonly ItemRow[] | undefined): WallItem[] {
  return (items ?? []).filter((item): item is WallItem => typeof item.id === 'string');
}

/** What stands either side of a photo, for stepping along. `position` and `total` are set inside a moment or an album. */
export type Neighbours = {
  /** Taken after it, the nearest first. */
  newer: ItemRow[];
  /** Taken before it, the nearest first. */
  older: ItemRow[];
  position: number | null;
  total: number | null;
};

/**
 * One photo, video or document with everything its screen shows: the answer of `GET /v1/library/{id}`.
 *
 * Written by hand, from the API's `LibraryService.ItemResponse`. The API's description gives this answer
 * the same name as a line of a checklist (`ItemResponse`), so the generated client types it as that line.
 * `useLibraryItem` reads it as what it really is. When the API renames one of the two, this goes.
 */
export type LibraryItem = {
  item: ItemRow;
  /** Its picture at full size. */
  largeUrl: string | null;
  fileName: string | null;
  contentType: string;
  /** How much is kept for it, in bytes. */
  bytes: number;
  lat: number | null;
  lng: number | null;
  country: string | null;
  addedAt: string;
  /** Who is in it, as tagged by hand. */
  about: PersonBrief[];
  /** The albums it is in that you may see. */
  albums: { id: string; title: string }[];
  loves: number;
  lovedBy: PersonBrief[];
  comments: number;
  neighbours: Neighbours;
};
