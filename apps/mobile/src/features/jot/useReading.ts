import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { readLine, type ReadingResponse } from '@/api/generated/homeport';

import { phoneDay, phoneZone } from './phone';

/** How long after the last key the line is read: a short moment, so a reading doesn't flicker under fast fingers. */
export const READ_AFTER_MS = 350;

/** The value, once it has stopped changing for a moment. */
export function useSettled<T>(value: T, wait: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), wait);
    return () => clearTimeout(timer);
  }, [value, wait]);
  return settled;
}

/**
 * How a line would be read, without saving anything: asked a short moment after the last key, and again
 * only when the words change. While the next reading is on its way the last one stays, so the chips under
 * the line don't blink. Empty words have no reading.
 */
export function useReading(circleId: string, text: string, wait: number = READ_AFTER_MS): { reading: ReadingResponse | undefined; isReading: boolean; error: unknown } {
  const typed = text.trim();
  const settled = useSettled(typed, wait);
  const day = phoneDay();
  const asked = useQuery({
    // (Not an address of the API: nothing that changes makes a reading out of date.)
    queryKey: ['jot-reading', circleId, settled, day],
    queryFn: ({ signal }) => readLine(circleId, { text: settled, day, timeZone: phoneZone() }, { signal }),
    enabled: settled.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
  if (typed.length === 0) return { reading: undefined, isReading: false, error: null };
  return { reading: settled.length > 0 ? asked.data : undefined, isReading: settled !== typed || asked.isFetching, error: asked.isError ? asked.error : null };
}
