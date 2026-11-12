import { ApiError } from '@/api/fetcher';
import { type LateBlockChange, type LateLineChange, sendChecklistChanges, sendPageChanges } from '@/api/generated/homeport';

import type { Answer, Change, Sent, Target } from './types';

/** The API takes 200 changes at once and 64 KB of text. A long queue goes in parts well inside both. */
export const MOST_AT_ONCE = 100;
export const MOST_BYTES = 40_000;

/** How many bytes a text takes on its way to the API. */
function bytes(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) count += 1;
    else if (code < 0x800) count += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      // The first half of a pair: both halves together take four.
      count += 4;
      index += 1;
    } else count += 3;
  }
  return count;
}

/**
 * The next part of a queue to send: its oldest changes, as many as fit in one request. Always at least one,
 * so a change that is too big by itself still gets its own answer from the API.
 */
export function nextPart(queue: readonly Change[], most: number = MOST_AT_ONCE): Change[] {
  const part: Change[] = [];
  let size = 0;
  for (const change of queue) {
    const next = bytes(JSON.stringify(change.body)) + 1;
    if (part.length > 0 && (part.length >= most || size + next > MOST_BYTES)) break;
    part.push(change);
    size += next;
  }
  return part;
}

const OUTCOMES = ['done', 'gone', 'refused'] as const;

/** One answer as the API sent it, made whole. An answer that is missing counts as done: the API answers every change it took. */
function answerOf(raw: { outcome?: string; itemId?: string | null; blockId?: string | null; said?: string | null } | undefined): Answer {
  const outcome = OUTCOMES.find((one) => one === raw?.outcome) ?? 'done';
  return { outcome, id: raw?.itemId ?? raw?.blockId ?? null, said: raw?.said ?? null };
}

/**
 * Sends one part of a target's queue to the API's `changes` route, in order. The API does each change by
 * itself and answers each: `done`, `gone` (what it was about was removed meanwhile) or `refused` (with a
 * sentence). It also sends back the list or the page as it stands now. Sending the same part twice is safe.
 */
export async function sendChanges(target: Target, part: readonly Change[]): Promise<Sent> {
  if (target.kind === 'checklist') {
    const sent = await sendChecklistChanges(target.id, { changes: part.map((change) => change.body as LateLineChange) });
    return { answers: part.map((_, index) => answerOf(sent.answers?.[index])), now: sent.list };
  }
  const sent = await sendPageChanges(target.id, { changes: part.map((change) => change.body as LateBlockChange) });
  return { answers: part.map((_, index) => answerOf(sent.answers?.[index])), now: sent.page };
}

/**
 * How a try ended when a part of a queue didn't go in. The one place that decides it:
 *  - `unreachable`: nothing answered. No connection, most likely: everything keeps its place and waits.
 *  - `later`: something answered, and said "not now" (it stumbled, it is busy, it is being updated, or the
 *    sign-in has to be renewed first). Worth trying again after a while.
 *  - `gone`: the list or the page itself isn't there any more, or isn't this person's to change. Nothing in
 *    its queue can ever go in.
 *  - `refused`: a no to this request that trying again won't change (one of its changes is wrong, or it is
 *    too big). Its changes are tried one at a time, so the one that is wrong is found and the rest go in.
 */
export type Failure = 'unreachable' | 'later' | 'gone' | 'refused';

export function howItFailed(error: unknown): Failure {
  if (!(error instanceof ApiError)) return 'refused';
  if (error.status === 0) return 'unreachable';
  if (error.status === 401 || error.status === 408 || error.status === 429 || error.status >= 500) return 'later';
  if (error.status === 403 || error.status === 404 || error.status === 410) return 'gone';
  return 'refused';
}
