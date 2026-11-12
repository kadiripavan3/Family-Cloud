import * as ImagePicker from 'expo-image-picker';

import { ApiError } from '@/api/fetcher';
import { completeUpload, startUpload } from '@/api/generated/homeport';
import { removeFile, sendFile } from '@/api/transfer';
import { type LocalPhoto, uploadPhoto } from '@/api/upload';
import { words } from '@/words';

import type { LocalSound } from './soundFile';

export { uploadPhoto };
export type { LocalPhoto };

/** Opens the phone's photo library for one photo, as it is. Null when the person closes it without choosing. */
export async function pickPhoto(): Promise<LocalPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
}

/**
 * Sends a recording up and returns its media id, ready to go with an entry (a letter, a quote, an answer).
 * A recording is kept as it arrives, with the length the device measured.
 */
export async function uploadSound(recording: LocalSound): Promise<string> {
  const target = await startUpload({ kind: 'audio', contentType: recording.contentType, fileName: recording.name, durationSeconds: recording.seconds ?? undefined });
  const status = await sendFile(recording.uri, target);
  if (status === 0) throw new ApiError(0, 'unreachable', words.templates.sound.unreachable);
  if (status < 200 || status >= 300) throw new ApiError(status, 'upload_failed', words.templates.sound.failed);
  await completeUpload(target.mediaId);
  removeFile(recording.uri);
  return target.mediaId;
}
