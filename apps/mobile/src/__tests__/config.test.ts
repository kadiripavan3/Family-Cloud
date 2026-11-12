import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from '../../app.json';
import appConfig from '../../app.config';

const SETTINGS = ['EXPO_PUBLIC_LINK_HOST', 'GOOGLE_SERVICES_JSON', 'SENTRY_ORG', 'SENTRY_PROJECT', 'SENTRY_AUTH_TOKEN'];
const base = appJson.expo as unknown as ExpoConfig;

/** The app's configuration as a build with these settings gets it. */
function built(settings: Record<string, string>): ExpoConfig {
  const before = { ...process.env };
  for (const name of SETTINGS) delete process.env[name];
  Object.assign(process.env, settings);
  try {
    return appConfig({ config: base } as ConfigContext);
  } finally {
    process.env = before;
  }
}
const pluginNames = (config: ExpoConfig) => (config.plugins ?? []).map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));

describe("the app's configuration", () => {
  it('is exactly app.json without build settings: nothing changes for Expo Go, the browser or a plain build', () => {
    const config = built({});
    expect(config).toEqual(base);
    expect(pluginNames(config)).not.toContain('@sentry/react-native/expo');
    expect(config.ios?.associatedDomains).toBeUndefined();
    expect(config.android?.intentFilters).toBeUndefined();
    expect(config.android?.googleServicesFile).toBeUndefined();
    // No key of any kind is kept in the repository.
    expect(JSON.stringify(appJson)).not.toMatch(/apiKey|AIza|sntrys_|phc_/);
    // The app only uses the phone's own encryption (https), which the App Store asks about with every upload.
    expect(config.ios?.config?.usesNonExemptEncryption).toBe(false);
  });

  it('is Homeport everywhere a phone or a store reads its name', () => {
    expect(base).toMatchObject({ name: 'Homeport', slug: 'homeport', scheme: 'homeport', ios: { bundleIdentifier: 'app.homeport.dev' }, android: { package: 'app.homeport.dev' } });
    expect(JSON.stringify(appJson)).not.toMatch(/journey/i);
  });

  it('asks the phone for nothing the app does not use: photos to pick from, and no camera, microphone or location', () => {
    const picker = (base.plugins ?? []).find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker') as [string, Record<string, unknown>];
    expect(picker[1]).toMatchObject({ cameraPermission: false, microphonePermission: false });
    expect(pluginNames(base)).not.toContain('expo-location');
  });

  it('claims the address shared links come from, so they open the app: an invitation to a circle and nothing else', () => {
    const config = built({ EXPO_PUBLIC_LINK_HOST: 'https://Go.Example.com/' });
    expect(config.ios?.associatedDomains).toEqual(['applinks:go.example.com']);
    expect(config.android?.intentFilters).toEqual([
      {
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: [{ scheme: 'https', host: 'go.example.com', pathPrefix: '/join/' }],
      },
    ]);
  });

  it("takes Android's notifications file from the build", () => {
    const config = built({ GOOGLE_SERVICES_JSON: '/eas/secrets/google-services.json' });
    expect(config.android?.googleServicesFile).toBe('/eas/secrets/google-services.json');
    expect(config.android?.package).toBe(base.android?.package); // the rest of app.json stays
  });

  it('adds the upload of source maps to Sentry only when all three of its settings are there, and never writes the token down', () => {
    expect(pluginNames(built({ SENTRY_ORG: 'homeport', SENTRY_PROJECT: 'app' }))).not.toContain('@sentry/react-native/expo');
    const config = built({ SENTRY_ORG: 'homeport', SENTRY_PROJECT: 'app', SENTRY_AUTH_TOKEN: 'sntrys_secret' });
    expect(config.plugins?.at(-1)).toEqual(['@sentry/react-native/expo', { organization: 'homeport', project: 'app' }]);
    expect(JSON.stringify(config)).not.toContain('sntrys_secret');
  });
});
