import { Linking } from 'react-native';

/** A file kept in the Library, to save a copy of: where it is, and what it is called. */
export type Saved = { url: string; name?: string | null };

/**
 * Saves copies of files to this phone. Writing into the phone's own photos needs a part the app doesn't
 * have yet, so for now the first file is opened where the phone can save it from. Says what happened:
 * "saved", "opened", or "failed".
 */
export async function saveFiles(files: readonly Saved[]): Promise<'saved' | 'opened' | 'failed'> {
  const first = files[0];
  if (!first) return 'failed';
  try {
    await Linking.openURL(first.url);
    return 'opened';
  } catch {
    return 'failed';
  }
}

/** Opens a file with whatever the phone opens it with: a video in its player, a PDF in its reader. */
export async function openFile(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
