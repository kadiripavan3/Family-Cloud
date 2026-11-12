import { type Href, useRouter } from 'expo-router';
import { useCallback } from 'react';

/** As much of a thing as opening it needs. Every answer that shows a thing has both. */
type Opens = { kind?: string | null; id?: string | null };

/**
 * The address of a thing's own screen, by its kind and by convention: a `page` is at `/page/<id>`, a
 * `checklist` at `/checklist/<id>`, a `vault_item` at `/vault-item/<id>`. There is no table to add to: a
 * place that builds `app/(app)/<kind with dashes>/[id].tsx` has made the screen every list opens. Until
 * then the address lands on `app/(app)/[kind]/[id].tsx`, which says the thing arrives with its place.
 */
export function thingHref(thing: Opens): Href {
  return { pathname: '/[kind]/[id]', params: { kind: (thing.kind ?? 'thing').replace(/_/g, '-'), id: thing.id ?? '' } };
}

/**
 * Opens a thing of any kind: `const open = useOpenThing(); open(thing)`. For lists of mixed things (search,
 * Today, a person's page, links, a guest pass). `ThingRow` does it by itself.
 */
export function useOpenThing(): (thing: Opens) => void {
  const router = useRouter();
  // What has no id is not a thing (a card that only says something): pressing it opens nothing.
  return useCallback((thing: Opens) => (thing.id ? router.push(thingHref(thing)) : undefined), [router]);
}

/** True for what the API uses as an id. An address like "/new/whatever" has none, and is simply not there. */
export function looksLikeId(value: string | undefined): boolean {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
