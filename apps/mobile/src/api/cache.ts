import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getGetMeQueryKey, getGetSettingsQueryKey, type MeResponse, type SettingsResponse } from '@/api/generated/homeport';

/**
 * What the app does to what it has already loaded when something changes.
 *
 * Each function below is one thing that can happen, and a screen calls the one that happened, so a screen
 * never has to know which lists exist. A new kind of change gets a new function here, not an
 * `invalidateQueries` in a screen. The tools they are made of:
 *  - the API just sent the changed thing back, so it is written over the old copy and nothing is fetched;
 *  - `stale`: lists whose membership or order changed are fetched again, and only those.
 *
 * Only the person's own profile and settings exist so far. The first thing that sits in several lists at
 * once (a page, a photo, a bill) brings the third tool with it: writing the changed object into every list
 * that holds the old one, as `put` does in Journey's copy of this file.
 */
export function useCache() {
  const client = useQueryClient();
  // The same object from one draw to the next, so it can be named in an effect's list without running it again.
  return useMemo(() => cacheFor(client), [client]);
}

export function cacheFor(client: QueryClient) {
  /** Fetches again every loaded list whose address starts with one of these. */
  const stale = (...addresses: string[]) =>
    client.invalidateQueries({
      predicate: (query) => query.queryKey.some((part) => typeof part === 'string' && addresses.some((address) => part.startsWith(address))),
    });

  return {
    /** The person's own profile was saved: the API sent it back. Whatever else says who they are is asked for again. */
    profileSaved: (profile: NonNullable<MeResponse['profile']>) => {
      client.setQueryData<MeResponse>(getGetMeQueryKey(), (me) => (me ? { ...me, profile } : me));
      return stale('/v1/me');
    },

    /** Settings were saved: the API sent them back. */
    settingsSaved: (settings: SettingsResponse) => {
      client.setQueryData(getGetSettingsQueryKey(), settings);
    },

    /** The first thing after signing up: load everything fresh. */
    everything: () => client.invalidateQueries(),
  };
}
