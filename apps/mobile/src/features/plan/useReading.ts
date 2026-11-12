import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { readLine, type ReadingResponse } from '@/api/generated/homeport';
import { phoneTimeZone, today } from '@/lib/dates';
import { useDebounced } from '@/lib/useDebounced';

/** How long after the last key the line is read: long enough not to ask for every letter, short enough to feel live. */
export const READ_AFTER_MS = 350;

/**
 * How a typed line is read, live: a short moment after the last key the API is asked (`readLine`, which
 * saves nothing), and its reading is kept until the next one arrives, so the rows under the line don't
 * blink while typing. `settled` is true once the reading on screen is of the text as it stands now.
 */
export function useReading(circleId: string, text: string): { reading: ReadingResponse | undefined; settled: boolean; error: unknown } {
  const typed = text.trim();
  const asked = useDebounced(typed, READ_AFTER_MS);
  const day = today();
  const query = useQuery({
    // Not under an address of the API: what is being typed is no answer to keep on the phone (`api/kept`).
    queryKey: ['plan-reading', circleId, asked, day],
    queryFn: ({ signal }) => readLine(circleId, { text: asked, day, timeZone: phoneTimeZone() }, { signal }),
    enabled: asked.length > 0,
    placeholderData: keepPreviousData,
    // The same words on the same day read the same.
    staleTime: Infinity,
  });
  return {
    reading: asked.length > 0 ? query.data : undefined,
    settled: typed === asked && !query.isPlaceholderData && (asked.length === 0 || query.isSuccess),
    error: query.isError ? query.error : null,
  };
}
