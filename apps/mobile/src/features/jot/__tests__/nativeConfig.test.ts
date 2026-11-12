import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from '../../../../app.json';
import appConfig from '../../../../app.config';
import { jotNames } from '../../../../plugins/jotNames';
import { jotManifest } from '../../../../plugins/withJotAndroid';
import { withExtensionForEas, withGroup, withJotInfo } from '../../../../plugins/withJotIos';
import { appGroup } from '../outside';

/**
 * Jot's native parts are added to a build only when it asks for them. What is tried here is what the two
 * config plugins would hand to `expo prebuild`: the pure part. No prebuild and no native build has run.
 */
const base = appJson.expo as unknown as ExpoConfig;
function built(settings: Record<string, string>): ExpoConfig {
  const before = { ...process.env };
  delete process.env.JOT_NATIVE;
  Object.assign(process.env, settings);
  try {
    return appConfig({ config: base } as ConfigContext);
  } finally {
    process.env = before;
  }
}
const names = jotNames(base);

describe("Jot's native parts in the app's configuration", () => {
  it('are left out of Expo Go, the browser and every build that does not ask for them', () => {
    expect(built({}).plugins).toEqual(base.plugins);
    expect(built({ JOT_NATIVE: '0' }).plugins).toEqual(base.plugins);
    expect(JSON.stringify(built({}))).not.toMatch(/withJot/);
  });

  it('are added, after everything else, by a build with JOT_NATIVE=1', () => {
    expect(built({ JOT_NATIVE: '1' }).plugins?.slice(-2)).toEqual(['./plugins/withJotIos', './plugins/withJotAndroid']);
  });

  it("are named after the app's own ids, the same way in the build and in the app", () => {
    expect(names).toEqual({ extension: 'JotWidgets', bundleId: 'app.homeport.dev', extensionBundleId: 'app.homeport.dev.JotWidgets', appGroup: 'group.app.homeport.dev.jot', androidPackage: 'app.homeport.dev' });
    expect(appGroup(names.bundleId!)).toBe(names.appGroup);
  });
});

describe('what the iPhone build gets', () => {
  it('one App Group for the app and its widgets, added once', () => {
    const once = withGroup({ 'aps-environment': 'development' }, names.appGroup!);
    expect(once).toEqual({ 'aps-environment': 'development', 'com.apple.security.application-groups': ['group.app.homeport.dev.jot'] });
    expect(withGroup(once, names.appGroup!)).toEqual(once);
  });

  it('leave to show Live Activities, and the name of the group for the Swift code to read', () => {
    expect(withJotInfo({ CFBundleName: 'Homeport' }, names.appGroup!)).toEqual({ CFBundleName: 'Homeport', NSSupportsLiveActivities: true, JotAppGroup: 'group.app.homeport.dev.jot' });
  });

  it('the extension declared for EAS, so it is signed with its own id and the same group', () => {
    const extra = withExtensionForEas({ eas: { projectId: 'p-1' } }, names) as { eas: { projectId: string; build: { experimental: { ios: { appExtensions: unknown[] } } } } };
    expect(extra.eas.projectId).toBe('p-1');
    expect(extra.eas.build.experimental.ios.appExtensions).toEqual([{ targetName: 'JotWidgets', bundleIdentifier: 'app.homeport.dev.JotWidgets', entitlements: { 'com.apple.security.application-groups': ['group.app.homeport.dev.jot'] } }]);
    expect((withExtensionForEas(extra, names) as typeof extra).eas.build.experimental.ios.appExtensions).toHaveLength(1);
  });
});

describe('what the Android build gets', () => {
  const manifest = { application: [{ $: { 'android:name': '.MainApplication' }, activity: [{ $: { 'android:name': '.MainActivity' } }] }] };

  it('the three widgets, the receiver for their buttons, the two services and the long press on the icon', () => {
    const made = jotManifest(manifest) as { 'uses-permission': { $: Record<string, string> }[]; application: { receiver: { $: Record<string, string> }[]; service: { $: Record<string, string> }[]; activity: { 'meta-data': { $: Record<string, string> }[] }[] }[] };
    const [application] = made.application;
    expect(application!.receiver.map((one) => one.$['android:name'])).toEqual(['.jot.JotWidget', '.jot.JotListWidget', '.jot.JotTodayWidget', '.jot.JotActionReceiver']);
    // Only the app's own widgets may tell it to add or tick.
    expect(application!.receiver[3]!.$['android:exported']).toBe('false');
    expect(application!.service.map((one) => one.$['android:name'])).toEqual(['.jot.JotActionService', '.jot.JotTileService']);
    expect(application!.service[1]!.$['android:permission']).toBe('android.permission.BIND_QUICK_SETTINGS_TILE');
    expect(application!.activity[0]!['meta-data']).toEqual([{ $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/jot_shortcuts' } }]);
    expect(made['uses-permission']).toEqual([{ $: { 'android:name': 'android.permission.WAKE_LOCK' } }]);
  });

  it('changes nothing when it runs a second time, and leaves what it was given as it was', () => {
    const once = jotManifest(manifest);
    expect(jotManifest(once)).toEqual(once);
    expect(manifest.application[0]).toEqual({ $: { 'android:name': '.MainApplication' }, activity: [{ $: { 'android:name': '.MainActivity' } }] });
  });
});
