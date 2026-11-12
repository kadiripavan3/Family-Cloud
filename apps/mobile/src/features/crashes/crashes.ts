import { Platform } from 'react-native';

/**
 * Crash reports, with Sentry. They are switched on by a key (EXPO_PUBLIC_SENTRY_DSN) that only real builds
 * have; without it nothing is loaded, which is how the app runs on a developer's computer, in Expo Go and in
 * tests. A report says what broke and where in the code, on which kind of phone. It is not tied to a person:
 * no account id, no names, no addresses of the pages they looked at, no log lines. And it is only crashes:
 * nothing times screens or requests.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

type Reporter = {
  captureException: (error: unknown) => unknown;
};

let reporter: Promise<Reporter | null> | null = null;

export function crashReportsOn(): boolean {
  return Boolean(DSN) && Platform.OS !== 'web';
}

/** An API address without the parts that say who or what: "/v1/circles/8f2c/people?cursor=abc" becomes "/v1/circles/…". */
export function withoutDetails(url: unknown): string {
  if (typeof url !== 'string') return '';
  const path = url.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/)[0] ?? '';
  const [version, resource, ...rest] = path.split('/').filter(Boolean);
  if (!version) return '/';
  return `/${[version, resource].filter(Boolean).join('/')}${rest.length > 0 ? '/…' : ''}`;
}

function load(): Promise<Reporter | null> {
  if (!DSN || !crashReportsOn()) return Promise.resolve(null);
  reporter ??= Promise.resolve()
    .then((): Reporter => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- on purpose: loaded here and nowhere else, only with a key
      const Sentry = require('@sentry/react-native') as typeof import('@sentry/react-native');
      Sentry.init({
        dsn: DSN,
        sendDefaultPii: false,
        // Only crashes and errors. There is no `tracesSampleRate` here on purpose: giving one, even 0, makes
        // the library install the parts that time screens, taps and requests and follow the router.
        beforeBreadcrumb: (crumb) => {
          // Log lines can hold anything a person typed, and the trail of screens says whose pages they
          // looked at. Both stay on the phone.
          if (crumb.category === 'console' || crumb.category === 'navigation') return null;
          if ((crumb.category === 'xhr' || crumb.category === 'fetch') && crumb.data) {
            crumb.data = { method: crumb.data.method, status_code: crumb.data.status_code, url: withoutDetails(crumb.data.url) };
          }
          return crumb;
        },
        // Whatever part of the library may have put a person on the report: taken off before it leaves.
        beforeSend: (event) => {
          delete event.user;
          return event;
        },
      });
      return Sentry;
    })
    .catch(() => null); // reporting a crash must never cause one
  return reporter;
}

/** Starts watching for crashes, if this build reports them at all. Called once, from the root layout. */
export function startCrashReports(): void {
  void load();
}

/** Something broke that the app caught and showed a friendly page for. */
export function reportCrash(error: unknown): void {
  void load().then((sentry) => sentry?.captureException(error));
}
