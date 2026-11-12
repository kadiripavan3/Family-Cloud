/** 14 Jot: adding something without opening the app. The jot bar, what was filed, voice, sharing in, the ways in, and the pictures of the widgets, the pinned note and the Lock Screen. */
import { places } from '@/theme/tokens';

import { dates } from './dates';
import { APP } from './names';
import { formatList, plural, spelled } from './plural';

const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const small = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
/** "08:00" as the API writes a time of day: "8:00". */
const clock = (time: string) => time.replace(/^0(\d)/, '$1');

/** Why something can't happen where the app is running now: in a browser, or in Expo Go. */
const NEEDS_PHONE = `This comes with the phone build of ${APP}: the app installed on your phone, not the browser or Expo Go.`;

export const jot = {
  name: 'Jot',
  clock,
  /** What a jot became, in a word. */
  kinds: { event: 'Event', reminder: 'Reminder', list_item: 'List', note: 'Note', code: 'Code' },

  // 14.2 The jot bar
  bar: {
    label: 'Jot something down',
    placeholder: 'Milk, a reminder, a thought…',
    add: 'Add',
    close: 'Close',
    filed: 'What was filed today',
    ways: 'Ways in',
    voice: 'Say it all at once',
    undo: 'Undo',
    /** What a screen reader says for a filed line: "Milk, Groceries". */
    filedLine: (title: string, where: string) => `${title}, ${where}`,
    undoLine: (title: string) => `Undo ${title}`,
    /** How the line is read, for a screen reader, before the chips. */
    reading: 'How this is read',
    /** On a chip for something that is held back. */
    looksLikeCode: 'looks like a code',
  },

  // Something that looks like a code or a password: held back until the person says where it goes
  held: {
    title: (words: string) => `“${words}” looks like a code`,
    body: "It hasn't been kept anywhere yet.",
    vault: 'Keep in the Vault',
    note: "It's just a note",
  },

  // 14.4 It files itself: what was filed today
  filed: {
    /** After the app's name on the card: "pinned · 4 filed just now", "2 filed today". */
    just: (count: number, pinned: boolean) => `${pinned ? 'pinned · ' : ''}${count} filed just now`,
    today: (count: number, pinned: boolean) => `${pinned ? 'pinned · ' : ''}${count} filed today`,
    earlier: 'earlier today',
    none: (pinned: boolean) => (pinned ? 'pinned · nothing filed today' : 'nothing filed today'),
    empty: 'Nothing jotted today yet. Whatever you add shows up here, with where it went.',
    /** A line that isn't from just now: "Groceries · 8:12". */
    whereAt: (where: string, time: string) => `${where} · ${clock(time)}`,
    undo: 'Undo',
    move: 'Move',
    undoLine: (title: string) => `Undo ${title}`,
    moveLine: (title: string) => `Move ${title}`,
    collapse: 'Fold the list',
    expand: 'Unfold the list',
    add: 'Add anything',
    moveSheet: {
      title: (title: string) => `Move “${title}”`,
      body: 'What it made is taken back, and its words are filed again as what you pick.',
      reminder: 'A reminder',
      event: 'An event',
      note: 'A note',
      list: (title: string) => `The list “${title}”`,
      /** The one it is now. */
      now: 'It is this now',
    },
  },

  // 14.6 Say it all at once
  voice: {
    label: 'What you would say',
    placeholder: 'Eggs and flour, remind me to call Mum at six…',
    /** The quiet line: what stands in for the microphone here. */
    standIn: 'On a phone you hold a mic and say it in one breath. Here, type or paste the sentence.',
    heard: (sentence: string) => `“${sentence}”`,
    edit: 'Change the sentence',
    things: (count: number) => `${capital(spelled(count))} ${count === 1 ? 'thing' : 'things'}`,
    nothing: 'Nothing to add in that yet',
    /** Under a thing: "Reminder · today 18:00 · for you". The API writes "For you"; in the middle of a line it is small. */
    who: (label: string) => small(label),
    code: 'Looks like a code · the Vault',
    leftOut: 'Left out',
    /** The big button: "Add all four", "Add three", "Add it". */
    add: (count: number, all: boolean) => (count === 0 ? 'Nothing to add' : count === 1 ? 'Add it' : `Add ${all ? 'all ' : ''}${spelled(count)}`),
    mic: 'Hold to speak',
    micLater: `The microphone comes with the phone build of ${APP}. Until then, type or paste the sentence: it comes apart the same way.`,
  },

  // 14.7 Share into it
  share: {
    untitled: 'A letter',
    paper: 'The letter',
    placeholder: 'Paste the words of a letter, a booking or a bill here',
    pick: 'Pick a text file',
    standIn: `On a phone, any app's share button hands the letter over. Here, paste its words or pick a text file, then press the share button above.`,
    open: `Share into ${APP}`,
    title: `Save to ${APP}`,
    close: 'Close',
    /** On the small picture of the letter. */
    badge: 'TXT',
    /** Under the letter's name: "12 lines · pasted". */
    about: (lines: number, from: 'file' | 'pasted') => `${plural(lines, 'line')} · ${from === 'file' ? 'from a file' : 'pasted'}`,
    read: 'Read from the letter',
    nothingRead: 'No day and no amount was found in it. The letter itself can still be kept.',
    /** A day found in it: "Class 4B is going to the caves · Fri 20 Nov, 8:00". */
    event: (title: string, day: string, time: string | null) => `${title} · ${time ? `${day}, ${clock(time)}` : day}`,
    eventNote: 'On the calendar',
    /** A day something is due by: "Sign the form by Wed 18 Nov". */
    reminder: (title: string, day: string) => `${title} by ${day}`,
    reminderNote: 'A reminder for you',
    bill: (amount: string) => `${amount} to pay`,
    billNote: (due: string) => `A bill, due ${due}`,
    keep: 'Keep the letter',
    keepNote: `${places.notes}, as its words`,
    save: (count: number) => (count === 0 ? 'Nothing to save' : `Save ${plural(count, 'thing')}`),
    saved: (count: number) => `Saved ${plural(count, 'thing')}`,
    savedNote: 'Each one is where it belongs. Press one to open it.',
    done: 'Done',
    /** A text file that couldn't be read. */
    cantRead: "That file couldn't be read as text. Paste the words instead.",
  },

  // 14.8 Every way in
  ways: {
    title: 'Jot',
    lead: 'Ways to add something without opening the app.',
    pinned: { label: 'Pinned note', note: 'A line to type in, in your notifications' },
    widgets: { label: 'Widgets', note: 'Jot, a list with ticks, Today', value: 'See them' },
    voice: { label: 'Voice', note: '“Hey Siri, jot…”, or hold any mic' },
    button: { label: 'A button on the phone', note: 'Action Button, Back Tap, a settings tile', value: 'Set up' },
    share: { label: 'Share from any app', note: 'A letter, a link, a photo, a booking' },
    email: { label: 'Forward an email', notYet: 'Not connected yet', copy: 'Copy the address', copied: 'Copied' },
    /** What opening a row says, for a screen reader. */
    open: (label: string) => `${label}. See how it looks`,
    whereTitle: 'Where a jot goes',
    buy: 'Something to buy',
    timed: 'A day or a time',
    rest: 'Anything else',
    restValue: `${places.notes} › Inbox`,
    codes: 'A code or a password',
    timedAs: { reminder: 'Reminder', event: 'Event' },
    codesGo: { ask: 'Ask first', vault: 'The Vault', note: 'A note' },
    codesNote: { ask: 'Nothing is kept until you say where', vault: 'Straight to the Vault, scrambled on your phone', note: 'Kept as a note, like anything else' },
    timedNote: { reminder: 'Something to do, with a tick', event: 'On the calendar, with a start and an end' },
    /** The sheet for where shopping goes. */
    buySheet: {
      title: 'Something to buy goes to',
      circles: "The circle's shopping list",
      circlesNote: 'Everyone adds to the same one',
    },
    /** What a row that only a phone can do says when pressed. */
    later: {
      button: {
        title: 'A button on the phone',
        body: `Once ${APP} is installed from a phone build, the phone's own settings can give it a button: the Action Button or Back Tap on an iPhone, a quick-settings tile or a long press on the icon on Android. Each opens the jot bar.`,
      },
      email: { title: 'Forward an email', body: `Receiving email isn't connected yet. When it is, each circle gets its own address here, and a booking or a bill you forward arrives as an event or a bill.` },
      rest: { title: 'Anything else', body: `Whatever isn't shopping, a day or a code becomes a note in ${places.notes}. Choosing another place for it arrives with ${places.notes}.` },
      /** Under the switches, after one is flipped where its part can't run yet. The choice itself is saved. */
      voice: `Saved. “Hey Siri, jot…” and the mics come with the phone build of ${APP}. Typing a sentence on the voice screen works now.`,
      share: `Saved. The share button in other apps comes with the phone build of ${APP}. Pasting a letter on the share screen works now.`,
      ok: 'Got it',
    },
  },

  // 14.3 A note pinned in notifications
  pinned: {
    /** The quick-settings tiles above the note. Only the last is the app's own. */
    tiles: { wifi: 'Wi‑Fi', quiet: 'Do not disturb', torch: 'Torch', jot: 'Jot' },
    jotTile: 'Jot. Open the jot bar',
    /** After the app's name: "pinned · The Linds". */
    head: (circle: string) => `pinned · ${circle}`,
    field: 'Add anything',
    send: 'Add',
    empty: 'Nothing jotted today yet.',
    switch: 'Pinned note',
    /** Under the switch, by where the app is running. */
    where: {
      browser: `The real note lives in your phone's notifications and comes with the phone build of ${APP}. What you see here is how it looks; the line above adds for real.`,
      expoGo: `The real note needs the installed ${APP} app, not Expo Go. What you see here is how it looks; the line above adds for real.`,
      android: 'On this phone it stays at the top of your notifications. If you swipe it away, it is back the next time you add something or open the app, and every morning.',
      ios: "Apple doesn't let a notification stay for ever, so it comes back after each add and every morning. Press and hold it to type.",
      blocked: `Notifications for ${APP} are off in your phone's settings, so the note can't show. Turn them on there first.`,
    },

    /** The notification itself, as the phone shows it. */
    note: {
      title: 'Jot it down',
      added: (titles: readonly string[]) => `Added: ${formatList(titles)}`,
      held: (words: string) => `“${words}” looks like a code. Open ${APP} to say where it goes.`,
      failed: "That one didn't go through. Type it again when you're back online.",
      /** One line of the note: "Milk, bread · Groceries · 8:12". */
      line: (titles: readonly string[], where: string, time: string) => `${titles.join(', ')} · ${where} · ${clock(time)}`,
      hold: (addedToday: number) => (addedToday === 0 ? 'Press and hold to type.' : `Press and hold to type. ${addedToday} added today.`),
      tap: 'Type a line here, or tap to open the jot bar.',
      type: 'Type',
      placeholder: 'Add anything',
      submit: 'Add',
      chip: (chip: string) => `+ ${chip}`,
      channel: 'Pinned note',
    },
  },

  // 14.1 Widgets on the Home Screen
  widgets: {
    title: 'Jot',
    field: 'Milk, a reminder, a thought…',
    fieldLabel: 'Type a line. Opens the jot bar',
    mic: 'Say it all at once',
    addChip: (chip: string) => `Add ${chip}`,
    added: (chip: string, where: string) => `${chip} added to ${where}`,
    left: (count: number) => `${count} left`,
    noList: 'Your shopping list shows here once something is on it.',
    shopping: 'Groceries',
    today: 'Today',
    /** "Wed 11": the day on the Today widget. */
    day: (weekday: number, day: number, month: number) => dates.dayWithWeekday(weekday, day, month).split(' ').slice(0, 2).join(' '),
    nothingNext: 'Nothing else today.',
    /** The other apps on the Home Screen: scenery. (The sister app's name is `setup.bringIn.journey.label`.) */
    apps: { own: APP, camera: 'Camera', mail: 'Mail' },
    /** The quiet line. */
    standIn: `On your Home Screen these come with the phone build of ${APP}. Here they work the same: tap a chip to add it, tick a line.`,
    lock: 'See the Lock Screen',
  },

  // 14.5 On the iPhone Lock Screen
  lock: {
    /** "Wednesday 11 November". */
    date: (weekday: number, day: number, month: number) => `${LONG_DAYS[weekday]} ${dates.dayLong(day, month)}`,
    add: 'Add something. Opens the jot bar',
    mic: 'Say it all at once',
    toBuy: 'to buy',
    toBuyLabel: (count: number, list: string) => `${count} to buy. Open ${list}`,
    /** Who is using the list, at the right of its name. */
    using: (name: string, you: boolean) => (you ? "You're using it" : `${name} is at the shop`),
    note: { title: 'Jot it down', pinned: 'pinned', open: 'Jot it down. Opens the jot bar' },
    hold: (addedToday: number) => (addedToday === 0 ? 'Press and hold to type.' : `Press and hold to type. ${addedToday} added today.`),
    use: 'Use this list on the Lock Screen',
    stop: 'Stop using this list',
    useNote: (list: string) => `${list} shows on the Lock Screen of everyone who may see it, with ticks, for eight hours.`,
    standIn: `On your Lock Screen these come with the phone build of ${APP}. Here the ticks and the buttons work the same.`,
  },

  /** A way in that only a phone has. */
  needsPhone: NEEDS_PHONE,
} as const;
