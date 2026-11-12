import { ApiError, apiFetch, connectSession } from '@/api/fetcher';

type Listener = (event: string, session: { access_token: string } | null) => void;

const mockAuth = {
  signInWithOtp: jest.fn(),
  verifyOtp: jest.fn(),
  signInWithIdToken: jest.fn(),
  getSession: jest.fn(),
  updateUser: jest.fn(),
  refreshSession: jest.fn(),
  signOut: jest.fn(),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
  listener: null as Listener | null,
  onAuthStateChange: jest.fn((listener: Listener) => {
    mockAuth.listener = listener;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  }),
};
const mockMade: unknown[] = [];

jest.mock('@supabase/auth-js', () => ({
  AuthClient: jest.fn((options: unknown) => {
    mockMade.push(options);
    return mockAuth;
  }),
  // Supabase's own name for "nothing answered": no connection, or its servers are away.
  isAuthRetryableFetchError: (error: { name?: string } | null) => error?.name === 'AuthRetryableFetchError',
}));

const mockKept = new Map<string, string>();
jest.mock('@/lib/keep', () => ({
  keep: {
    get: (key: string) => Promise.resolve(mockKept.get(key) ?? null),
    set: (key: string, value: string) => Promise.resolve(void mockKept.set(key, value)),
    remove: (key: string) => Promise.resolve(void mockKept.delete(key)),
  },
}));

const mockNetwork = { isConnected: true };
jest.mock('expo-network', () => ({ getNetworkStateAsync: () => Promise.resolve(mockNetwork) }));

const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: (key: string) => Promise.resolve(mockSecure.get(key) ?? null),
  setItemAsync: (key: string, value: string) => Promise.resolve(void mockSecure.set(key, value)),
  deleteItemAsync: (key: string) => Promise.resolve(void mockSecure.delete(key)),
}));

