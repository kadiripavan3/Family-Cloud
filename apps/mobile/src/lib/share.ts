import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';

/** Copies a link or a line of text. False when the phone or the browser didn't allow it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    return await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
}

/** A web address as people read it: without "https://" and without a slash at the end. */
export function shortLink(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/**
 * Hands a line of text (a link with a few words) to the phone's share sheet. Where there is none (most
 * browsers) the text is copied instead. Says which happened: "shared", "copied", or "neither".
 */
export async function shareText(text: string): Promise<'shared' | 'copied' | 'neither'> {
  try {
    await Share.share({ message: text });
    return 'shared';
  } catch {
    return (await copyText(text)) ? 'copied' : 'neither';
  }
}
