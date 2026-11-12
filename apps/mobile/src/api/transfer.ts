import { File, UploadType } from 'expo-file-system';

import { words } from '@/words';

import { ApiError } from './fetcher';

/** Where a file goes, as the API hands it out. */
export type Target = { uploadUrl: string; method: string; headers: Record<string, string> };

/**
 * Sends a file on the phone to where the API said, and returns the answer's status (0 when nothing answered).
 * The phone's own transfer service does the sending, so a long video keeps going when the app is put away.
 *
 * Only a transfer that really got no answer counts as "nothing answered". A file that is gone, or anything
 * else that isn't about the connection, is a failure with its own sentence: trying again later can't fix it.
 */
export async function sendFile(uri: string, target: Target, onProgress?: (fraction: number) => void): Promise<number> {
  const file = new File(uri);
  if (!file.exists) throw new ApiError(400, 'file_gone', words.media.uploads.fileGone);
  try {
    const result = await file.upload(target.uploadUrl, {
      httpMethod: target.method.toUpperCase() === 'POST' ? 'POST' : 'PUT',
      uploadType: UploadType.BINARY_CONTENT,
      headers: target.headers,
      sessionType: 'background',
      onProgress: onProgress ? ({ bytesSent, totalBytes }) => onProgress(totalBytes > 0 ? Math.min(bytesSent / totalBytes, 1) : 0) : undefined,
    });
    return result.status;
  } catch (error) {
    // "Unable to upload" is what the transfer service says when the connection failed, on both kinds of phone.
    if (codeOf(error) === 'ERR_UNABLE_TO_UPLOAD') return 0;
    throw new ApiError(400, 'upload_failed', words.media.uploads.fileFailed);
  }
}

/** Removes a file the app made only for an upload (a resized photo, say). Quiet when it is gone already. */
export function removeFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // It sits in the phone's temporary space, which the phone clears by itself.
  }
}

function codeOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
}
