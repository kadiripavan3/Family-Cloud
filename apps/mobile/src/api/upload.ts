import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { words } from '@/words';

import { ApiError } from './fetcher';
import { completeUpload, startUpload } from './generated/homeport';
import { removeFile } from './transfer';

/** The longest side a photo is uploaded at. Bigger photos are resized on the phone first. */
const MAX_SIDE = 2048;
/** How long one photo may take to go up, on the slowest connection worth waiting for. After that it counts as "nothing answered". */
const PHOTO_TIME_LIMIT_MS = 2 * 60 * 1000;

export type LocalPhoto = { uri: string; width: number; height: number };

/**
 * Uploads one photo and returns its media id, ready to attach to what it belongs to (a profile, so far).
 * The photo is resized and saved as JPEG on the phone, then sent straight to storage.
 */
export async function uploadPhoto(photo: LocalPhoto): Promise<string> {
  // The copy that goes up is made here and removed again once the upload is over, however it ended.
  let copy: string;
  try {
    const longest = Math.max(photo.width, photo.height);
    const context = ImageManipulator.manipulate(photo.uri);
    if (longest > MAX_SIDE) {
      context.resize(photo.width >= photo.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
    }
    const rendered = await context.renderAsync();
    copy = (await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 })).uri;
  } catch {
    // Not a connection that is gone: trying again later can't fix a photo that can't be read.
    throw new ApiError(400, 'file_gone', words.media.uploads.photoUnreadable);
  }

  try {
    const target = await startUpload({ kind: 'photo', contentType: 'image/jpeg' });
    const file = await (await fetch(copy)).blob();
    let response: Response;
    const limit = new AbortController();
    const timer = setTimeout(() => limit.abort(), PHOTO_TIME_LIMIT_MS);
    try {
      response = await fetch(target.uploadUrl, { method: target.method, headers: target.headers, body: file, signal: limit.signal });
    } catch {
      throw new ApiError(0, 'unreachable', words.media.uploads.photoUnreachable);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new ApiError(response.status, 'upload_failed', words.media.uploads.photoFailed);
    }
    // Tell the API the file is there. It checks it and makes the smaller versions; only then can it be used.
    await completeUpload(target.mediaId);
    return target.mediaId;
  } finally {
    if (copy !== photo.uri) removeFile(copy);
  }
}
