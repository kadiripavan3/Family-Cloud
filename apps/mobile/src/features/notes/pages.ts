import type { InfiniteData } from '@tanstack/react-query';

/**
 * How Notes' own paged lists are read (`api/pages.ts` does this for the rest of the app). The API describes
 * the rows of a folder loosely, with every part of an answer optional, so these take an answer as it is
 * described: pass `paged` as the `query` option of a generated `use…Infinite` hook, and read the rows with
 * `rows()`.
 */
export const paged = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last: { nextCursor?: string | null }) => last.nextCursor ?? undefined,
};

/** Every row loaded so far, in order, each one once. Undefined until the first page has arrived. */
export function rows<T extends { id?: string }>(data: InfiniteData<{ items?: T[] }> | undefined): T[] | undefined {
  if (!data) return undefined;
  const seen = new Set<string>();
  return data.pages
    .flatMap((page) => page.items ?? [])
    .filter((row) => {
      if (row.id === undefined) return true;
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
}
