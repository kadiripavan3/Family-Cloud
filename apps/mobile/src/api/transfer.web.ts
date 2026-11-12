import { words } from '@/words';

import { ApiError } from './fetcher';

/** Where a file goes, as the API hands it out. */
export type Target = { uploadUrl: string; method: string; headers: Record<string, string> };

/**
 * Sends a file the browser holds to where the API said, and returns the answer's status (0 when nothing
 * answered). A file the browser no longer has is a failure with its own sentence, not a lost connection.
 */
export async function sendFile(uri: string, target: Target, onProgress?: (fraction: number) => void): Promise<number> {
  let body: Blob;
  try {
    body = await (await fetch(uri)).blob();
  } catch {
    throw new ApiError(400, 'file_gone', words.media.uploads.fileGone);
  }
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open(target.method, target.uploadUrl);
    for (const [name, value] of Object.entries(target.headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable && event.total > 0) onProgress(Math.min(event.loaded / event.total, 1));
    };
    request.onload = () => resolve(request.status);
    request.onerror = () => resolve(0);
    request.onabort = () => resolve(0);
    // A file that hasn't gone up after a quarter of an hour isn't going to.
    request.timeout = 15 * 60 * 1000;
    request.ontimeout = () => resolve(0);
    request.send(body);
  });
}

/** Lets go of a file the app made only for an upload. In a browser that is a picture held in memory. */
export function removeFile(uri: string): void {
  if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
}
