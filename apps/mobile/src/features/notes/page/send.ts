import * as ImagePicker from 'expo-image-picker';

import { ApiError } from '@/api/fetcher';
import { completeUpload, type MediaResponse, startUpload } from '@/api/generated/homeport';
import { removeFile, sendFile } from '@/api/transfer';
import { type LocalPhoto, uploadPhoto } from '@/api/upload';
import { words } from '@/words';

import type { PickedFile } from './pickFile';

/** Opens the phone's photo library for one photo, as it is. Null when the person cancels. */
export async function pickPhoto(): Promise<LocalPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
}

/**
 * Sends a photo up for a block of a page (ask for a place, send, say done), and returns what the page draws
 * until the API has sent the block back: the photo as it is on the phone, under the id it has now.
 */
export async function sendPhoto(photo: LocalPhoto): Promise<MediaResponse> {
  const id = await uploadPhoto(photo);
  return { id, kind: 'photo', url: photo.uri, thumbUrl: photo.uri, fileUrl: null, fileName: null, contentType: 'image/jpeg', width: photo.width, height: photo.height, durationSeconds: null, bytes: null };
}

/** Sends a file up for a block of a page, the same three steps, and returns what the page draws of it meanwhile. */
export async function sendPickedFile(file: PickedFile): Promise<MediaResponse> {
  try {
    const target = await startUpload({ kind: 'file', contentType: file.contentType, fileName: file.name.slice(0, 200) });
    const status = await sendFile(file.uri, target);
    if (status === 0) throw new ApiError(0, 'unreachable', words.states.unreachable);
    if (status < 200 || status >= 300) throw new ApiError(status, 'upload_failed', words.media.uploads.fileFailed);
    // Tell the API the file is there. Only then can it be put on a page.
    await completeUpload(target.mediaId);
    return { id: target.mediaId, kind: 'file', url: '', thumbUrl: null, fileUrl: null, fileName: file.name, contentType: file.contentType, width: null, height: null, durationSeconds: null, bytes: file.bytes };
  } finally {
    removeFile(file.uri);
  }
}
