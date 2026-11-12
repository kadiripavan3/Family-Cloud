/**
 * Words handed to Jot from outside a screen: what another app shared, what the microphone heard. Kept in
 * memory until the screen that asked for them opens (`/jot/share`, `/jot/voice`), and never in an address.
 *
 * In the browser nothing calls `handIn`: the person pastes or types on the screen itself. On a phone build
 * the share extension and the speech recogniser are the callers (see native/jot/README.md).
 */
export type HandedIn = { text: string; name?: string; from: 'share' | 'voice' };

let waiting: HandedIn | null = null;

export function handIn(words: HandedIn): void {
  waiting = words;
}

/** What is waiting for this screen, once. */
export function takeHandedIn(from: HandedIn['from']): HandedIn | null {
  if (waiting?.from !== from) return null;
  const words = waiting;
  waiting = null;
  return words;
}
