import { ApiError } from '@/api/fetcher';
import { completeUpload, type GoodnightResponse, sendGoodnight, startUpload } from '@/api/generated/homeport';
import { removeFile, sendFile } from '@/api/transfer';
import { withOffset } from '@/features/library/adding/exif';
import { words } from '@/words';

import type { Clip } from './pickClip';

/** The videos a goodnight can be: the ones the Library keeps too. */
const CLIP_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

/** True for a file that can be sent as a goodnight. */
export function isClip(clip: Clip): boolean {
  return CLIP_TYPES.includes(clip.contentType);
}

/**
 * Sends a goodnight back: the clip goes up like any video (ask for a target, send, say it is there), then
 * the goodnight is made in answer to the one it replies to. It goes to the circle only, and never to Journey.
 */
export async function sendBack(clip: Clip, to: Pick<GoodnightResponse, 'id' | 'circleId'>, title: string, clientId: string, onProgress?: (fraction: number) => void): Promise<GoodnightResponse> {
  if (!isClip(clip)) throw new ApiError(400, 'not_a_video', words.together.goodnight.back.notVideo);
  const target = await startUpload({ kind: 'video', contentType: clip.contentType, fileName: clip.name || undefined, durationSeconds: clip.durationSeconds });
  const status = await sendFile(clip.uri, target, onProgress);
  if (status < 200 || status >= 300) throw new ApiError(status, status === 0 ? 'unreachable' : 'upload_failed', words.media.uploads.fileFailed);
  await completeUpload(target.mediaId);
  removeFile(clip.uri);
  return sendGoodnight({ clientId, circleId: to.circleId, mediaId: target.mediaId, replyTo: to.id, title, recordedAt: withOffset(new Date()) });
}