const mockApple = { signInAsync: jest.fn(), AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 } };
jest.mock('expo-apple-authentication', () => mockApple);
jest.mock('expo-crypto', () => ({ randomUUID: () => 'a-random-value', digestStringAsync: async () => 'its-fingerprint', CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));

const notAsked = { name: 'AuthRetryableFetchError', status: 0, message: 'Network request failed' };
const refused = { name: 'AuthApiError', status: 400, message: 'Invalid Refresh Token' };

describe('real sign-in (Supabase)', () => {
  const load = () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project.supabase.example/';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('../signIn.supabase') as typeof import('../signIn.supabase')).supabaseSignIn();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockMade.length = 0;
    mockSecure.clear();
    mockKept.clear();
    mockNetwork.isConnected = true;
  });

  it('asks Supabase for a code and signs in with it; the session hears the token', async () => {
    const service = load();
    const heard: (string | null)[] = [];
    service.onToken((token) => heard.push(token));

    mockAuth.signInWithOtp.mockResolvedValue({ error: null });
    await service.requestCode('nora@example.com');
    expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({ email: 'nora@example.com', options: { shouldCreateUser: true } });
    expect(mockMade[0]).toMatchObject({ url: 'https://project.supabase.example/auth/v1', headers: { apikey: 'anon-key' }, detectSessionInUrl: false });

    mockAuth.verifyOtp.mockResolvedValue({ data: { session: { access_token: 'token-1' } }, error: null });
    await service.verifyCode('nora@example.com', '123456');
    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({ email: 'nora@example.com', token: '123456', type: 'email' });

    // Supabase tells every listener: at sign-in, each time it renews the token, and when the sign-in ends.
    mockAuth.listener?.('SIGNED_IN', { access_token: 'token-1' });
    mockAuth.listener?.('TOKEN_REFRESHED', { access_token: 'token-2' });
    mockAuth.listener?.('SIGNED_OUT', null);
    expect(heard).toEqual(['token-1', 'token-2', null]);
  });

  it('says a wrong code and a rush of requests in plain words', async () => {
    const service = load();
    mockAuth.verifyOtp.mockResolvedValue({ data: { session: null }, error: { status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' } });
    await expect(service.verifyCode('nora@example.com', '000000')).rejects.toMatchObject({ code: 'wrong_code', message: expect.stringContaining("isn't right") });
    mockAuth.signInWithOtp.mockResolvedValue({ error: { status: 429, code: 'over_email_send_rate_limit', message: 'rate limit' } });
    await expect(service.requestCode('nora@example.com')).rejects.toMatchObject({ code: 'slow_down' });
  });

  it('brings back last time\'s sign-in, renews it when asked, and offers Apple only on an iPhone', async () => {
    const service = load();
    mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: 'saved' } } });
    await expect(service.restore()).resolves.toBe('saved');
    mockAuth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'fresh' } }, error: null });
    await expect(service.renew()).resolves.toBe('fresh');
    mockAuth.refreshSession.mockResolvedValue({ data: { session: null }, error: { status: 400, message: 'refresh token revoked' } });
    await expect(service.renew()).resolves.toBeNull();
    expect(service.google).toBeNull(); // no client id in this build
  });

  it('opens the app without a connection for someone whose token has run out, and without asking for one that is still good', async () => {
    const service = load();
    const anHourAgo = Math.floor(Date.now() / 1000) - 3600;
    mockSecure.set('homeport.supabase', JSON.stringify({ access_token: 'run-out', refresh_token: 'r', expires_at: anHourAgo }));
    mockNetwork.isConnected = false;
    mockAuth.getSession.mockReturnValue(new Promise(() => {})); // Supabase keeps trying for half a minute
    await expect(service.restore()).resolves.toBe('run-out');

    // With a connection the fresh token is waited for; when Supabase couldn't be asked after all, the old one stands.
    mockNetwork.isConnected = true;
    mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: 'fresh' } }, error: null });
    await expect(service.restore()).resolves.toBe('fresh');
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: notAsked });
    await expect(service.restore()).resolves.toBe('run-out');
    // A real no (Supabase has removed the session by then): signed out.
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: refused });
    await expect(service.restore()).resolves.toBeNull();

    // Still good for a while: used as it is, and nobody is asked.
    mockAuth.getSession.mockClear();
    mockSecure.set('homeport.supabase', JSON.stringify({ access_token: 'good', refresh_token: 'r', expires_at: anHourAgo + 7200 }));
    await expect(service.restore()).resolves.toBe('good');
    expect(mockAuth.getSession).not.toHaveBeenCalled();
  });

  it('does not wait long at start-up for a renewal on a slow connection', async () => {
    const service = load();
    mockSecure.set('homeport.supabase', JSON.stringify({ access_token: 'run-out', refresh_token: 'r', expires_at: 1 }));
    mockAuth.getSession.mockReturnValue(new Promise(() => {}));
    jest.useFakeTimers();
    try {
      const restored = service.restore();
      await jest.advanceTimersByTimeAsync(4000);
      await expect(restored).resolves.toBe('run-out');
    } finally {
      jest.useRealTimers();
    }
  });

  it('tells a renewal that was refused from one that could not be asked for', async () => {
    const service = load();
    mockAuth.refreshSession.mockResolvedValue({ data: { session: null }, error: notAsked });
    await expect(service.renew()).rejects.toMatchObject({ code: 'unreachable' });
    mockAuth.refreshSession.mockResolvedValue({ data: { session: null }, error: refused });
    await expect(service.renew()).resolves.toBeNull();
  });

  it('gives every request to Supabase a time limit, and passes "slow down" while renewing on as "try later"', async () => {
    const service = load();
    mockAuth.signInWithOtp.mockResolvedValue({ error: null });
    await service.requestCode('nora@example.com'); // makes the client
    const { fetch: limited } = mockMade[0] as { fetch: typeof fetch };
    const real = jest.fn();
    globalThis.fetch = real as unknown as typeof fetch;

    real.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await limited('https://project.supabase.example/auth/v1/token?grant_type=refresh_token', { method: 'POST' })).status).toBe(503);
    expect((await limited('https://project.supabase.example/auth/v1/otp', { method: 'POST' })).status).toBe(429);

    jest.useFakeTimers();
    try {
      real.mockImplementation((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('stopped')))));
      const asked = limited('https://project.supabase.example/auth/v1/otp', { method: 'POST' }).catch((error: Error) => error.message);
      await jest.advanceTimersByTimeAsync(15_000);
      await expect(asked).resolves.toBe('stopped');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps what Apple hands over only once: the name is offered at once and kept with the sign-in, and the API gets the code', async () => {
    const service = load();
    const sent = jest.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response(null, { status: 204 })));
    globalThis.fetch = sent as unknown as typeof fetch;
    process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
    connectSession({ getToken: () => 'apple-token', onSignedOut: () => {} });
    mockApple.signInAsync.mockResolvedValue({ identityToken: 'apple-id-token', authorizationCode: 'code-from-apple', fullName: { givenName: 'Nora', familyName: 'Lind' } });
    mockAuth.signInWithIdToken.mockResolvedValue({ data: { session: { access_token: 'apple-token' } }, error: null });
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });

    await service.apple?.();

    // Apple got the fingerprint of the random value, Supabase the value itself.
    expect(mockApple.signInAsync).toHaveBeenCalledWith(expect.objectContaining({ nonce: 'its-fingerprint' }));
    expect(mockAuth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'apple-id-token', nonce: 'a-random-value' });
    await expect(service.suggestedName()).resolves.toBe('Nora Lind');
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ data: { full_name: 'Nora Lind' } });
    await expect(service.signedInWith()).resolves.toBe('apple');
    // With the code the API can end the link at Apple when the account is deleted.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const [url, init] = sent.mock.calls[0]!;
    expect(url).toBe('http://api.test/v1/me/apple-sign-in');
    expect(init).toMatchObject({ method: 'PUT', body: JSON.stringify({ authorizationCode: 'code-from-apple' }) });

    // The next time Apple gives no name: what was kept is not wiped.
    mockAuth.updateUser.mockClear();
    mockApple.signInAsync.mockResolvedValue({ identityToken: 'apple-id-token', authorizationCode: null, fullName: null });
    await service.apple?.();
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });

  it('says which way the person signed in, and offers the name the sign-in already knows', async () => {
    const service = load();
    mockAuth.verifyOtp.mockResolvedValue({ data: { session: { access_token: 'token-1' } }, error: null });
    await service.verifyCode('nora@example.com', '123456');
    await expect(service.signedInWith()).resolves.toBe('email');

    // Not remembered on this phone (installed again): what the sign-in itself was made with.
    mockKept.clear();
    mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: 't', user: { app_metadata: { provider: 'apple' }, user_metadata: { full_name: ' Nora Lind ' } } } }, error: null });
    await expect(service.signedInWith()).resolves.toBe('apple');
    // Apple's name was kept with the sign-in the one time Apple gave it; Google's is there each time.
    await expect(service.suggestedName()).resolves.toBe('Nora Lind');
    mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: 't', user: { app_metadata: { provider: 'email' }, user_metadata: {} } } }, error: null });
    await expect(service.suggestedName()).resolves.toBeNull();

    // Signing out forgets the way.
    mockAuth.signOut.mockResolvedValue({ error: null });
    await service.verifyCode('nora@example.com', '123456');
    await service.signOut();
    expect(mockKept.size).toBe(0);
  });

  it('does nothing, and breaks nothing, in a build without the project settings', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const service = (require('../signIn.supabase') as typeof import('../signIn.supabase')).supabaseSignIn();
    await expect(service.restore()).resolves.toBeNull();
    await expect(service.requestCode('nora@example.com')).rejects.toMatchObject({ code: 'not_connected' });
    expect(mockMade).toHaveLength(0);
  });
});

