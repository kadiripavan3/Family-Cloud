import { useCallback, useEffect, useRef, useState } from 'react';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { addToLibrary, type Audience, checkLibrary, completeUpload, type NewItem, startUpload } from '@/api/generated/homeport';
import { removeFile, sendFile } from '@/api/transfer';
import { newClientId } from '@/lib/ids';
import { words } from '@/words';

import { bytesOf, stillOf } from './pick';
import { fingerprint, PHOTO_TYPES, type Picked, VIDEO_TYPES } from './picked';

/** Where one chosen file stands on its way into the Library. */
export type AddingState = 'waiting' | 'checking' | 'uploading' | 'adding' | 'added' | 'already' | 'failed';

/** One chosen file, and how far it has got. */
export type AddingLine = {
  /** Made when it was chosen. It is sent with the file, so adding it twice still makes one thing. */
  clientId: string;
  picked: Picked;
  state: AddingState;
  /** How much of it has gone up, from 0 to 1. */
  progress: number;
  /** Why it didn't work, in a sentence. */
  problem?: string;
  /** What it became, or what was there already. */
  itemId?: string;
};

/** The API takes this many files in one call. */
const AT_ONCE = 100;

/** A file a browser may hand over that the Library can't keep: said before anything is sent. */
function refusal(picked: Picked): string | null {
  const fits = picked.kind === 'photo' ? PHOTO_TYPES.includes(picked.contentType) : picked.kind === 'video' ? VIDEO_TYPES.includes(picked.contentType) : false;
  return fits ? null : words.library.adding.state.wrongType;
}

/** A file on its way up: where it is, and what the API is told about it. */
type Sending = { uri: string; kind: 'photo' | 'video'; contentType: string; fileName?: string; durationSeconds?: number; keepOriginal?: boolean };

/** Sends one file to where the API said and tells it the file is there. Returns the upload's id. */
async function upload(file: Sending, onProgress?: (fraction: number) => void): Promise<string> {
  const { uri, ...about } = file;
  const target = await startUpload(about);
  const status = await sendFile(uri, target, onProgress);
  if (status < 200 || status >= 300) throw new ApiError(status, status === 0 ? 'unreachable' : 'upload_failed', words.media.uploads.fileFailed);
  await completeUpload(target.mediaId);
  return target.mediaId;
}

/**
 * Adds chosen photos and videos to a circle's Library, and says how each one is getting on.
 *
 * Each file's fingerprint (SHA-256) is taken first and the API is asked which of them it has already:
 * those are not sent again. The rest go up one after the other at full size, a video with a still made
 * from it where the device can make one, and are then added together. A file that fails holds nothing
 * else back, and `retry()` sends the failed ones again with the same ids.
 */
export function useAdding(circleId: string, audience: Audience | undefined) {
  const cache = useCache();
  const [lines, setLines] = useState<AddingLine[]>([]);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const change = useCallback((clientId: string, next: Partial<AddingLine>) => {
    if (alive.current) setLines((now) => now.map((line) => (line.clientId === clientId ? { ...line, ...next } : line)));
  }, []);

  const run = useCallback(
    async (batch: AddingLine[]) => {
      setBusy(true);
      try {
        // 1. A fingerprint for each, so the same file is recognised wherever it comes from.
        const hashes = new Map<string, string>();
        for (const line of batch) {
          const refused = refusal(line.picked);
          if (refused) {
            change(line.clientId, { state: 'failed', problem: refused });
            continue;
          }
          change(line.clientId, { state: 'checking', problem: undefined });
          try {
            hashes.set(line.clientId, await fingerprint(await bytesOf(line.picked)));
          } catch {
            change(line.clientId, { state: 'failed', problem: words.media.uploads.fileGone });
          }
        }
        const fresh = batch.filter((line) => hashes.has(line.clientId));
        if (fresh.length === 0) return;

        // 2. What the Library has already isn't sent again.
        const known = new Map<string, string>();
        try {
          const answer = await checkLibrary({ circleId, hashes: [...new Set(hashes.values())] });
          for (const one of answer.known) if (one.hash && one.id) known.set(one.hash.toLowerCase(), one.id);
        } catch (error) {
          for (const line of fresh) change(line.clientId, { state: 'failed', problem: messageFor(error) });
          return;
        }

        // 3. The rest go up, one after the other.
        const items: NewItem[] = [];
        for (const line of fresh) {
          const hash = hashes.get(line.clientId)!;
          const there = known.get(hash);
          if (there) {
            change(line.clientId, { state: 'already', progress: 1, itemId: there });
            continue;
          }
          const { picked } = line;
          const kind = picked.kind === 'video' ? 'video' : 'photo';
          change(line.clientId, { state: 'uploading', progress: 0 });
          try {
            // A photo is kept as it arrives, at full size, next to the sizes made from it.
            const mediaId = await upload({ uri: picked.uri, kind, contentType: picked.contentType, fileName: picked.name, durationSeconds: kind === 'video' ? picked.durationSeconds : undefined, keepOriginal: kind === 'photo' }, (progress) => change(line.clientId, { progress }));
            let posterMediaId: string | undefined;
            if (kind === 'video') {
              // A still for the wall. Without one the video is still added.
              const still = await stillOf(picked);
              if (still) {
                posterMediaId = await upload({ uri: still, kind: 'photo', contentType: 'image/jpeg' }).catch(() => undefined);
                removeFile(still);
              }
            }
            items.push({ clientId: line.clientId, mediaId, contentHash: hash, takenAt: picked.takenAt, lat: picked.lat, lng: picked.lng, posterMediaId, audience });
            change(line.clientId, { state: 'adding', progress: 1 });
          } catch (error) {
            change(line.clientId, { state: 'failed', problem: messageFor(error) });
          }
        }

        // 4. Added together, a hundred at a time. Each is answered for by itself.
        let added = false;
        for (let at = 0; at < items.length; at += AT_ONCE) {
          const part = items.slice(at, at + AT_ONCE);
          try {
            const answer = await addToLibrary({ circleId, items: part });
            for (const one of answer.items) {
              if (!one.clientId) continue;
              if (one.problem) change(one.clientId, { state: 'failed', problem: one.problem.message ?? words.states.unknown });
              else {
                change(one.clientId, { state: one.alreadyThere ? 'already' : 'added', itemId: one.item?.id });
                added = added || !one.alreadyThere;
              }
            }
          } catch (error) {
            for (const one of part) change(one.clientId, { state: 'failed', problem: messageFor(error) });
          }
        }
        if (added) await cache.libraryAdded(circleId);
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [audience, cache, change, circleId],
  );

  /** Takes what was chosen and starts on it. */
  const add = useCallback(
    (picked: Picked[]) => {
      if (picked.length === 0) return;
      const batch = picked.map((one) => ({ clientId: newClientId(), picked: one, state: 'waiting' as const, progress: 0 }));
      setLines((now) => [...now, ...batch]);
      void run(batch);
    },
    [run],
  );

  /** Sends what failed again. */
  const retry = useCallback(() => {
    const failed = lines.filter((line) => line.state === 'failed');
    if (failed.length > 0) void run(failed);
  }, [lines, run]);

  const count = (state: AddingState) => lines.filter((line) => line.state === state).length;
  return { lines, add, retry, busy, added: count('added'), already: count('already'), failed: count('failed') };
}
