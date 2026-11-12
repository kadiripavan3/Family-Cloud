/** 4.3 and 4.4 Who can see a thing: the small chip on every thing, and the one sheet behind it. */
import { formatList, spelled } from './plural';

export const sharing = {
  // The chip
  chip: {
    onlyYou: 'Only you',
    /**
     * Shared with some people: "Alex and you", "Alex, Mia and you", "Alex and 3 more". `others` are the first
     * names of everyone it is shared with, except the person reading.
     */
    some: (others: readonly string[]) => {
      if (others.length === 0) return 'Only you';
      if (others.length > 2) return `${others[0]} and ${others.length - 1} more`;
      return `${others.join(', ')} and you`;
    },
    /** Shared with the person reading, by someone else, and with nobody else they know of. */
    withYou: 'Shared with you',
    /** Hidden from someone today: "Not Mia", "Not Mia or Leo". */
    not: (names: readonly string[]) => `Not ${formatList(names, 'or')}`,
    /** What a screen reader says for a chip that opens the sheet. */
    spoken: (label: string) => `Seen by: ${label}. Change who can see this`,
    /** And for one that only says who sees it. */
    spokenQuiet: (label: string) => `Seen by: ${label}`,
  },

  // The sheet
  sheet: {
    title: 'Who can see this?',
    /** Under the title: “Wi‑Fi and smart home”, a page in The Linds. `aKind` is "a page" (`things.kind`). */
    about: (title: string, aKind: string, circle: string) => `“${title}”, ${aKind} in ${circle}`,
    onlyYou: { label: 'Only you', note: 'Nobody else, not even in search' },
    some: { label: 'Some people', note: 'Pick who, and what each can do' },
    /** Under "Everyone in The Linds": how many that is today. Pets don't count. */
    everyoneNote: (people: number) => {
      if (people <= 1) return 'Just you for now, and anyone who joins later';
      if (people === 2) return 'Both of you, and anyone who joins later';
      return `All ${spelled(people)}, and anyone who joins later`;
    },
    /** What one person may do. */
    access: { edit: 'Can edit', view: 'Can view', none: "Can't see it" },
    /** A person's row, for a screen reader: "Alex: Can edit. Change". */
    person: (name: string, access: string) => `${name}: ${access}. Change`,
    /** The same for someone who can only look at the sheet. */
    personQuiet: (name: string, access: string) => `${name}: ${access}`,
    /** With everyone: whether they may all change it, or only look. */
    everyoneEdits: { label: 'Everyone can change it', note: 'Off: they can look, and only you can change it' },

    // Hidden from one person, for a while or for good
    hidden: 'Hidden',
    hiddenUntil: (day: string) => `Hidden until ${day}`,
    hide: (name: string) => `Hide it from ${name}`,
    hideNote: (name: string) => `Not in ${name}'s search, Activity or calendar, until the day you pick.`,
    showAgain: (name: string) => `Show it to ${name} again`,
    until: 'Hidden until',
    untilTitle: (name: string) => `Hidden from ${name} until`,
    noEnd: 'Until you change it',

    done: 'Done',
    /** For someone who can see the thing but didn't make it. */
    notYours: 'Only the person who made this can change who sees it.',
    /** "Some people" with nobody picked. */
    pickSomeone: 'Pick at least one person, or choose Only you.',
  },

  /** A page that is hidden from someone today: the note under its title. */
  surprise: {
    title: (names: readonly string[], until: string | null) => (until ? `Hidden from ${formatList(names, 'and')} until ${until}` : `Hidden from ${formatList(names, 'and')}`),
    /** `opens` when there is a day it ends. */
    body: (opens: boolean) => (opens ? 'Not in their search, their Activity or their calendar. It opens to them the morning after.' : 'Not in their search, their Activity or their calendar, until you change it.'),
  },
} as const;
