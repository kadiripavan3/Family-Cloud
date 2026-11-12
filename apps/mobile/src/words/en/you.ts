/** 12 You: the person's own page and the list under it, 12.3 privacy and security, and the way out. */
import { APP, JOURNEY } from './names';

const UNITS = ['KB', 'MB', 'GB', 'TB'];
/** "48 GB", "204 KB": how much is kept, in the largest unit that reads well. */
const size = (bytes: number) => {
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10} ${UNITS[unit]}`;
};

const PHONES: Record<string, string> = { ios: 'iPhone', android: 'Android', web: 'Browser' };

export const you = {
  /** The round buttons above the card. */
  swap: `Switch to ${JOURNEY}`,
  settings: 'Notifications and appearance',
  /** What the swap button says until both apps are on one phone. */
  swapSheet: { title: `Over to ${JOURNEY}`, body: `The other app, ${JOURNEY}, opens from here once both apps are on this phone. It's the same account: nothing to sign in to again.`, ok: 'Got it' },

  /** The three numbers on the card. */
  stats: { circles: 'Circles', notes: 'Notes', kept: 'Kept' },
  size,

  /** The line about the shared account. */
  account: { title: `One account with ${JOURNEY}`, note: `The link between the two apps arrives later`, later: `What you post in ${JOURNEY} shows up here, and the way over there, once the link between the two apps is built.` },

  // The list
  rows: {
    circles: 'Your circles',
    storage: 'Storage and backup',
    storageNote: (kept: string) => `${kept} kept · backup arrives with the Library`,
    privacy: 'Privacy and security',
    privacyNote: (faceId: boolean, minutes: number) => `Face ID ${faceId ? 'on' : 'off'} · Vault locks after ${minutes === 1 ? '1 minute' : `${minutes} minutes`}`,
    notifications: 'Notifications',
    appearance: 'Appearance',
    notificationsAndAppearance: 'Notifications and appearance',
    jot: 'Adding without opening the app',
    jotNote: 'The pinned note, widgets, voice and sharing in',
    leaving: 'Export and leaving',
    deleteAccount: 'Delete account',
    deleteAccountNote: `You choose: only ${APP}, or ${JOURNEY} too`,
  },

  // 12.3 Privacy and security
  security: {
    title: 'Privacy and security',
    thisPhone: 'This phone',
    faceId: 'Open with Face ID',
    lockAfter: 'Lock the Vault after',
    minutes: (minutes: number) => (minutes === 1 ? '1 minute' : `${minutes} minutes`),
    lockTitle: 'Lock the Vault after',
    hideDetails: { label: 'Hide details in notifications', note: '“A bill is due”, not which or how much' },
    /** Under the three: what they do today. */
    phoneNote: `These are remembered on this phone. The Vault locks itself after the time you choose here. Opening it with Face ID needs a build of ${APP} on your phone; in a browser it opens with a passcode.`,
    account: 'Your account',
    phones: 'Phones signed in',
    phonesNone: 'None yet',
    phone: (kind: string) => PHONES[kind] ?? kind,
    signIn: 'Sign-in',
    signInNote: `Shared with ${JOURNEY}`,
    ways: { apple: 'Apple', google: 'Google', email: 'Email code' },
    see: "What we can and can't see",
    vault: { title: 'The Vault: nothing', body: 'Scrambled on your phone with a key only you hold.' },
    rest: { title: 'The rest: private, but readable by the service', body: 'So search, reminders and scans can work. Never sold, never used for ads.' },
  },

  // 12.4 Export and leaving, as far as it is built
  leaving: {
    title: 'Export and leaving',
    later: 'Exporting everything and leaving a circle arrive later. Until then, the two things that end a sign-in are here.',
  },
} as const;
