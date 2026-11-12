// NEVER BUILT. A config plugin: it does its work during `expo prebuild` (EAS Build runs that). What has run:
// its pure part (the names, and what the app's own lists get) in a test, and `expo prebuild` once, on 12 Nov
// 2026, on a throwaway copy of the app outside the repository (on Linux): the Xcode project got the extension's
// target with its sources, settings and entitlements, the app depends on it and embeds it, and the project
// file reads back. It was not opened in Xcode and not compiled: Xcode first sees the Swift files on a phone build.
// Needs: the build setting JOT_NATIVE=1 (app.config.ts lists this plugin only then), ios.bundleIdentifier,
// and an Apple team that can sign an App Group.
// Try it: native/jot/README.md, "Making the build".
//
// Jot on an iPhone: the widget extension (three Home Screen widgets, three round ones for the Lock Screen,
// the Live Activity of the list in use). It gives the app and the extension one App Group, copies the Swift
// files from native/jot/ios into the iOS project, and adds the extension's target to the Xcode project.
const fs = require('fs');
const path = require('path');

const { withDangerousMod, withEntitlementsPlist, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const { jotNames } = require('./jotNames');

const FROM = path.join(__dirname, '..', 'native', 'jot', 'ios');
const GROUPS = 'com.apple.security.application-groups';
/** Interactive widgets and their intents need iOS 17. */
const IOS = '17.0';

/** The app's entitlements with the App Group in them, once. Pure. */
function withGroup(entitlements, appGroup) {
  const groups = entitlements[GROUPS] || [];
  return { ...entitlements, [GROUPS]: groups.includes(appGroup) ? groups : [...groups, appGroup] };
}

/** The app's Info.plist: it may show Live Activities, and knows the App Group's name (Shared/JotShared.swift reads it). Pure. */
function withJotInfo(info, appGroup) {
  return { ...info, NSSupportsLiveActivities: true, JotAppGroup: appGroup };
}

/**
 * What EAS Build has to know to sign the extension: its target, its id and its App Group. Pure.
 * @param {object} extra `extra` of the app's configuration
 */
function withExtensionForEas(extra, names) {
  const eas = (extra && extra.eas) || {};
  const build = eas.build || {};
  const experimental = build.experimental || {};
  const ios = experimental.ios || {};
  const extensions = (ios.appExtensions || []).filter((one) => one.targetName !== names.extension);
  const extension = { targetName: names.extension, bundleIdentifier: names.extensionBundleId, entitlements: { [GROUPS]: [names.appGroup] } };
  return { ...extra, eas: { ...eas, build: { ...build, experimental: { ...experimental, ios: { ...ios, appExtensions: [...extensions, extension] } } } } };
}

/** Copies the files of one folder, writing the App Group's name in the place of __APP_GROUP__. Returns their names. */
function copyFiles(from, to, appGroup) {
  fs.mkdirSync(to, { recursive: true });
  const names = fs.readdirSync(from).filter((name) => fs.statSync(path.join(from, name)).isFile());
  for (const name of names) fs.writeFileSync(path.join(to, name), fs.readFileSync(path.join(from, name), 'utf8').replace(/__APP_GROUP__/g, appGroup));
  return names;
}

const swift = (names) => names.filter((name) => name.endsWith('.swift'));

function withJotIos(config) {
  const names = jotNames(config);
  if (!names.bundleId) throw new Error('withJotIos: ios.bundleIdentifier is missing from the app configuration.');
  const { extension, appGroup } = names;

  config = { ...config, extra: withExtensionForEas(config.extra, names) };
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults = withGroup(mod.modResults, appGroup);
    return mod;
  });
  config = withInfoPlist(config, (mod) => {
    mod.modResults = withJotInfo(mod.modResults, appGroup);
    return mod;
  });

  // The files. The four in Shared are part of the app and of the extension, so each gets its own copy:
  // the Xcode project then has no file that belongs to two targets.
  config = withDangerousMod(config, [
    'ios',
    (mod) => {
      const ios = mod.modRequest.platformProjectRoot;
      copyFiles(path.join(FROM, extension), path.join(ios, extension), appGroup);
      copyFiles(path.join(FROM, 'Shared'), path.join(ios, extension), appGroup);
      copyFiles(path.join(FROM, 'Shared'), path.join(ios, mod.modRequest.projectName, 'Jot'), appGroup);
      return mod;
    },
  ]);

  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    // A second prebuild over the same project changes nothing.
    if (project.pbxTargetByName(extension)) return mod;
    const mainGroup = project.getFirstProject().firstProject.mainGroup;
    const appTarget = project.getFirstTarget().uuid;
    const widgetFiles = swift(fs.readdirSync(path.join(FROM, extension)));
    const sharedFiles = swift(fs.readdirSync(path.join(FROM, 'Shared')));

    // The extension: a target of its own, embedded in the app, with its sources. (A project that has never
    // had a second target has no place to write "the app depends on it" yet: the two lists are made first.)
    const objects = project.hash.project.objects;
    objects.PBXTargetDependency = objects.PBXTargetDependency || {};
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};
    const target = project.addTarget(extension, 'app_extension', extension, names.extensionBundleId);
    project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
    const group = project.addPbxGroup([], extension, extension);
    project.addToPbxGroup(group.uuid, mainGroup);
    for (const name of [...widgetFiles, ...sharedFiles]) project.addSourceFile(name, { target: target.uuid }, group.uuid);
    project.addFile('Info.plist', group.uuid);
    project.addFile(`${extension}.entitlements`, group.uuid);

    // The app's own copies of the shared files: the intents that start and stop the Live Activity run in the app.
    // (Named by their folder, "Jot/JotApi.swift": the project keeps one entry per path, and the extension
    // already has a "JotApi.swift".)
    const appFiles = project.addPbxGroup([], 'Jot', mod.modRequest.projectName);
    project.addToPbxGroup(appFiles.uuid, mainGroup);
    for (const name of sharedFiles) project.addSourceFile(`Jot/${name}`, { target: appTarget }, appFiles.uuid);

    // How the extension is built: Swift 5, iOS 17, its own Info.plist and entitlements, the app's version.
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const settings = configurations[key].buildSettings;
      if (!settings || settings.PRODUCT_NAME !== `"${extension}"`) continue;
      Object.assign(settings, {
        SWIFT_VERSION: '5.0',
        IPHONEOS_DEPLOYMENT_TARGET: IOS,
        TARGETED_DEVICE_FAMILY: '"1"',
        INFOPLIST_FILE: `${extension}/Info.plist`,
        CODE_SIGN_ENTITLEMENTS: `${extension}/${extension}.entitlements`,
        CODE_SIGN_STYLE: 'Automatic',
        GENERATE_INFOPLIST_FILE: 'NO',
        SKIP_INSTALL: 'YES',
        MARKETING_VERSION: config.version || '1.0.0',
        CURRENT_PROJECT_VERSION: (config.ios && config.ios.buildNumber) || '1',
        LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
      });
    }
    return mod;
  });
}

module.exports = withJotIos;
module.exports.withGroup = withGroup;
module.exports.withJotInfo = withJotInfo;
module.exports.withExtensionForEas = withExtensionForEas;
