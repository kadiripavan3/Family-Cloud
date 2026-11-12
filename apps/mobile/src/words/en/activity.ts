/** 11 Activity: who added what, what is due and who is asking; answering an ask; the Sunday summary. */
import { APP, JOURNEY } from './names';

export const activity = {
  // 11.1 Activity
  /** The chips under the title, by the name the API gives each. */
  filters: { all: 'All', asks: 'Asks', photos: 'Photos', money: 'Money', plan: 'Plan' },
  /** The labels over the lines. */
  groups: { today: 'Today', week: 'Earlier this week', earlier: 'Earlier' },
  /** The Activity tab while something is new, for a screen reader. */
  tabWithNews: (tab: string) => `${tab}, something new`,
  /** "Mon 18:02": a day of this week and its time. */
  weekdayAt: (weekday: string, time: string) => `${weekday} ${time}`,
  /**
   * The small line under a sentence: when it happened, then the API's own note ("12 min ago · for today
   * only"). A template's line names its board first ("Chore wheel · 7:40"). Something due has no time.
   */
  under: (when: string | null, note: string | null | undefined, boardFirst: boolean) => (boardFirst ? [note, when] : [when, note]).filter(Boolean).join(' · '),
  /** Said before a line that is new, for a screen reader. */
  fresh: 'New',
  /** Nothing under a chip. */
  empty: {
    all: { emoji: '🔔', title: 'Nothing has happened yet', body: (circle: string) => `What is added and changed in ${circle}, what is due and who is asking shows up here. Things you can't see never do.` },
    asks: { emoji: '🔑', title: 'Nobody is asking', body: (_circle: string) => 'When someone asks to see something of yours, you answer it here.' },
    photos: { emoji: '📷', title: 'No new photos', body: (_circle: string) => 'Photos and videos that are added show up here, a batch at a time.' },
    money: { emoji: '🧾', title: 'Nothing about money', body: (_circle: string) => 'Bills that are due and what was paid show up here.' },
    plan: { emoji: '📅', title: 'Nothing about plans', body: (_circle: string) => 'What is due, and the lists and plans that changed, show up here.' },
  },

  /** The sheet behind the gear. */
  sheet: {
    open: 'Activity settings',
    title: (circle: string) => `Activity in ${circle}`,
    mute: { label: (circle: string) => `Mute ${circle}`, note: 'Nothing that happens here is sent to your phone. Activity still shows it all.' },
    summary: { label: 'The Sunday summary', note: 'Last week on one page' },
    notifications: { label: 'Notification settings', note: 'What your phone tells you about' },
  },

  /** A button on a line, for a screen reader: "Pay. Electricity is due tomorrow, €84.20". */
  buttonSpoken: (label: string, sentence: string) => `${label}. ${sentence}`,
  /** A bill's button once it is marked as paid. */
  paid: 'Paid',

  // Answering an ask to see something in the Vault
  answer: {
    /** Under the question: how long they asked for (the API's own words), and what allowing does. */
    what: (asker: string, note: string | null | undefined) => {
      const does = `Allowing makes a key on this phone that opens it for ${asker}. Nobody at ${APP} can do that for you.`;
      return note ? `${note.charAt(0).toUpperCase()}${note.slice(1)}. ${does}` : does;
    },
    allow: 'Allow',
    decline: 'Not now',
    /** The Vault is locked: it has to be unlocked on this phone first. */
    locked: { title: 'Unlock the Vault to allow it', body: 'Only your phone can make the key. Unlock, and it carries on by itself.' },
    working: 'Making a key for them',
    /** Why it can't be allowed from here. */
    sample: 'This is a sample item. It was never scrambled, so there is nothing to open for anyone. Add your own to see the real thing.',
    noVault: (asker: string) => `${asker} hasn't set up their Vault yet, so nothing can be sealed for them. They can ask again once they have.`,
    notSetUp: 'Set up your Vault first: without it this phone has no key to share with.',
    gone: 'That question was answered or taken back already.',
    /** After the answer, on the line's own place. */
    allowed: (asker: string) => `${asker} can open it now`,
    declined: (asker: string) => `${asker} was told: not now`,
  },

  // Asking to see something you can't open, on the thing's own page
  ask: {
    button: 'Ask to see it',
    /** The sheet that asks. */
    title: (title: string) => `Ask to see “${title}”`,
    lead: (owner: string) => `${owner} gets the question in Activity and on their phone, and answers it there. The notification doesn't name the item.`,
    ways: {
      today: { label: 'For today only', note: 'It stops working for you at midnight' },
      once: { label: 'For one look', note: 'Gone for you after you open it once' },
      open: { label: 'Until they take it back', note: 'The way things are usually shared' },
    },
    send: (owner: string) => `Ask ${owner}`,
    /** Where a question stands, on the thing's page. */
    waiting: (owner: string, when: string) => `You asked ${owner} ${when}. They haven't answered yet.`,
    withdraw: 'Take the question back',
    declined: (owner: string) => `${owner} said not now. You can ask again another time.`,
  },

  // 11.3 The Sunday summary
  digest: {
    title: 'Your week',
    /** "The Linds · 2 to 8 Nov" */
    under: (circle: string, range: string) => `${circle} · ${range}`,
    settings: 'Summary settings',
    nextWeek: 'Next week',
    /** A quiet week. */
    quiet: { title: 'A quiet week', body: (circle: string, range: string) => `Nothing was added, done or paid in ${circle} from ${range}. Nothing is sent for a week like that.` },
    /** The numbers, for a screen reader: "86 photos". */
    stat: (figure: string, label: string) => `${figure} ${label}`,
    /** The sheet behind the gear: the two switches of the summary. */
    sheet: {
      title: 'The Sunday summary',
      lead: `Once a week, each of your circles on one page. ${JOURNEY}'s news joins the same summary once the two apps are linked.`,
      push: { label: 'Send it to my phone', note: 'On Sunday, for a week with something in it' },
      email: { label: 'Also send it by email', note: 'To the address you sign in with' },
    },
  },
} as const;
