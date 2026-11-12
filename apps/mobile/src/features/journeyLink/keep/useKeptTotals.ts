import { useGetKeptJourneysInfinite } from '@/api/generated/homeport';
import { paged, rows, useEveryPage } from '@/api/pages';

/**
 * What a circle keeps from Journey, in three numbers: how many journeys, how many of their photos and clips
 * are here, and how many of those were matched to what was in the Library already (so they aren't kept
 * twice). Undefined until the kept journeys have been asked for. For "Storage and backup".
 */
export function useKeptTotals(circleId: string): { journeys: number; here: number; matched: number } | undefined {
  const asked = useGetKeptJourneysInfinite(circleId, undefined, { query: paged });
  useEveryPage(asked);
  const kept = rows(asked.data);
  if (!kept) return undefined;
  return {
    journeys: kept.length,
    here: kept.reduce((sum, one) => sum + (one.originals.matched ?? 0) + (one.originals.brought ?? 0), 0),
    matched: kept.reduce((sum, one) => sum + (one.originals.matched ?? 0), 0),
  };
}
