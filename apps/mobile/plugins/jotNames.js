// What Jot's native parts are called, worked out from the app's own ids so nothing is written twice.
// Used by the two config plugins beside this file. (The app's JavaScript works out the same App Group name:
// src/features/jot/outside.ts.)

/** The widget extension's target, and the folder its files are copied into. */
const EXTENSION = 'JotWidgets';

/**
 * @param {{ ios?: { bundleIdentifier?: string }, android?: { package?: string } }} config the app's configuration
 * @returns {{ extension: string, bundleId: string | undefined, extensionBundleId: string | undefined, appGroup: string | undefined, androidPackage: string | undefined }}
 */
function jotNames(config) {
  const bundleId = config.ios && config.ios.bundleIdentifier;
  return {
    extension: EXTENSION,
    bundleId,
    extensionBundleId: bundleId ? `${bundleId}.${EXTENSION}` : undefined,
    appGroup: bundleId ? `group.${bundleId}.jot` : undefined,
    androidPackage: config.android && config.android.package,
  };
}

module.exports = { jotNames, EXTENSION };
