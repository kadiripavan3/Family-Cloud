/**
 * Crash reports, tried in a build with a key and in one without. Sentry itself is a stand-in here; what is
 * checked is whether it is loaded at all, and what it is told to leave out.
 */
describe('crash reports, switched on only by a key', () => {
  const env = process.env;

  function build(dsn: string | undefined, os: 'ios' | 'web' = 'ios') {
    jest.resetModules();
    process.env = { ...env };
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    if (dsn) process.env.EXPO_PUBLIC_SENTRY_DSN = dsn;

    const sentry = { init: jest.fn(), captureException: jest.fn(), setUser: jest.fn() };
    const loaded = jest.fn(() => sentry);
    jest.doMock('@sentry/react-native', loaded);

    const { Platform } = jest.requireActual<typeof import('react-native')>('react-native');
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
    const crashes = jest.requireActual<typeof import('../crashes')>('../crashes');
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    return { crashes, sentry, loaded, settle };
  }

  afterAll(() => {
    process.env = env;
  });

  it('does nothing and loads nothing without a key: a developer’s computer, Expo Go, tests', async () => {
    const { crashes, loaded, settle } = build(undefined);
    crashes.startCrashReports();
    crashes.reportCrash(new Error('boom'));
    await settle();
    expect(crashes.crashReportsOn()).toBe(false);
    expect(loaded).not.toHaveBeenCalled();
  });

  it('never reports from the browser, key or not', async () => {
    const { crashes, loaded, settle } = build('https://key@example.ingest.sentry.io/1', 'web');
    crashes.reportCrash(new Error('boom'));
    await settle();
    expect(loaded).not.toHaveBeenCalled();
  });

  it('with a key, reports crashes that are not tied to anyone: no person, no log lines, no trail of screens, no timing', async () => {
    const { crashes, sentry, settle } = build('https://key@example.ingest.sentry.io/1');
    const boom = new Error('boom');
    crashes.reportCrash(boom);
    await settle();
    expect(sentry.captureException).toHaveBeenCalledWith(boom);
    expect(sentry.setUser).not.toHaveBeenCalled();

    const options = sentry.init.mock.calls[0][0];
    expect(options).toEqual(expect.objectContaining({ dsn: 'https://key@example.ingest.sentry.io/1', sendDefaultPii: false }));
    // Giving a rate for timing, even 0, makes the library install the parts that time screens and follow the router.
    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(options).not.toHaveProperty('tracesSampler');
    expect(options).not.toHaveProperty('profilesSampleRate');
    expect(options).not.toHaveProperty('replaysSessionSampleRate');
    expect(options.beforeSend({ message: 'boom', user: { id: 'account-1', ip_address: '{{auto}}' } })).toEqual({ message: 'boom' });
    expect(options.beforeBreadcrumb({ category: 'console', message: 'Nora typed something' })).toBeNull();
    expect(options.beforeBreadcrumb({ category: 'navigation', data: { to: '/settings/delete-account' } })).toBeNull();
    expect(options.beforeBreadcrumb({ category: 'fetch', data: { method: 'GET', status_code: 500, url: 'http://localhost:8080/v1/search?q=my+secret' } }).data).toEqual({
      method: 'GET',
      status_code: 500,
      url: '/v1/search',
    });
    expect(crashes.withoutDetails('https://api.example.com/v1/circles/8f2c/people?cursor=abc')).toBe('/v1/circles/…');
    expect(crashes.withoutDetails('/v1/me')).toBe('/v1/me');
    expect(crashes.withoutDetails(undefined)).toBe('');
  });

  it('keeps the app going when the library itself fails to load', async () => {
    const { crashes, loaded, settle } = build('https://key@example.ingest.sentry.io/1');
    loaded.mockImplementationOnce(() => {
      throw new Error('native module missing');
    });
    expect(() => crashes.reportCrash(new Error('boom'))).not.toThrow();
    await settle();
  });
});
