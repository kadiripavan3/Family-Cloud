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

const n = (count: number) => count.toLocaleString('en-US');
/** "1 thing", "24 things". */
const things = (count: number) => (count === 1 ? '1 thing' : `${n(count)} things`);

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
    /** "48 of 200 GB": what the current circle keeps, of what it may keep. The unit is said once when both have the same. */
    storageNote: (used: string, quota: string) => {
      const [amount, unit] = used.split(' ');
      return unit && quota.endsWith(` ${unit}`) ? `${amount} of ${quota}` : `${used} of ${quota}`;
    },
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
    phoneNote: `Face ID and the Vault's timer are remembered on this phone; in a browser the Vault asks for a passcode instead. Hiding details goes for every phone you are signed in on.`,
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

  // 12.4 Export and leaving
  leaving: {
    title: 'Export and leaving',
    headline: 'Your things stay yours',
    /** The two rows that export. The API makes ordinary files: text and web pages, not PDF; CSV, not Excel. */
    exportAll: { label: 'Export everything', note: 'Notes as text and web pages, photos full size, sheets as CSV' },
    exportVault: { label: 'Export the Vault', note: 'A locked file other password apps can open' },
    ifYouLeave: (circle: string) => `If you leave ${circle}`,
    lines: {
      private: 'What you kept private leaves with you',
      shared: 'What you shared stays for the others, as a copy',
      passwords: 'Passwords you shared stop working for them',
    },
    leave: (circle: string) => `Leave ${circle}`,

    /** The sheet behind "Export everything": asking for one, and fetching it when it is ready. */
    export: {
      lead: (circle: string) =>
        `One zip of ordinary files from ${circle}: notes as text and web pages, photos and files full size, sheets as CSV, the calendar as a calendar file. The Vault is not in it: only your phone can open that.`,
      scope: { label: 'What goes in', everything: 'All you can see', mine: 'Only what you made' },
      make: 'Make the export',
      yours: 'Your exports',
      /** One export, by where it stands. */
      waiting: 'Being made. You can leave this page: it shows up in Activity when it is ready.',
      ready: (count: number | null, size: string | null) => [count === null ? null : count === 1 ? '1 file' : `${n(count)} files`, size].filter(Boolean).join(' · '),
      failed: "That one didn't work. Ask for another.",
      /** "All you can see · asked for 2h ago" */
      asked: (scope: 'everything' | 'mine', when: string) => `${scope === 'mine' ? 'What you made' : 'All you can see'} · asked for ${when}`,
      keptUntil: (day: string) => `Kept until ${day}, then removed`,
      save: 'Save',
      saveSpoken: (what: string) => `Save the export. ${what}`,
      remove: 'Remove this export',
    },

    /** What "Export the Vault" says until a phone can do it. */
    vault: {
      title: 'Export the Vault',
      body: `Nobody but your phone can open your Vault, so only your phone can export it. That part isn't built yet. Until it is, each item can be opened and copied on its own page.`,
      ok: 'Got it',
    },

    /** The sheet that asks before leaving: the numbers, and what happens to each. */
    leaveSheet: {
      title: (circle: string) => `Leave ${circle}?`,
      onlyYours: (count: number) => (count === 0 ? 'Nothing here is only yours' : `${things(count)} only you can see ${count === 1 ? 'is' : 'are'} deleted. Export first to keep ${count === 1 ? 'it' : 'them'}.`),
      shared: (count: number) => (count === 0 ? 'You shared nothing here' : `${things(count)} you shared ${count === 1 ? 'stays' : 'stay'} for the others, in your name`),
      passwords: (count: number) => (count === 0 ? 'You shared no passwords here' : `${count === 1 ? '1 password' : `${n(count)} passwords`} you shared ${count === 1 ? 'stops' : 'stop'} working for them`),
      nextOwner: (name: string) => `${name} becomes the owner.`,
      lastOne: (circle: string) => `You are the last one here. ${circle} and everything in it is deleted for good.`,
      ownerNeeded: "You can't leave yet. You are the owner, and no other adult is here to take over. Make someone else an adult on People first.",
      confirm: (circle: string) => `Leave ${circle}`,
      stay: 'Stay',
    },
  },
} as const;
