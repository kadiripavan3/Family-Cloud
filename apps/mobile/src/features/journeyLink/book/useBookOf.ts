import { useGetKeptJourneysInfinite } from '@/api/generated/homeport';
import { paged, rows, useEveryPage } from '@/api/pages';
import { useCircleIfAny } from '@/features/circles/current';

/** What a page is, for the screen that draws it: a kept journey's book, an ordinary page, or not known yet. */
export type BookOrPage = 'book' | 'page' | 'asking';

/**
 * Whether a page is the book of a kept journey (10.4): asked of the journeys kept in the page's own circle,
 * which name their pages. Before the page has said which circle it is in, the current circle is asked, as
 * that is nearly always the one. `plain` is for "Open as a page": the answer is then a page, without asking.
 * When the kept journeys can't be asked (no connection, or it failed), the page is shown as the page it is.
 */
export function useBookOf(pageId: string, circleId: string | undefined, plain = false): BookOrPage {
  const current = useCircleIfAny();
  const asking = circleId ?? current?.id;
  const kept = useGetKeptJourneysInfinite(asking ?? '', undefined, { query: { ...paged, enabled: !!asking && !plain } });
  useEveryPage(kept);
  if (plain || !asking) return 'page';
  const all = rows(kept.data);
  if (all?.some((one) => one.pageId === pageId)) return 'book';
  if (!all) return kept.isError || kept.isPaused ? 'page' : 'asking';
  // Not among these: it is a page, once every kept journey of the page's own circle has been looked at.
  return kept.hasNextPage || !circleId ? 'asking' : 'page';
}
