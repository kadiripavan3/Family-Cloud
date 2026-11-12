import type { LocalSound } from './soundFile';

/**
 * Sound on a phone: recording with the microphone and playing a recording back both need the phone's own
 * audio, which comes with the phone build (the last milestone; the app carries no audio library yet). Until
 * then this build says so wherever a microphone or a play button is drawn (`words.templates.sound`), and the
 * browser build (`sound.web.ts`) stands in: a picked sound file for the microphone, the browser's own player
 * for playing back.
 */
export const sound = { canAdd: false, canPlay: false };

/** Asks for a recording. Null on a phone, where there is no way to make one yet. */
export async function pickSound(): Promise<LocalSound | null> {
  return null;
}

/** Plays a recording and says when it has ended. Returns how to stop it. On a phone it ends at once. */
export function playSound(url: string, onEnd: () => void): () => void {
  onEnd();
  return () => undefined;
}
