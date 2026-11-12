/**
 * 9 The Vault: passwords, cards, IDs, Wi‑Fi, door codes and secret notes, scrambled on the phone before they
 * leave it. Security is said by what happens, in ordinary words, including the uncomfortable parts
 * (docs/07-vault-protocol.md "What is not protected" is where these sentences come from).
 */
import { mark, type Rich } from '../rich';
import { dates } from './dates';
import { APP } from './names';
import { formatList, plural, spelled } from './plural';

type Category = 'login' | 'card' | 'id' | 'wifi' | 'code' | 'secret';
type Access = 'use' | 'see' | 'change';
type CircleKind = 'family' | 'couple' | 'flat' | 'crew' | 'solo';

/** "Two passwords", "One password": a small number spelled out, at the start of a sentence. */
const counted = (count: number, one: string, many: string) => {
  const word = spelled(count);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} ${count === 1 ? one : many}`;
};

/** "1:48": what is left on the clock, in minutes and seconds. */
const clock = (seconds: number) => `${Math.floor(Math.max(seconds, 0) / 60)}:${String(Math.max(seconds, 0) % 60).padStart(2, '0')}`;

/** "2 days", "5 hours", "20 minutes", "a moment": how long until something, in its biggest unit. */
const span = (ms: number) => {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 1) return 'a moment';
  if (minutes < 60) return plural(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 48) return plural(hours, 'hour');
  return plural(Math.round(hours / 24), 'day');
};

const quoted = (titles: readonly string[]) => formatList(titles.map((title) => `“${title}”`));

export const vault = {
  // ---------- the six drawers ----------

  /** A drawer's name on its tile, and one thing in it: in "Login · netflix.com" and "New login". */
  drawers: {
    login: { emoji: '🔑', name: 'Logins', one: 'Login', new: 'New login' },
    card: { emoji: '💳', name: 'Cards', one: 'Card', new: 'New card' },
    id: { emoji: '🪪', name: 'IDs', one: 'ID', new: 'New ID' },
    wifi: { emoji: '📶', name: 'Wi‑Fi', one: 'Wi‑Fi', new: 'New Wi‑Fi network' },
    code: { emoji: '🚪', name: 'Codes', one: 'Code', new: 'New code' },
    secret: { emoji: '📝', name: 'Secrets', one: 'Secret note', new: 'New secret note' },
  } satisfies Record<Category, { emoji: string; name: string; one: string; new: string }>,
  /** "on Fri 4 Dec at 18:00", "today at 18:00": a moment, in the middle of a sentence. */
  moment: (day: string, time: string) => (day === dates.today || day === dates.tomorrow ? `${day.toLowerCase()} at ${time}` : `on ${day} at ${time}`),
  /** The same after a word of its own, as in "Until Fri 4 Dec at 18:00". */
  momentPlain: (day: string, time: string) => `${day === dates.today || day === dates.tomorrow ? day.toLowerCase() : day} at ${time}`,
  /** What a screen reader says for a drawer's tile: "Logins, 31". */
  drawerSpoken: (name: string, count: number) => `${name}, ${count}`,

  // ---------- 9.1 The Vault, locked ----------

  locked: {
    emoji: '🔐',
    title: 'The Vault is locked',
    body: `Passwords, cards, IDs and door codes. Scrambled on this phone before they leave it: nobody at ${APP} can read them.`,
    faceId: 'Unlock with Face ID',
    /** What the phone's own Face ID sheet says. */
    faceIdPrompt: 'Unlock your Vault',
    passcode: 'Unlock with your passcode',
    vaultKey: 'Use your Vault key',
    lostKey: "I've lost my Vault key",
    /** A phone that holds no key for this person yet: a new phone, or after signing out. */
    newPhone: "This phone doesn't hold your Vault yet. Type your Vault key once, and it stays here.",
    newBrowser: "This browser doesn't hold your Vault yet. Type your Vault key once, and it stays here behind a passcode.",
    /** Face ID didn't give the key back. */
    faceIdFailed: "Face ID didn't unlock it. Try again, or use your Vault key.",
    /** The sheet that asks for the passcode. */
    sheet: { title: 'Your passcode', field: 'Passcode', unlock: 'Unlock', wrong: "That passcode doesn't open it. Try again, or use your Vault key." },
    /** Someone started a recovery of this person's Vault. */
    recovery: { title: 'Someone is getting back into your Vault', body: (started: string) => `A recovery was started ${started}. If that was you on a new phone, carry on there. If it wasn't you, cancel it now.`, open: 'Look at it' },
  },

  /** A whole Vault screen that was opened, or left open, while the Vault is locked. */
  gate: { title: 'The Vault is locked', body: 'It locks after a short while without use, and whenever you leave the app. Unlock it to carry on.', toVault: 'Go to the Vault' },

  /** While a key is being worked out. It takes a moment on purpose. */
  working: {
    unlocking: 'Opening your Vault. This takes a moment on purpose: it makes guessing your key slow.',
    making: 'Making your keys on this phone.',
    percent: (done: number) => `${Math.round(done * 100)}%`,
  },

  // ---------- setting up ----------

  setUp: {
    emoji: '🔐',
    /** On the Vault's place under Home, before a Vault exists. */
    start: { title: 'Set up your Vault', body: `Passwords, cards, IDs and door codes. Scrambled on this phone before they leave it: nobody at ${APP} can read them.`, button: 'Set up my Vault' },
    title: 'Set up your Vault',
    lead: ['Two keys are made on this phone, and nowhere else. One never leaves it. The other, your ', mark('bold', 'Vault key'), ', is shown to you once, to save or print.'] as Rich,
    points: {
      scrambled: { title: 'Scrambled before it leaves', body: `What you put in is scrambled here. ${APP} stores it and can't read it.` },
      noReset: { title: 'No reset', body: "We don't have a copy of your Vault key, so we can't reset it. Two people you trust can together let you back in." },
      clear: { title: 'What we can see', body: 'Titles, kinds, sites and who you share with are stored unscrambled, so search and reminders work. Never put a secret in a title.' },
    },
    button: 'Make my keys',
    /** The passcode this phone or browser keeps the key behind, where there is no Face ID. */
    passcode: {
      label: 'A passcode for this browser',
      phoneLabel: 'A passcode for this phone',
      again: 'The same passcode again',
      note: 'At least 8 characters. You type it each time the Vault has locked.',
      short: 'Use at least 8 characters.',
      different: "The two don't match.",
    },
    /** Said plainly on every screen where a passcode is chosen in a browser. */
    browser: {
      title: 'The browser preview is for trying things out',
      body: "Don't keep real passwords here. A browser has no Face ID and no safe place for keys: your key is kept in this browser, scrambled with the passcode, and anyone who can read this browser's storage can keep guessing passcodes.",
    },
    faceId: { title: 'Kept behind Face ID', body: "Between unlocks your key stays in this phone's secure storage, and the phone asks for Face ID before it hands it back." },
  },

  // ---------- unlocking with the Vault key ----------

  unlock: {
    title: 'Your Vault key',
    lead: "The 24 characters you saved or printed when you set up your Vault. Capitals and spaces don't matter.",
    field: 'Vault key',
    placeholder: 'XXXX XXXX XXXX XXXX XXXX XXXX',
    button: 'Unlock',
    /** Under the field, while it isn't 24 characters of the right kind yet. */
    shape: (typed: number) => (typed === 0 ? 'Six groups of four. It has no I, O, 0 or 1.' : `${typed} of 24 characters. It has no I, O, 0 or 1.`),
    wrong: "That key doesn't open your Vault. Check each group against what you saved. We can't tell you which character is wrong.",
    lost: "I've lost my Vault key",
    /** Whether this phone keeps the key from now on. */
    keep: 'Keep my Vault on this phone',
    keepNote: 'Otherwise you type the 24 characters every time the Vault has locked.',
  },

  // ---------- 9.2 The Vault ----------

  home: {
    /** "Locks itself in 1:48" */
    locksIn: (seconds: number) => `Locks itself in ${clock(seconds)}`,
    look: {
      title: (count: number) => `${counted(count, 'password needs', 'passwords need')} a look`,
      /** "One is weak. Two are used in more than one place." */
      body: (weak: number, reused: number, leaked: number) =>
        [weak ? `${counted(weak, 'is', 'are')} weak.` : null, reused ? `${counted(reused, 'is', 'are')} used in more than one place.` : null, leaked ? `${counted(leaked, 'has', 'have')} shown up in a known leak.` : null]
          .filter(Boolean)
          .join(' '),
    },
    shared: 'Shared with you',
    /** Under a shared item: "From Alex · you can see it". */
    from: (owner: string, access: Access) => `From ${owner} · ${{ use: 'you can use it', see: 'you can see it', change: 'you can change it' }[access]}`,
    /** Under an item that waits for a key, was used up, or has stopped. */
    state: {
      waiting: (owner: string) => `From ${owner} · waiting for their key`,
      used: (owner: string) => `From ${owner} · opened once, gone now`,
      stopped: (owner: string) => `From ${owner} · stopped working`,
    },
    copy: (title: string) => `Copy ${title}`,
    empty: { title: 'Nothing in your Vault yet', body: 'Add a password, a card or the Wi‑Fi. It starts as only yours.', button: 'Add the first one' },
    add: 'Add to the Vault',
    more: {
      key: 'Your Vault key',
      keyNote: (saved: boolean) => (saved ? 'Saved · and who can help you back in' : "You haven't said you saved it"),
      emergency: 'If something happens',
      emergencyNote: (name: string | null, hours: number) => (name ? `${name} can ask · ${plural(hours, 'hour')} to say no` : 'Off'),
      helping: 'People you help, people who trust you',
      lock: 'Lock the Vault now',
    },
    /** What needs the person now, at the top of the Vault. */
    attention: {
      asked: { title: (name: string) => `${name} asked to open your Vault`, body: (opens: string) => `It opens to them ${opens} unless you say no.`, button: 'Look' },
      open: { title: (name: string) => `Your Vault is open to ${name}`, body: 'The wait is over and nobody said no. Switch it off to close it again.', button: 'Look' },
      helperAsk: { title: (name: string) => `${name} asks you to be a helper`, body: 'If they lose their Vault key, you and one other helper can let them back in.', button: 'Answer' },
      helpNeeded: { title: (name: string) => `${name} needs your help to get back in`, body: 'Check it is really them first: call, or ask in person.', button: 'Help' },
      entrustedOpen: { title: (name: string) => `${name}'s Vault is open to you`, body: 'The wait is over. What they chose for you can be read now.', button: 'Open' },
      entrustedAsked: { title: (name: string) => `You asked for ${name}'s Vault`, body: (opens: string) => `It opens ${opens} unless they say no.`, button: 'Look' },
      waiting: {
        title: (count: number) => `${counted(count, 'person is', 'people are')} waiting for a key from you`,
        body: 'They were shared with before they had a Vault, or joined later. Your phone wraps the key for each with the public key the service reports for them.',
        button: 'Hand over',
        done: (count: number) => (count === 1 ? 'One key handed over.' : `${count} keys handed over.`),
      },
      sharesDue: { title: 'Your helpers are waiting for their parts', body: 'Someone said yes since your key was last split. Split it again so each helper holds a part.', button: 'Split' },
      notSaved: { title: 'Save your Vault key', body: "It is the only way back in on a new phone, and we can't reset it.", button: 'Show' },
    },
  },

  /** A drawer's own page, and the two lists that cut across the drawers. */
  drawer: {
    look: 'Needs a look',
    shared: 'Shared with you',
    empty: {
      title: 'Nothing here yet',
      body: 'What you add to this drawer shows up here.',
      lookBody: 'No password here is weak or used twice, as far as this phone has judged.',
      sharedBody: 'What other people share with you from their Vault shows up here.',
    },
    add: 'Add',
    yours: 'Only you',
  },

  // ---------- 9.3 A password ----------

  item: {
    edit: 'Edit',
    /** The labels of what is inside. The username's depends on what it looks like. */
    fields: {
      username: (value: string) => (value.includes('@') ? 'Email' : 'Username'),
      usernameField: 'Email or username',
      password: 'Password',
      totp: 'One-time code',
      totpField: 'One-time code secret',
      holder: 'Name on the card',
      number: 'Number',
      expires: 'Valid until',
      code: 'Code',
      securityCode: 'Security code',
      pin: 'PIN',
      network: 'Network',
      text: 'Secret note',
      notes: 'Notes',
      expiresOn: 'Runs out on',
    },
    dots: '••••••••••••••',
    show: (label: string) => `Show ${label.toLowerCase()}`,
    hide: (label: string) => `Hide ${label.toLowerCase()}`,
    copy: (label: string) => `Copy ${label.toLowerCase()}`,
    copyOnce: (label: string) => `Copy ${label.toLowerCase()} once`,
    /** A one-time code as people read it: "482 913". */
    code: (digits: string) => `${digits.slice(0, 3)} ${digits.slice(3)}`,
    codeSpoken: (digits: string, seconds: number) => `${digits.split('').join(' ')}. New code in ${plural(seconds, 'second')}`,
    badTotp: "This secret isn't one a code can be made from",
    /** After copying. The clipboard is cleared where the platform allows. */
    copied: {
      ios: 'Copied. The phone clears it from the clipboard after 60 seconds.',
      android: `Copied. ${APP} clears it from the clipboard after 60 seconds, while the app is open.`,
      web: 'Copied. This page clears it from the clipboard after 60 seconds, if the browser lets it.',
    },
    notCopied: "That didn't copy. The phone or the browser didn't allow it.",
    nothingToCopy: 'There is nothing in it to copy.',

    who: 'Who can use it',
    you: 'You',
    yours: "It's yours",
    owner: 'It is theirs',
    /** The pill at the end of a person's row. */
    access: { use: 'Can use', see: 'Can see', change: 'Can change' } satisfies Record<Access, string>,
    /** What a screen reader says for the pill that changes it: "Alex: Can see. Change". */
    accessSpoken: (name: string, access: string) => `${name}: ${access}. Change`,
    /** The line under a person, by where their key stands. */
    line: {
      use: 'The app never shows it to them',
      see: 'Can look it up any time',
      change: 'Can save changes too',
      once: 'Gone for them after one look',
      until: (when: string) => `Until ${when}`,
      opened: (ago: string) => `Opened it ${ago}`,
      changed: (ago: string) => `Changed it ${ago}`,
      waiting: 'Waiting for a key from your phone',
      noVault: "Hasn't opened their Vault yet",
      used: 'Opened it once. It is gone for them',
      stopped: 'Has stopped working for them',
    },
    share: 'Share with someone',
    shareNote: 'To use, to see or to change',

    /** The phone's verdict on a password. Nothing checks for leaks: no leak check is connected. */
    health: {
      ok: { title: 'Strong, and not used twice', body: (length: number) => `${plural(length, 'character')}. Compared with the other passwords you opened since unlocking.` },
      weak: { title: 'This password is weak', body: (length: number) => `${plural(length, 'character')}. Longer and more mixed is stronger: 16 or more, or letters, digits and symbols together.` },
      reused: {
        title: 'Used somewhere else too',
        body: (titles: readonly string[]) => (titles.length ? `The same password is in ${quoted(titles)}. One leak would open all of them.` : 'This phone found the same password in another item when it was saved. One leak would open both.'),
      },
      leaked: { title: 'This password showed up in a leak', body: 'Change it at the site itself, then save the new one here.' },
      noLeakCheck: 'Not checked against known leaks: no leak check is connected yet.',
    },

    /** For someone it is shared with as "can use". In the words of the protocol document. */
    useOnly: {
      title: 'You can use this, not see it',
      body: "“Can use, can't keep” is a rule of this app, not of the mathematics. Your phone holds the password for the moment it copies it; the app never shows it and offers only “copy once”.",
    },
    /** The one look of something shared once. */
    once: {
      ready: { title: 'You can open this once', body: (owner: string) => `${owner} shared it for one look. After you open it, the service erases your key for it.`, button: 'Open it now' },
      opened: { title: 'This was the one look', body: 'The service has erased your key for it. It is gone for you when you leave this page.' },
      used: { title: 'You opened this once', body: (owner: string) => `It was shared for one look, and that look has happened. Ask ${owner} to share it again if you need it.` },
    },
    waiting: { title: 'Waiting for a key', body: (owner: string) => `${owner} shared this with you. Their phone hands you the key the next time their Vault is open.` },
    stopped: { title: 'It has stopped working', body: (owner: string) => `${owner} shared this until a time that has passed. Ask them to share it again if you still need it.` },
    stopsAt: (when: string) => `Shared with you until ${when}.`,
    /** A sample item of the screens: it was never scrambled, and nobody holds a key for it. */
    sample: { title: 'Sample item', body: 'Add your own to see the real thing. This one came with the sample circle: it was never scrambled, so there is nothing inside to open, share or change.' },
    /** The labels in the clear don't match what is sealed inside. */
    labelsChanged: { title: 'The label on this was changed', body: (title: string, site: string) => `Someone changed its title or site without its key. Inside, it says “${title}”${site ? ` and “${site}”` : ''}. Believe the inside.` },
    notReadable: "This item was saved in a way this version of the app doesn't read.",
    cantOpen: "This didn't open with your key. It may have been changed by someone without its key.",
  },

  // ---------- adding and changing an item ----------

  form: {
    kind: 'What is it?',
    title: 'Title',
    titlePlaceholder: { login: 'Netflix', card: 'Family Visa', id: "Mia's passport", wifi: 'Home Wi‑Fi', code: 'Front door code', secret: 'Where the spare key is' } satisfies Record<Category, string>,
    site: { login: 'Site', card: 'Label', id: 'Label', wifi: 'Label', code: 'Label', secret: 'Label' } satisfies Record<Category, string>,
    sitePlaceholder: { login: 'netflix.com', card: 'shared account', id: 'passport', wifi: 'home', code: 'home', secret: 'house' } satisfies Record<Category, string>,
    /** Under the title and the site: they are stored unscrambled. */
    clearNote: 'The title and the line under it are stored unscrambled, so search and reminders work. Everything below is scrambled on this phone.',
    generate: 'Make one',
    generateSpoken: 'Make a strong password',
    totpNote: 'The secret a site shows when you set up two-step codes, or the link behind its QR code.',
    expiresNone: 'No date',
    expiresTitle: 'The day it runs out',
    save: 'Save',
    create: 'Add',
    startsAs: 'It starts as only yours. Share it from its own page.',
    needTitle: 'Give it a title.',
    weakNow: 'This one is weak: short, or all of one kind.',
    reusedNow: (titles: readonly string[]) => `The same password is in ${quoted(titles)}.`,
    editTitle: 'Edit',
    delete: 'Delete this item',
    deleteAsk: { title: 'Delete this item?', body: 'It is gone for you and for everyone it is shared with. What they copied before, they keep.', confirm: 'Delete it' },
    discard: { title: 'Throw away what you typed?', body: "It hasn't been saved.", confirm: 'Throw it away', cancel: 'Keep typing' },
  },

  // ---------- 9.4 Share a secret ----------

  share: {
    title: (item: string) => `Share “${item}”`,
    /** When the sheet is about one person. */
    titleFor: (name: string, item: string) => `${name} and “${item}”`,
    other: 'Other',
    /** What a screen reader says for a person in the row of pictures. */
    person: (name: string) => `Share with ${name}`,
    ways: {
      use: { label: "Can use, can't keep", note: 'Shows once when needed, then hides again' },
      see: { label: 'Can see', note: 'Can look it up any time' },
      change: {
        label: 'Can change',
        note: { family: 'For another adult in the house', couple: 'Either of you can save changes', flat: 'For someone who looks after it too', crew: 'For someone who looks after it too', solo: 'They can save changes too' } satisfies Record<CircleKind, string>,
      },
    },
    /** Under the three ways while "can use" is chosen. In the words of the protocol document. */
    useNote: "“Can use, can't keep” is a rule of the app, not of the mathematics. A phone that can fill a password in holds that password for that moment: the app never shows it, and someone determined can still get it out of their own phone.",
    once: "Gone after it's opened once",
    stops: 'Stops working',
    never: 'Never',
    /** "Sunday evening": the evening of a day. */
    evening: (day: string) => `${day} evening`,
    stopsTitle: 'The day it stops working',
    stopsClear: "Don't stop",
    button: (count: number) => (count === 0 ? 'Stop sharing' : count === 1 ? 'Share with 1 person' : `Share with ${count} people`),
    /** Why someone can't be ticked, or what happens when they are. */
    noPhone: (name: string) => `${name} has no sign-in of their own, so nothing can be sealed for them. That needs a phone of their own.`,
    noVault: (names: readonly string[]) => `${formatList(names)} ${names.length === 1 ? "hasn't" : "haven't"} opened their Vault yet. They get it once they have, the next time your Vault is open.`,
    gone: (name: string, state: 'used' | 'stopped') => (state === 'used' ? `${name} opened it once, and it is gone for them. Tick them to share it again.` : `It has stopped working for ${name}. Tick them to share it again.`),
    /** Taking it away from someone who has had it. */
    removing: (names: readonly string[]) => `${formatList(names)} may have kept what they saw. The item gets a new key now, so the key they held opens nothing that is stored from here on. If it matters, change the password at the site too.`,
    outside: { title: 'Someone outside the circle', body: 'A sitter or a friend gets a guest pass with a sealed card: a door code or the Wi‑Fi, for one evening, with no account.', button: 'Make a guest pass' },
    nobody: 'There is nobody else in this circle yet. Invite someone first.',
  },

  // ---------- 9.5 If something happens ----------

  emergency: {
    title: 'If something happens to you',
    lead: ['Someone you trust can get to what the family would need. Until then they see ', mark('bold', 'none of it'), '.'] as Rich,
    steps: {
      asks: (name: string | null) => (name ? `${name} asks` : 'They ask'),
      wait: (hours: number) => `You have ${plural(hours, 'hour')} to say no`,
      opens: (name: string | null) => (name ? `It opens to ${name}` : 'It opens to them'),
    },
    person: { label: 'The person who can ask', none: 'Choose someone you trust', title: 'Who can ask?' },
    wait: { label: 'Time to say no', value: (hours: number) => plural(hours, 'hour'), title: 'How long do you get to say no?', choice: (hours: number) => `${plural(hours / 24, 'day')} · ${hours} hours` },
    opens: {
      label: 'What opens',
      none: 'Nothing chosen yet',
      count: (count: number) => plural(count, 'thing'),
      /** "Bank, Insurance, 14 things": the first few by name, then how many in all. */
      summary: (titles: readonly string[], count: number) => [...titles.slice(0, 2), plural(count, 'thing')].join(', '),
      title: 'What opens to them?',
      hint: 'Only what you tick here, and only your own things. What you add to the Vault later is not included until you tick it.',
      empty: 'You have nothing of your own in the Vault yet. Add something first.',
      pick: (title: string) => `Include ${title}`,
    },
    note: {
      label: 'A note for the family',
      hint: 'Where the will is, who to call, what to cancel',
      written: 'Written',
      title: 'A note for the family',
      placeholder: 'Where the will is, who to call, what to cancel.',
      sealed: 'It is scrambled on this phone for the person you chose. Nobody else, and nobody at the service, can read it.',
    },
    turnOn: 'Turn it on',
    save: 'Save changes',
    fine: 'You can change the person or switch it off whenever you like.',
    on: (name: string) => `It is on. ${name} can ask.`,
    switchOff: 'Switch it off',
    switchOffAsk: { title: 'Switch it off?', body: (name: string) => `${name} can no longer ask, and what was set aside for them is deleted.`, confirm: 'Switch it off' },
    /** While a request runs, or once it opened. */
    asked: { title: (name: string) => `${name} asked`, body: (opens: string) => `It opens to them ${opens} unless you say no. Saying no ends this request, not the arrangement: they can ask again another day.`, no: 'Say no' },
    open: { title: (name: string) => `It is open to ${name}`, body: 'The wait ended and nobody said no. They can read what you chose. Switching it off, or changing it, closes it again.' },
    /** What the service does and doesn't keep to. */
    honest: 'The wait is kept by the service: what opens is already scrambled for the person you chose, and the service holds it back until the time is up.',
    noVault: "Hasn't opened their Vault yet",
    nobody: 'Nobody else in your circles has a Vault yet. They need one before you can choose them.',
    needPerson: 'Choose the person first.',
  },

  /** The trusted person's side. */
  entrusted: {
    title: (name: string) => `${name}'s Vault`,
    lead: (name: string) => `${name} chose you as the person who can ask for it if something happens to them.`,
    ready: { body: (name: string, hours: number) => `If you ask, ${name} is told on every phone and has ${plural(hours, 'hour')} to say no. Until it opens you see none of it, not even what would open.`, ask: (name: string) => `Ask for ${name}'s Vault` },
    askAsk: { title: (name: string) => `Ask for ${name}'s Vault?`, body: (name: string, hours: number) => `${name} is told now. If they don't say no within ${plural(hours, 'hour')}, what they chose opens to you.`, confirm: 'Ask', cancel: 'Not now' },
    asked: { title: 'You asked', body: (name: string, opens: string) => `It opens ${opens}, unless ${name} says no before then.`, left: (ms: number) => `${span(ms)} to go` },
    refused: (name: string, when: string) => `${name} said no ${when}. You can ask again another day; the wait then starts afresh.`,
    open: { title: 'It is open to you', items: 'What opened', note: 'Their note for the family', noNote: 'They left no note.', nothing: 'They chose nothing to open.' },
    off: (name: string) => `${name} switched this off, or you are no longer in a circle together.`,
    openItem: (title: string) => `Open ${title}`,
    list: { label: 'People who trust you', line: { ready: 'You can ask for their Vault', asked: 'You asked · waiting', open: 'Open to you', off: 'Off' } },
  },

  // ---------- 9.6 Your Vault key ----------

  key: {
    title: 'Your Vault key',
    lead: ["It unscrambles the Vault on a new phone. We don't have a copy, so ", mark('bold', "we can't reset it for you"), '.'] as Rich,
    pdf: 'Save as PDF',
    copy: 'Copy',
    copied: 'Copied',
    /** The card when the key is no longer held: it was shown once. */
    shownOnce: { title: 'Shown once', body: "This phone doesn't keep your Vault key, so it can't show it again. If you didn't save it, make a new one: the old one stops working." },
    makeNew: 'Make a new Vault key',
    makeNewAsk: { title: 'Make a new Vault key?', body: "The key you saved before stops working, and your helpers' parts are thrown away: split the new key for them afterwards. Nothing you shared changes.", confirm: 'Make a new key', cancel: 'Keep the old one' },
    saved: "I've saved my key",
    savedOn: 'You said you saved it.',
    /** What the QR code is, for a screen reader. */
    qr: 'Your Vault key as a QR code',
    /** The printed page. */
    print: { title: `Your ${APP} Vault key`, body: `Keep this page somewhere safe. With this key, and your sign-in, your Vault opens on a new phone. ${APP} has no copy and can't reset it.`, made: (day: string) => `Made on ${day}` },
    pdfOnPhone: 'Saving as a PDF arrives with the phone build. For now, copy it, or write it down.',
    pdfBlocked: "The browser didn't open the page to print. Copy the key, or write it down.",

    helpers: {
      label: 'If you lose it',
      can: (name: string) => `${name} can help you back in`,
      canToo: (name: string) => `${name} can help too`,
      asked: (name: string) => `${name} was asked`,
      declined: (name: string) => `${name} said no`,
      state: { asked: 'Waiting for their answer', accepted: 'Helper · said yes', acceptedNeedsPart: 'Said yes · needs their part of the key', declined: 'Ask someone else' },
      anyTwo: 'Any two helpers together',
      add: (have: number) => (have === 0 ? 'Add a helper' : have === 1 ? 'Add a second helper' : have === 2 ? 'Add a third helper' : 'Add another helper'),
      addNote: (have: number) => (have < 2 ? 'Two are needed to let you back in' : 'So two are always reachable'),
      choose: 'Who can help you back in?',
      chooseNote: 'They are asked, and have to say yes. One helper alone can do nothing; any two together can let you back in.',
      noVault: "Hasn't opened their Vault yet",
      nobody: 'Nobody else in your circles has a Vault yet. A helper needs one.',
      remove: (name: string) => `Take ${name} off the list`,
      removeAsk: { title: (name: string) => `Take ${name} off the list?`, body: 'Their part of your key is thrown away.', confirm: 'Take them off' },
      /** Splitting the key for the helpers who said yes. */
      split: {
        title: 'Hand your helpers their parts',
        body: (count: number) => `${counted(count, 'helper', 'helpers')} said yes. Your Vault key is split on this phone so that any two parts rebuild it, and each part is scrambled for one helper. One part alone says nothing.`,
        field: 'Your Vault key',
        fieldNote: "This phone doesn't keep your Vault key, so type it once more to split it.",
        button: (count: number) => `Split it for ${count} helpers`,
        wrong: "That isn't your Vault key. Nothing was split.",
        needTwo: 'One helper alone must never be enough. When a second helper says yes, your key is split between them.',
      },
    },
  },

  /** The helper's side. */
  helping: {
    title: 'People you help',
    lead: 'You hold a part of their Vault key. It is scrambled for you, and the service hands it out only while they are getting back in.',
    empty: { title: 'Nobody has asked you', body: 'When someone chooses you as a helper for their Vault, or as the person who can ask for it, it shows up here.' },
    label: 'Helping them back in',
    ask: { line: 'Asks you to be a helper', yes: 'Yes', no: 'No', yesSpoken: (name: string) => `Yes, help ${name}`, noSpoken: (name: string) => `No, don't help ${name}` },
    accepted: { line: 'You are a helper', stepDown: (name: string) => `Stop helping ${name}`, stepDownAsk: { title: (name: string) => `Stop helping ${name}?`, body: 'Your part of their key is thrown away.', confirm: 'Step down' } },
    declined: { line: 'You said no' },
    needed: {
      line: 'Getting back in now · needs your part',
      title: (name: string) => `${name} is getting back into their Vault`,
      body: (name: string) => `Check that it is really ${name} before you help: call, or ask in person. Read these words to each other. They must be the same on both phones.`,
      words: 'Check words',
      pass: 'They match: pass my part on',
      given: 'You passed your part on',
      help: (name: string) => `Help ${name}`,
    },
  },

  // ---------- getting back in without the key ----------

  recover: {
    title: 'Get back in with your helpers',
    lead: 'Two of the people you chose can together let you back in. You are told on every phone you are signed in on, and so are they.',
    noHelpers: { title: 'There is no way back in', body: "You have no two helpers who hold a part of your key, and we don't have a copy. Without the Vault key, what is in this Vault stays scrambled for good." },
    start: 'Ask my helpers',
    started: { title: 'Your helpers were asked', body: (needed: number) => `${counted(needed, 'helper has', 'helpers have')} to pass their part on. Call them: they will read you the check words below, and they must match.` },
    words: 'Check words',
    helper: { given: 'Passed their part on', waiting: 'Not yet' },
    lapses: (when: string) => `This recovery lapses on ${when}.`,
    /** In the browser the temporary key is held in memory only. */
    keepOpen: 'Keep this page open. In the browser preview the recovery is forgotten when the page is closed or loaded again, and has to be started afresh.',
    ready: { title: 'Two helpers have helped', body: 'Their parts are scrambled for this phone only. Opening rebuilds your Vault key here and unlocks the Vault.', open: 'Open my Vault' },
    /** A recovery that this phone didn't start. */
    notMine: { title: "This recovery wasn't started on this phone", body: "If it is yours, carry on where you started it. If it isn't, cancel it: nobody gets in without two of your helpers, but they shouldn't be asked by a stranger." },
    cancel: 'Cancel this recovery',
    cancelAsk: { title: 'Cancel this recovery?', body: 'The parts that were passed on are deleted. You can start again.', confirm: 'Cancel it', cancel: 'Keep it' },
    failed: "The two parts didn't rebuild your key. Cancel this recovery and start again.",
    /** After getting back in. */
    after: { title: "You're back in", body: 'Your old Vault key was just rebuilt from two parts, so make a new one now. The parts your helpers hold are thrown away with it, and the new key is split for them again.', button: 'Make a new Vault key' },
  },

  // ---------- a door code on a guest pass ----------

  pass: {
    label: 'Door codes and Wi‑Fi',
    add: 'Add a code or the Wi‑Fi',
    addNote: 'From your Vault, sealed on this phone',
    /** A card on the pass. */
    card: { once: 'Shows once', many: 'Shows when tapped' },
    choose: 'What should they be able to read?',
    chooseNote: 'From your own Vault in this circle. The text is scrambled with a key that travels only in the link, after the #.',
    nothing: "You have no code or Wi‑Fi of your own in this circle's Vault yet.",
    once: 'Show it only once',
    /** What a guest reads for a Wi‑Fi network. */
    wifi: (network: string, password: string) => `Network ${network}, password ${password}`,
    empty: 'This item has nothing to show a guest.',
    locked: 'Unlock your Vault to add a code, and to get the whole link.',
    linkLocked: "This pass carries a sealed code. Unlock your Vault for the whole link: without its end the code won't open.",
    noVault: 'Set up your Vault to put a door code or the Wi‑Fi on a pass.',
    notMaker: 'A code can be added by the person who made the pass, if they had a Vault when they made it.',
    linkNote: 'The end of this link, after the #, is the key to the codes. Whoever gets the link and the four digits can read them.',
    toVault: 'Go to the Vault',
  },

  /** What the app itself says when something with keys didn't work. (The API's own sentences are shown as they are.) */
  problems: {
    locked: 'The Vault locked itself. Unlock it and try again.',
    unknown: "That didn't work. Nothing was changed.",
  },

  /**
   * The words two people read to each other before a helper passes their part on: three of these, picked by
   * the first bytes of a fingerprint of the new phone's temporary key. 256 of them, one for each value a byte
   * can have, so the list must keep its length and its order.
   */
  checkWords: [
    'apple', 'anchor', 'arrow', 'autumn', 'badger', 'bakery', 'balloon', 'bamboo', 'banana', 'barrel', 'basket', 'beach', 'beacon', 'bench', 'berry', 'bicycle',
    'birch', 'blanket', 'blossom', 'boat', 'bottle', 'branch', 'bread', 'bridge', 'brook', 'bucket', 'butter', 'button', 'cabin', 'cactus', 'camel', 'candle',
    'canoe', 'canyon', 'carpet', 'carrot', 'castle', 'cedar', 'chalk', 'cherry', 'chimney', 'cinnamon', 'circus', 'clover', 'cloud', 'coast', 'cobweb', 'coconut',
    'comet', 'compass', 'copper', 'coral', 'cotton', 'cradle', 'crayon', 'cricket', 'crystal', 'cupboard', 'curtain', 'cushion', 'daisy', 'dolphin', 'donkey', 'doorbell',
    'dragon', 'drum', 'eagle', 'echo', 'elbow', 'ember', 'engine', 'falcon', 'feather', 'fence', 'fern', 'ferry', 'fiddle', 'field', 'flute', 'forest',
    'fossil', 'fountain', 'fox', 'garden', 'garlic', 'ginger', 'giraffe', 'glacier', 'globe', 'goose', 'granite', 'grape', 'hammer', 'harbour', 'harvest', 'hazel',
    'heron', 'hill', 'honey', 'horizon', 'island', 'ivory', 'jacket', 'jasmine', 'jelly', 'jigsaw', 'juniper', 'kettle', 'kitten', 'kiwi', 'ladder', 'lagoon',
    'lantern', 'lemon', 'lighthouse', 'lily', 'linen', 'lizard', 'lobster', 'locket', 'magnet', 'mango', 'maple', 'marble', 'meadow', 'melon', 'mirror', 'mitten',
    'monkey', 'moon', 'moss', 'mountain', 'muffin', 'mustard', 'napkin', 'needle', 'nest', 'noodle', 'nutmeg', 'oak', 'oasis', 'ocean', 'olive', 'onion',
    'orange', 'orchard', 'otter', 'owl', 'oyster', 'paddle', 'pancake', 'panda', 'parrot', 'pebble', 'pelican', 'pencil', 'pepper', 'piano', 'pigeon', 'pillow',
    'pine', 'planet', 'plum', 'pocket', 'pond', 'poppy', 'pumpkin', 'puzzle', 'quilt', 'rabbit', 'raccoon', 'radish', 'rainbow', 'raven', 'ribbon', 'river',
    'robin', 'rocket', 'rooster', 'saddle', 'saffron', 'sailor', 'salmon', 'sandal', 'satchel', 'saucer', 'scarf', 'seagull', 'shadow', 'shell', 'shovel', 'silver',
    'skate', 'sled', 'slipper', 'snail', 'snow', 'sparrow', 'spider', 'spoon', 'squirrel', 'stable', 'starfish', 'stone', 'straw', 'stream', 'sugar', 'summer',
    'sunflower', 'swan', 'table', 'teapot', 'thimble', 'thistle', 'thunder', 'tiger', 'timber', 'toast', 'tomato', 'tractor', 'trumpet', 'tulip', 'tunnel', 'turnip',
    'turtle', 'umbrella', 'valley', 'vanilla', 'velvet', 'village', 'violin', 'wagon', 'walnut', 'walrus', 'waterfall', 'whale', 'wheat', 'whistle', 'willow', 'window',
    'winter', 'wolf', 'wool', 'yarn', 'zebra', 'zipper', 'acorn', 'almond', 'apricot', 'atlas', 'bagel', 'banjo', 'beetle', 'biscuit', 'bonnet', 'buffalo',
  ],
  /** "apple · river · lantern" */
  checkWordsLine: (picked: readonly string[]) => picked.join(' · '),
} as const;
