import { ApiError, apiFetch, connectSession, isUnreachable, lastAnswerAt, messageFor, onAnswer, TIME_LIMIT_MS } from '@/api/fetcher';

const respond = (status: number, body?: unknown) =>
  Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));

describe('apiFetch', () => {
  const fetchMock = jest.fn();
  let signedOut = 0;

  beforeEach(() => {
    fetchMock.mockReset();
    signedOut = 0;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
    connectSession({ getToken: () => 'token-1', onSignedOut: () => (signedOut += 1) });
  });

  it('adds the address and the sign-in token', async () => {
    fetchMock.mockReturnValue(respond(200, { ok: true }));

    await expect(apiFetch('/v1/me')).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/v1/me');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-1');
  });

  it('returns lists as lists', async () => {
    fetchMock.mockReturnValue(respond(200, [{ id: 'a' }, { id: 'b' }]));
    await expect(apiFetch('/v1/me/circles')).resolves.toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('returns nothing for an empty answer', async () => {
    fetchMock.mockReturnValue(respond(204));
    await expect(apiFetch('/local-auth/code', { method: 'POST' })).resolves.toBeUndefined();
  });

  it("passes on the API's own words and field messages", async () => {
    fetchMock.mockReturnValue(respond(400, { code: 'invalid_input', detail: 'Some details need another look.', fields: { displayName: 'Add your name.' } }));

    const error = await apiFetch('/v1/me/profile').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('invalid_input');
    expect((error as ApiError).fields.displayName).toBe('Add your name.');
    expect(messageFor(error)).toBe('Some details need another look.');
  });

  it('signs the person out when their token stops working', async () => {
    fetchMock.mockReturnValue(respond(401));
    await expect(apiFetch('/v1/me')).rejects.toMatchObject({ status: 401 });
    expect(signedOut).toBe(1);
  });

  it('says so plainly when the API cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(apiFetch('/v1/me')).rejects.toMatchObject({ code: 'unreachable', message: "Can't reach Homeport right now. Check your connection and try again." });
  });

  /** A request that never answers, and stops the way a real one does when its signal says so. */
  const hangs = (_url: string, init: RequestInit) =>
    new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));

  it('gives up on a request that takes too long, and says so', async () => {
    jest.useFakeTimers();
    try {
      fetchMock.mockImplementation(hangs);
      const failed = apiFetch('/v1/feed').catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(TIME_LIMIT_MS);
      const error = await failed;
      expect(error).toMatchObject({ status: 0, code: 'unreachable', message: expect.stringContaining('taking too long') });
      expect(isUnreachable(error)).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops when the screen that asked has closed, without calling it a failure', async () => {
    fetchMock.mockImplementation(hangs);
    const screen = new AbortController();
    const asked = apiFetch('/v1/feed', { signal: screen.signal }).catch((e: unknown) => e);
    screen.abort();
    expect(await asked).not.toBeInstanceOf(ApiError);
  });

  it('tells whoever listens about every yes, and never about a no', async () => {
    const heard: string[] = [];
    const stop = onAnswer((method, path, answer) => heard.push(`${method} ${path} ${JSON.stringify(answer)}`));
    const broken = onAnswer(() => {
      throw new Error('a listener that breaks');
    });
    try {
      const before = Date.now();
      fetchMock.mockReturnValueOnce(respond(200, { id: 'c1' })).mockReturnValueOnce(respond(400, { code: 'invalid_input' }));
      await expect(apiFetch('/v1/circles', { method: 'POST' })).resolves.toEqual({ id: 'c1' });
      await apiFetch('/v1/circles', { method: 'POST' }).catch(() => undefined);
      expect(heard).toEqual(['POST /v1/circles {"id":"c1"}']);
      expect(lastAnswerAt()).toBeGreaterThanOrEqual(before);
    } finally {
      stop();
      broken();
    }
  });
});
