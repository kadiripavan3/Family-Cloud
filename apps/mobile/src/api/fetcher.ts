import { words } from '@/words';

import { apiBaseUrl } from './config';

/** A failure from the API, already worded for the person using the app. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** For invalid input: field name to message. */
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** How long any request to the API may take. After that it counts as "nothing answered". */
export const TIME_LIMIT_MS = 15_000;

/** Nothing answered: no connection, the API is away, or it took too long. `status` is 0. */
export function unreachable(message: string = words.states.unreachable): ApiError {
  return new ApiError(0, 'unreachable', message);
}

/** True when nothing answered at all. Worth trying again later, exactly as it was. */
export function isUnreachable(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0;
}

type Hooks = {
  getToken: () => string | null;
  /**
   * After the API refused the token: a fresh one. Null means the sign-in service refused as well, and the
   * person has to sign in again. When the service couldn't be asked (no connection), this throws instead.
   */
  renew?: () => Promise<string | null>;
  onSignedOut: () => void;
};
let hooks: Hooks = { getToken: () => null, onSignedOut: () => {} };

/** The session tells the client where to find the sign-in token and what to do when it stops working. */
export function connectSession(next: Hooks) {
  hooks = next;
  renewing = null;
}

type Listener = (method: string, path: string, answer: unknown, sent: unknown) => void;
const listeners = new Set<Listener>();
let answeredAt = 0;

/**
 * Hears every request the API said yes to: its method, its address (without the API's own), the answer, and
 * what was sent with it. Whatever has to follow a change wherever it was made listens here, such as the
 * question about notifications, which waits for a good moment. Returns how to stop listening.
 */
export function onAnswer(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** When the API last said yes to anything; 0 when it hasn't yet. "The API can be reached" is judged by this. */
export function lastAnswerAt(): number {
  return answeredAt;
}

/** The renewal that is on its way. Every request that needs a fresh token waits for the same one. */
let renewing: Promise<string | null> | null = null;

function renewOnce(renew: () => Promise<string | null>): Promise<string | null> {
  renewing ??= within(TIME_LIMIT_MS, renew()).finally(() => {
    renewing = null;
  });
  return renewing;
}

/** The promise's own answer, or a failure when it takes longer than the limit. */
function within<T>(limit: number, promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(unreachable()), limit);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        reject(unreachable());
      },
    );
  });
}

type Answer = { status: number; ok: boolean; text: string };

/**
 * One request with a time limit. A caller that gives up (a screen that closed) stops it and gets its own
 * "stopped" back; anything else that goes wrong before an answer is "can't reach Homeport".
 */
async function send(path: string, options: RequestInit | undefined, token: string | null): Promise<Answer> {
  const headers = new Headers(options?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const caller = options?.signal ?? undefined;
  const limit = new AbortController();
  let tooLong = false;
  const timer = setTimeout(() => {
    tooLong = true;
    limit.abort();
  }, TIME_LIMIT_MS);
  const stop = () => limit.abort();
  if (caller?.aborted) stop();
  else caller?.addEventListener('abort', stop);
  try {
    const response = await fetch(apiBaseUrl() + path, { ...options, headers, signal: limit.signal });
    return { status: response.status, ok: response.ok, text: await response.text() };
  } catch (error) {
    if (caller?.aborted) throw error;
    throw tooLong ? unreachable(words.states.tooSlow) : unreachable();
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener('abort', stop);
  }
}

/** Every generated API call goes through here: it adds the address and the sign-in token, and turns failures into ApiError. */
export const apiFetch = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const token = hooks.getToken();
  let answer = await send(path, options, token);

  // A token that ran out is renewed and the request sent again; the person never notices. Only a renewal the
  // sign-in service really refused ends the sign-in: a weak connection never does.
  if (answer.status === 401 && token) {
    const now = hooks.getToken();
    let fresh: string | null = null;
    if (now && now !== token) {
      fresh = now; // another request renewed it meanwhile
    } else if (hooks.renew) {
      try {
        fresh = await renewOnce(hooks.renew);
      } catch {
        throw unreachable();
      }
    }
    if (fresh && fresh !== token) answer = await send(path, options, fresh);
  }

  const body = answer.text ? safeJson(answer.text) : undefined;

  if (!answer.ok) {
    if (answer.status === 401 && token) hooks.onSignedOut();
    const problem = isRecord(body) ? body : {};
    throw new ApiError(
      answer.status,
      typeof problem.code === 'string' ? problem.code : 'error',
      typeof problem.detail === 'string' ? problem.detail : words.states.onOurSide,
      isRecord(problem.fields) ? (problem.fields as Record<string, string>) : {},
    );
  }
  answeredAt = Date.now();
  const method = (options?.method ?? 'GET').toUpperCase();
  for (const listener of listeners) {
    try {
      listener(method, path, body, options?.body);
    } catch {
      // A listener that breaks must never fail the request it heard about.
    }
  }
  return body as T;
};

/** The response as JSON (an object or a list), or undefined when it isn't JSON. */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The message to show for any thrown value. */
export function messageFor(error: unknown): string {
  return error instanceof ApiError ? error.message : words.states.unknown;
}