describe('a token that ran out', () => {
  const fetchMock = jest.fn();
  const respond = (status: number, body?: unknown) => Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  });

  it('is renewed once and the request sent again, without the person noticing', async () => {
    let signedOut = 0;
    connectSession({ getToken: () => 'old', renew: () => Promise.resolve('new'), onSignedOut: () => (signedOut += 1) });
    fetchMock.mockReturnValueOnce(respond(401, { code: 'signed_out', detail: 'Please sign in again.' })).mockReturnValueOnce(respond(200, { ok: true }));

    await expect(apiFetch('/v1/me')).resolves.toEqual({ ok: true });

    const sent = fetchMock.mock.calls.map(([, init]) => new Headers((init as RequestInit).headers).get('Authorization'));
    expect(sent).toEqual(['Bearer old', 'Bearer new']);
    expect(signedOut).toBe(0);
  });

  it('signs the person out when it cannot be renewed', async () => {
    let signedOut = 0;
    connectSession({ getToken: () => 'old', renew: () => Promise.resolve(null), onSignedOut: () => (signedOut += 1) });
    fetchMock.mockReturnValue(respond(401, { code: 'signed_out', detail: 'Please sign in again.' }));

    await expect(apiFetch('/v1/me')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(signedOut).toBe(1);
  });

  it('keeps the person signed in when the renewal could not be asked for: a weak connection is not a no', async () => {
    let signedOut = 0;
    connectSession({ getToken: () => 'old', renew: () => Promise.reject(new ApiError(0, 'unreachable', 'No connection')), onSignedOut: () => (signedOut += 1) });
    fetchMock.mockReturnValue(respond(401, { code: 'signed_out', detail: 'Please sign in again.' }));

    await expect(apiFetch('/v1/me')).rejects.toMatchObject({ status: 0, code: 'unreachable' });
    expect(signedOut).toBe(0);
  });

  it('is renewed once for all the requests that were refused together', async () => {
    let token = 'old';
    let renewals = 0;
    let finish: (fresh: string) => void = () => {};
    connectSession({
      getToken: () => token,
      renew: () => {
        renewals += 1;
        return new Promise<string>((resolve) => {
          finish = (fresh) => {
            token = fresh;
            resolve(fresh);
          };
        });
      },
      onSignedOut: () => {},
    });
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Headers(init.headers).get('Authorization') === 'Bearer new' ? respond(200, { ok: true }) : respond(401, { code: 'signed_out', detail: 'Please sign in again.' }),
    );

    const all = Promise.all([apiFetch('/v1/me'), apiFetch('/v1/circles'), apiFetch('/v1/activity')]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    finish('new');
    await expect(all).resolves.toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(renewals).toBe(1);

    // One that was sent with the old token just before the renewal, and refused after it: it takes the new
    // token; there is no second renewal.
    token = 'old';
    const late = apiFetch('/v1/digest');
    token = 'new';
    await expect(late).resolves.toEqual({ ok: true });
    expect(renewals).toBe(1);
  });
});
