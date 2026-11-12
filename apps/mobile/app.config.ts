import type { ConfigContext, ExpoConfig } from 'expo/config';

/** The beginnings of the shared web addresses that can open the app. One so far: an invitation to a circle. */
const SHARED_PAGES = ['/join/'];

/**
 * The app's configuration: everything in `app.json`, plus the few parts that depend on a build setting.
 * A build setting is an environment variable of the build (EAS → the project's environment variables). No
 * key is kept in the repository, and without a setting its part is simply left out: Expo Go, the browser
 * and a plain local build get exactly what `app.json` says.
 *
 * | Build setting | What it switches on |
 * |---|---|
 * | `EXPO_PUBLIC_LINK_HOST` | Shared links (`https://<host>/join/…`) open the app: the build claims that address. |
 * | `GOOGLE_SERVICES_JSON` | Notifications on Android: the path of the `google-services.json` file (an EAS file variable). |
 * | `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Crash reports with readable stack traces: the build uploads its source maps to Sentry. All three, or nothing. |
 * | `JOT_NATIVE=1` | Jot outside the app: the widgets, the Lock Screen and the list's Live Activity on an iPhone; the widgets, the quick-settings tile and the long press on the icon on Android (native/jot, added by the two plugins in `plugins/`). Written, and not yet run on a phone: see native/jot/README.md before switching it on. |
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const setting = (name: string) => process.env[name]?.trim() || undefined;
  // "go.example.com", also when it was written with https:// in front or a slash behind.
  const linkHost = setting('EXPO_PUBLIC_LINK_HOST')
    ?.replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  const googleServices = setting('GOOGLE_SERVICES_JSON');
  const jotNative = setting('JOT_NATIVE') === '1';
  const sentry = setting('SENTRY_ORG') && setting('SENTRY_PROJECT') && setting('SENTRY_AUTH_TOKEN') ? { organization: setting('SENTRY_ORG'), project: setting('SENTRY_PROJECT') } : null;

  return {
    ...config,
    name: config.name ?? 'Homeport',
    slug: config.slug ?? 'homeport',
    ios: {
      ...config.ios,
      ...(linkHost ? { associatedDomains: [...(config.ios?.associatedDomains ?? []), `applinks:${linkHost}`] } : {}),
    },
    android: {
      ...config.android,
      ...(googleServices ? { googleServicesFile: googleServices } : {}),
      ...(linkHost
        ? {
            intentFilters: [
              ...(config.android?.intentFilters ?? []),
              // Verified with the file the API serves at /.well-known/assetlinks.json, so the phone opens
              // these addresses in the app without asking.
              { action: 'VIEW', autoVerify: true, category: ['BROWSABLE', 'DEFAULT'], data: SHARED_PAGES.map((pathPrefix) => ({ scheme: 'https', host: linkHost, pathPrefix })) },
            ],
          }
        : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      // Uploads the build's source maps and debug files, so a crash report shows the app's own code.
      // The token is read from the build's environment by Sentry's build step; it is never written down here.
      ...(sentry ? ([['@sentry/react-native/expo', sentry]] satisfies ExpoConfig['plugins']) : []),
      // Jot's native parts are added during prebuild, and only for a build that asks for them.
      ...(jotNative ? ['./plugins/withJotIos', './plugins/withJotAndroid'] : []),
    ],
  };
};
