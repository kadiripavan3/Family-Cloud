import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { activityCache } from './activity';
import { coupleCache } from './couple';
import { crewCache } from './crew';
import { flatCache } from './flat';
import { jotCache } from './jot';
import { keepsakesCache } from './keepsakes';
import { libraryCache } from './library';
import { moneyCache } from './money';
import { notesCache } from './notes';
import { perksCache } from './perks';
import { planCache } from './plan';
import { spineCache } from './spine';
import { templatesCache } from './templates';
import { togetherCache } from './together';
import { toolsFor } from './tools';
import { vaultCache } from './vault';

/**
 * What the app does to what it has already loaded when something changes.
 *
 * Each function is one thing that can happen, and a screen calls the one that happened
 * (`cache.pageSaved(page)`), so a screen never has to know which lists exist. A new kind of change gets a
 * new function, not an `invalidateQueries` in a screen.
 *
 * The functions live in one file per place in this folder (`plan.ts`, `money.ts`, …; the spine's own are in
 * `spine.ts`). A place adds to its own file and to no other: every file's functions are merged into what
 * `useCache()` returns. Two places must not use the same name; a test keeps that true.
 */
export function useCache() {
  const client = useQueryClient();
  // The same object from one draw to the next, so it can be named in an effect's list without running it again.
  return useMemo(() => cacheFor(client), [client]);
}

/** Every place's part, by the name of its file. */
export const PARTS = {
  spine: spineCache,
  plan: planCache,
  jot: jotCache,
  notes: notesCache,
  templates: templatesCache,
  library: libraryCache,
  money: moneyCache,
  vault: vaultCache,
  keepsakes: keepsakesCache,
  perks: perksCache,
  couple: coupleCache,
  flat: flatCache,
  crew: crewCache,
  together: togetherCache,
  activity: activityCache,
};

export function cacheFor(client: QueryClient) {
  const tools = toolsFor(client);
  return {
    ...spineCache(tools),
    ...planCache(tools),
    ...jotCache(tools),
    ...notesCache(tools),
    ...templatesCache(tools),
    ...libraryCache(tools),
    ...moneyCache(tools),
    ...vaultCache(tools),
    ...keepsakesCache(tools),
    ...perksCache(tools),
    ...coupleCache(tools),
    ...flatCache(tools),
    ...crewCache(tools),
    ...togetherCache(tools),
    ...activityCache(tools),

    /** The first thing after signing up: load everything fresh. */
    everything: () => client.invalidateQueries(),
  };
}
