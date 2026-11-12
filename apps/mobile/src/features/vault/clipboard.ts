import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';

/**
 * Copying something secret. It goes to the clipboard, which every app on a phone can read, so it is taken
 * off again after a minute where the platform allows:
 *
 *  - iPhone: the system itself removes it after 60 seconds, and it is not passed on to the person's other
 *    devices.
 *  - Android: it is marked as sensitive (no preview of it is shown), and after 60 seconds the app empties the
 *    clipboard if it still holds what was copied and the app is in front.
 *  - Browser: after 60 seconds the page empties the clipboard, if the browser lets it (the page has to be in
 *    front; some browsers refuse).
 *
 * What was pasted somewhere stays there. Nothing here can take that back.
 */
export const CLEAR_AFTER_MS = 60_000;

let timer: ReturnType<typeof setTimeout> | null = null;

/** Copies a secret and arranges for it to be cleared. False when the phone or the browser didn't allow the copy. */
export async function copySecret(text: string): Promise<boolean> {
  if (timer) clearTimeout(timer);
  timer = null;
  try {
    const copied = await Clipboard.setStringAsync(text, { ios: { localOnly: true, expiresAt: new Date(Date.now() + CLEAR_AFTER_MS) }, android: { isSensitive: true } });
    if (!copied) return false;
  } catch {
    return false;
  }
  // The iPhone clears it by itself. Elsewhere the app does, when the minute is up.
  if (Platform.OS !== 'ios') timer = setTimeout(() => void clearIfStillThere(text), CLEAR_AFTER_MS);
  return true;
}

/** Empties the clipboard if it still holds what was copied. When it can't be read, it is emptied anyway: better to lose a copied word than to leave a password lying there. */
async function clearIfStillThere(text: string): Promise<void> {
  timer = null;
  try {
    let now: string | null = null;
    try {
      now = await Clipboard.getStringAsync();
    } catch {
      now = null;
    }
    if (now === null || now === text) await Clipboard.setStringAsync('');
  } catch {
    // The platform didn't allow it (a browser tab that isn't in front). Nothing more can be done from here.
  }
}
