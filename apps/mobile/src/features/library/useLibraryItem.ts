import { keepPreviousData } from '@tanstack/react-query';

import { useGetLibraryItem } from '@/api/generated/homeport';
import { looksLikeId } from '@/features/things/open';

import { cleaned, type Narrow } from './narrow';
import type { LibraryItem } from './types';

/**
 * One photo, video or document with everything its screen shows, and what stands either side of it under
 * the narrowing it was opened from. While the next one is on its way (the person stepped to a neighbour),
 * the last one stays, so the screen never goes blank between two photos.
 *
 * The generated hook types the answer as a checklist's line, which has the same name in the API's
 * description (see `LibraryItem`); this reads it as what the API really sends.
 */
export function useLibraryItem(id: string, narrow: Narrow = {}) {
  return useGetLibraryItem(id, cleaned(narrow), {
    query: { enabled: looksLikeId(id), placeholderData: keepPreviousData, select: (answer) => answer as unknown as LibraryItem },
  });
}
