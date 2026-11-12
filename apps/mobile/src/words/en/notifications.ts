/** Asking to send notifications, and what this phone does with them. (What each notification says comes from the API.) */
import { APP } from './names';

export const notifications = {
  // The question, asked once per install, at a moment when there is something worth hearing about
  ask: {
    title: 'Know when something needs you',
    body: 'A turn, a batch of photos, a bill that is due. Few, and each one useful. Turn off any type whenever you like.',
    turnOn: 'Turn on notifications',
  },

  /** Where notifications can't work. Nothing is lost: it is all in Activity. */
  whyNot: {
    browser: 'Notifications arrive on your phone. In the browser, everything new shows in Activity.',
    expoGo: `Notifications need the installed ${APP} app. In Expo Go, everything new shows in Activity.`,
  },

  // Under the switches in the notification settings: whether this phone lets the app tell them
  thisPhone: {
    on: 'This phone gets the notifications you switched on. Everything also shows in Activity.',
    blocked: `Notifications for ${APP} are off in your phone's settings. Until you turn them on there, everything shows in Activity.`,
    off: 'Notifications are off on this phone. Your choices above are saved for when you turn them on; until then everything shows in Activity.',
    openSettings: "Open the phone's settings",
  },
} as const;
