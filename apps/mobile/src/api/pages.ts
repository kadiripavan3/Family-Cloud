import type { InfiniteData } from '@tanstack/react-query';
import { useEffect } from 'react';

/**
 * How every paged list is read: start at the beginning, and ask for the next page with the cursor the last
 * page handed out. Pass it as the `query` option of a generated `use…Infinite` hook.
 */
export const paged = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last: { nextCursor?: string | null }) => last.nextCursor ?? undefined,
};

/**
 * Every row loaded so far, in order, each one once. Undefined until the first page has arrived.
 *
 * Pages are fetched one after the other, and the list can change in between: a row that moved down while
 * the next page was on its way arrives a second time. It is shown where it was first, so a list never has
 * the same row (and the same key) twice.
 */
export function rows<T>(data: InfiniteData<{ items?: T[] }, unknown> | undefined): T[] | undefined {
  if (!data) return undefined;
  const seen = new Set<unknown>();
  return data.pages
    .flatMap((page) => page.items ?? [])
    .filter((row) => {
      const id = typeof row === 'object' && row !== null ? (row as { id?: unknown }).id : undefined;
      if (id === undefined) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

/** What a `List` needs to load its next page when the person nears the end of what is there. */
export function more(query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown }) {
  return {
    onEnd: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
  };
}

/**
 * For lists that are short by nature and that a screen sorts or counts as a whole (a person's circles):
 * keeps asking for the next page until every page is in.
 */
export function useEveryPage(query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown }) {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
}
