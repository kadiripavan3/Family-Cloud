// How the app's code is bundled. This is Expo's own set-up, unchanged, for Expo Go, the browser and any
// build without crash reporting.
//
// A build that reports crashes to Sentry (the three build settings SENTRY_ORG, SENTRY_PROJECT and
// SENTRY_AUTH_TOKEN, see app.config.ts) uses Sentry's version of the same set-up instead: it gives every
// bundle an id of its own, which is how a crash report finds the source map that was uploaded for it and
// shows a readable stack trace.
const { getDefaultConfig } = require('expo/metro-config');

const reportsCrashes = Boolean(process.env.SENTRY_ORG && process.env.SENTRY_PROJECT && process.env.SENTRY_AUTH_TOKEN);

module.exports = reportsCrashes ? require('@sentry/react-native/metro').getSentryExpoConfig(__dirname) : getDefaultConfig(__dirname);
