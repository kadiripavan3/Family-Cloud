import { ApiError } from '@/api/fetcher';

/** What a screen needs to know of something it asked the API for. Every query has these. */
type Asked = { data: unknown; isError: boolean; error: unknown; isFetching: boolean; isPaused: boolean; refetch: () => unknown };

/**
 * Several things a screen reads, looked at together.
 *
 * `error` is set only when one of them failed and has nothing to show. A refresh that fails behind a page
 * that is already on screen is not a reason to take the page away, so it is not an error here. The one
 * exception: the answer "this isn't there" (deleted, or no longer shared with this person). Then what is on
 * screen no longer exists, and the page says so.
 * `retry` asks again for every one that failed, not only the first. `offline` is true while one that was
 * never loaded waits for a connection: the screen says so instead of spinning.
 */
export function loadState(...asked: Asked[]) {
  const failed = asked.filter((one) => one.isError && (one.data === undefined || isGone(one.error)));
  return {
    error: failed[0]?.error ?? null,
    retry: () => {
      for (const one of failed) void one.refetch();
    },
    retrying: failed.some((one) => one.isFetching),
    offline: asked.some((one) => one.isPaused && one.data === undefined),
  };
}

/** Whether something that may still be on screen has gone: the last answer about it was "this isn't there". */
export function wentAway(asked: { isError: boolean; error: unknown }): boolean {
  return asked.isError && isGone(asked.error);
}

/** Whether asking again can't help: the thing isn't there, or isn't for this person. */
export function isGone(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 403 || error.status === 410);
}
