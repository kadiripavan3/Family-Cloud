import * as Clipboard from 'expo-clipboard';

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
