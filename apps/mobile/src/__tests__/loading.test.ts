import { ApiError } from '@/api/fetcher';
import { isGone, loadState } from '@/lib/loading';
import { failed, loaded, pending } from '@/test/samples';

const down = new ApiError(0, 'unreachable', "Can't reach Homeport right now.");

describe('several things a screen reads, looked at together', () => {
  it('has no error while everything is loaded or on its way', () => {
    expect(loadState(loaded({ id: 1 }), pending()).error).toBeNull();
  });

  it('is an error when one failed and has nothing to show', () => {
    expect(loadState(loaded({ id: 1 }), failed(down)).error).toBe(down);
  });

  it('is not an error when a refresh failed behind data that is already on screen', () => {
    // What TanStack Query gives after a failed refetch: the error, and the data from before.
    const stale = { ...failed(down), data: { id: 1 } };
    expect(loadState(stale, loaded({ id: 2 })).error).toBeNull();
  });

  it('is an error again when the refresh says the thing has gone: what is on screen no longer exists', () => {
    const gone = new ApiError(404, 'not_found', "This page isn't available.");
    expect(loadState({ ...failed(gone), data: { id: 1 } }).error).toBe(gone);
  });

  it('asks again for everything that failed, and only that', () => {
    const fine = loaded({ id: 1 });
    const first = failed(down);
    const second = failed(down);
    loadState(fine, first, second).retry();
    expect(first.refetch).toHaveBeenCalledTimes(1);
    expect(second.refetch).toHaveBeenCalledTimes(1);
    expect(fine.refetch).not.toHaveBeenCalled();
  });

  it('knows when something that was never loaded is waiting for a connection', () => {
    expect(loadState({ ...pending(), isPaused: true }).offline).toBe(true);
    expect(loadState({ ...loaded({ id: 1 }), isPaused: true }).offline).toBe(false);
  });
});

describe('whether asking again can help', () => {
  it('cannot when the thing is not there or not for this person', () => {
    expect(isGone(new ApiError(404, 'not_found', "This page isn't available."))).toBe(true);
    expect(isGone(new ApiError(403, 'forbidden', 'Not yours.'))).toBe(true);
  });

  it('can after a failure on the way or on our side', () => {
    expect(isGone(down)).toBe(false);
    expect(isGone(new ApiError(500, 'error', 'Something went wrong on our side.'))).toBe(false);
    expect(isGone(new Error('boom'))).toBe(false);
  });
});
