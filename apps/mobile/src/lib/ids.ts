import { randomUUID } from 'expo-crypto';

/**
 * An id the app makes up for something it is about to create (a page, an event, a bill). It is sent
 * with the request, so if the answer gets lost and the request is sent again, the API recognises it and
 * doesn't make a second one.
 */
export function newClientId(): string {
  return randomUUID();
}
