// NEVER BUILT. A config plugin: it does its work during `expo prebuild` (EAS Build runs that). What has run:
// its pure part (what the manifest gets) in a test, and `expo prebuild` once, on 12 Nov 2026, on a throwaway
// copy of the app outside the repository: the files were copied and the manifest got its entries. The Android
// project it made was looked at and not compiled: Gradle first sees the Kotlin files on a phone build.
// Needs: the build setting JOT_NATIVE=1 (app.config.ts lists this plugin only then), and android.package.
// Try it: native/jot/README.md, "Making the build".
//
// Jot on Android: the three widgets, the quick-settings tile and the long press on the icon. It copies the
// Kotlin files and the resources from native/jot/android into the Android project (writing the app's package
// in the place of __PACKAGE__), and names them in the manifest.
const fs = require('fs');
const path = require('path');

const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const { jotNames } = require('./jotNames');

const FROM = path.join(__dirname, '..', 'native', 'jot', 'android');
const WIDGETS = [
  { name: 'JotWidget', info: 'jot_widget_info', label: '@string/jot_name' },
  { name: 'JotListWidget', info: 'jot_list_widget_info', label: '@string/jot_list_name' },
  { name: 'JotTodayWidget', info: 'jot_today_widget_info', label: '@string/jot_today' },
];

/** Adds an entry to a list of the manifest once: a second prebuild changes nothing. */
function addOnce(list, entry) {
  return list.some((one) => one.$ && one.$['android:name'] === entry.$['android:name']) ? list : [...list, entry];
}

/**
 * The manifest with Jot's parts in it. Pure: it returns a changed copy of the `manifest` part it is given.
 * @param {object} manifest the parsed AndroidManifest.xml (`config.modResults.manifest`)
 */
function jotManifest(manifest) {
  const application = { ...manifest.application[0] };

  // The widgets: each a receiver the launcher asks to draw itself.
  application.receiver = WIDGETS.reduce(
    (receivers, widget) =>
      addOnce(receivers, {
        $: { 'android:name': `.jot.${widget.name}`, 'android:exported': 'true', 'android:label': widget.label },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] }],
        'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': `@xml/${widget.info}` } }],
      }),
    application.receiver || [],
  );
  // A chip or a circle was pressed: only the app's own widgets may say so.
  application.receiver = addOnce(application.receiver, { $: { 'android:name': '.jot.JotActionReceiver', 'android:exported': 'false' } });

  // The app's code, started unseen for one press; and the quick-settings tile, which only the phone may bind.
  application.service = addOnce(application.service || [], { $: { 'android:name': '.jot.JotActionService', 'android:exported': 'false' } });
  application.service = addOnce(application.service, {
    $: { 'android:name': '.jot.JotTileService', 'android:exported': 'true', 'android:label': '@string/jot_name', 'android:icon': '@drawable/ic_jot_tile', 'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE' },
    'intent-filter': [{ action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }] }],
  });

  // A long press on the icon offers "Jot".
  application.activity = (application.activity || []).map((activity) =>
    activity.$ && activity.$['android:name'] === '.MainActivity' ? { ...activity, 'meta-data': addOnce(activity['meta-data'] || [], { $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/jot_shortcuts' } }) } : activity,
  );

  // Running the app's code unseen keeps the phone awake for those few seconds.
  const permissions = addOnce(manifest['uses-permission'] || [], { $: { 'android:name': 'android.permission.WAKE_LOCK' } });
  return { ...manifest, 'uses-permission': permissions, application: [application, ...manifest.application.slice(1)] };
}

/** Copies every file under `from` to `to`, writing the app's package in the place of __PACKAGE__. */
function copyAll(from, to, pkg) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const [source, target] = [path.join(from, entry.name), path.join(to, entry.name)];
    if (entry.isDirectory()) copyAll(source, target, pkg);
    else fs.writeFileSync(target, fs.readFileSync(source, 'utf8').replace(/__PACKAGE__/g, pkg));
  }
}

function withJotAndroid(config) {
  const pkg = jotNames(config).androidPackage;
  if (!pkg) throw new Error('withJotAndroid: android.package is missing from the app configuration.');
  config = withAndroidManifest(config, (mod) => {
    mod.modResults.manifest = jotManifest(mod.modResults.manifest);
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    (mod) => {
      const main = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main');
      copyAll(path.join(FROM, 'java'), path.join(main, 'java', ...pkg.split('.'), 'jot'), pkg);
      copyAll(path.join(FROM, 'res'), path.join(main, 'res'), pkg);
      return mod;
    },
  ]);
}

module.exports = withJotAndroid;
module.exports.jotManifest = jotManifest;
