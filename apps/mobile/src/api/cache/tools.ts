import type { Query, QueryClient } from '@tanstack/react-query';

type Bag = Record<string, unknown>;

/**
 * The tools every change to loaded data is made of. `cacheFor` (index.ts) hands them to each place's own
 * file in this folder; screens never use them directly, they call the function that names what happened.
 *
 *  - `stale`: lists whose membership or order changed are fetched again, and only those (by how their
 *    address starts; `staleOnly` for one exact address, `staleAbout` for everything that names an id).
 *  - `put`: the API just sent the changed thing back, so it is written over every loaded copy of it and
 *    nothing is fetched.
 *  - `patch`: one part of every loaded copy is replaced, when the API didn't send the whole thing back.
 *  - `drop`: what was loaded about something that is gone is forgotten.
 *  - `thingChanged`, `thingMade`, `thingGone`: the three things that can happen to a thing of any kind, for
 *    the lists of mixed kinds (Today, search, a person's page, links) that no place knows about.
 */
export function toolsFor(client: QueryClient) {
  /** True for an answer whose address starts with one of these. */
  const from = (addresses: string[]) => (query: Query) => query.queryKey.some((part) => typeof part === 'string' && addresses.some((address) => part.startsWith(address)));
  /** True for an answer whose address names this id: a thing's own page, its audience, its links. */
  const about = (id: string) => (query: Query) => query.queryKey.some((part) => typeof part === 'string' && part.includes(id));

  /** Fetches again every loaded answer whose address starts with one of these. */
  const stale = (...addresses: string[]) => client.invalidateQueries({ predicate: from(addresses) });

  /** Fetches again the loaded answers at exactly these addresses: `/v1/circles` is the list of circles, and not everything under it. */
  const staleOnly = (...addresses: string[]) => client.invalidateQueries({ predicate: (query) => query.queryKey.some((part) => typeof part === 'string' && addresses.includes(part)) });

  /** Fetches again every loaded answer about one thing, whatever its kind: `/v1/pages/<id>`, `/v1/things/<id>/audience`, … */
  const staleAbout = (id: string) => client.invalidateQueries({ predicate: about(id) });

  /**
   * Writes an object the API just sent back into every loaded answer that holds the old one: the object with
   * the same `id` for which `is` says it is the same kind of object (a list's row and the whole thing often
   * share an id and differ in shape). An answer that doesn't hold it is not touched, and a list that does is
   * no fresher for it: whether it still has to be fetched again stays as it was. Only the object's own page
   * counts as just read.
   */
  const put = (is: (old: Bag) => boolean, next: { id: string }, fit?: (old: Bag, next: { id: string }) => { id: string }) => {
    for (const query of client.getQueryCache().getAll()) {
      const data: unknown = query.state.data;
      // The object's own page (nothing around it) takes the new one as it is.
      const swapped = swap(data, (bag) => bag.id === next.id && is(bag), (old, depth) => (fit && depth > 0 ? fit(old, next) : next));
      if (swapped === data) continue;
      if (swapped === next) client.setQueryData(query.queryKey, swapped);
      else query.setState({ data: swapped });
    }
  };

  /**
   * Changes one part of every loaded copy of something, when the API didn't send the whole thing back: the
   * new chip on a thing after its audience changed. `change` gets each copy (a row in a list, the thing's
   * own page) and returns it with the part replaced. Nothing counts as just read.
   */
  const patch = (id: string, is: (old: Bag) => boolean, change: (old: Bag) => Bag) => {
    for (const query of client.getQueryCache().getAll()) {
      const data: unknown = query.state.data;
      const swapped = swap(data, (bag) => bag.id === id && is(bag), change);
      if (swapped !== data) query.setState({ data: swapped });
    }
  };

  /**
   * Forgets what was loaded about something that is gone (its address names this id). A screen of it that is
   * still closing keeps what it shows until it has closed: dropping that under it would make it ask again
   * and flash "not available" on the way out.
   */
  const drop = (id: string) => {
    const loaded = client.getQueryCache();
    const gone = about(id);
    const dropUnwatched = () => client.removeQueries({ predicate: (query) => gone(query) && query.getObserversCount() === 0 });
    dropUnwatched();
    if (!loaded.getAll().some(gone)) return;
    const stop = loaded.subscribe((event) => {
      if (event.type !== 'observerRemoved' || !gone(event.query)) return;
      dropUnwatched();
      if (!loaded.getAll().some(gone)) stop();
    });
  };

  /** Every list that can hold a thing of this circle: Today, search, each place's own lists, people's pages, links, the counts on You. */
  const listsOf = (circleId: string) => Promise.all([stale(`/v1/circles/${circleId}/`, '/v1/members/', '/v1/things/'), staleOnly('/v1/circles', '/v1/me/overview')]);

  return {
    client,
    stale,
    staleOnly,
    staleAbout,
    put,
    patch,
    drop,
    /** A thing of any kind was changed in a way lists show (its title, where it stands, who sees it). */
    thingChanged: (thing: { id: string; circleId: string }) => Promise.all([staleAbout(thing.id), listsOf(thing.circleId)]),
    /** A thing of any kind was made in a circle. */
    thingMade: (circleId: string) => listsOf(circleId),
    /** A thing of any kind is gone. */
    thingGone: (thing: { id: string; circleId: string }) => {
      drop(thing.id);
      return listsOf(thing.circleId);
    },
  };
}

export type CacheTools = ReturnType<typeof toolsFor>;

/** Replaces, anywhere inside loaded data, every object `is` picks with what `replace` makes of it. Returns the same data when nothing matched. */
function swap(value: unknown, is: (value: Bag) => boolean, replace: (old: Bag, depth: number) => unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object' || depth > 8) return value;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const swapped = swap(item, is, replace, depth + 1);
      if (swapped !== item) changed = true;
      return swapped;
    });
    return changed ? out : value;
  }
  const bag = value as Bag;
  if (is(bag)) return replace(bag, depth);
  let changed = false;
  const out: Bag = {};
  for (const key of Object.keys(bag)) {
    out[key] = swap(bag[key], is, replace, depth + 1);
    if (out[key] !== bag[key]) changed = true;
  }
  return changed ? out : value;
}
