/** Things of any kind, in lists of mixed kinds; and the two simplest things, a page and a list. */
import { APP } from './names';

/** A kind of thing, by the name the API gives it. A kind that is missing here is called "a thing" until its place adds a line. */
const KINDS: Record<string, { name: string; a: string }> = {
  page: { name: 'Page', a: 'a page' },
  checklist: { name: 'List', a: 'a list' },
  event: { name: 'Event', a: 'an event' },
  reminder: { name: 'Reminder', a: 'a reminder' },
  goal: { name: 'Goal', a: 'a goal' },
  photo: { name: 'Photo', a: 'a photo' },
  video: { name: 'Video', a: 'a video' },
  file: { name: 'File', a: 'a file' },
  document: { name: 'Document', a: 'a document' },
  album: { name: 'Album', a: 'an album' },
  moment: { name: 'Moment', a: 'a moment' },
  bill: { name: 'Bill', a: 'a bill' },
  sheet: { name: 'Sheet', a: 'a sheet' },
  split: { name: 'Shared costs', a: 'a split of shared costs' },
  vault_item: { name: 'Vault item', a: 'something in the Vault' },
  password: { name: 'Password', a: 'a password' },
  keepsake: { name: 'Keepsake', a: 'a keepsake' },
};

export const things = {
  /** What a kind of thing is called: `name` on its own ("Page"), `a` in a sentence ("a page"). */
  kind: (kind: string | null | undefined) => KINDS[kind ?? ''] ?? { name: 'Thing', a: 'a thing' },
  untitled: 'Untitled',

  /** A row in a list, for a screen reader: its title, what kind it is, where it stands. */
  row: (title: string, kind: string, line: string | null | undefined) => [title, kind, line].filter(Boolean).join('. '),

  // The screen for a thing whose own screen isn't built yet
  toCome: {
    /** `aKind` is "a sheet", `place` is "Money". */
    body: (aKind: string, place: string | null) =>
      place ? `This is ${aKind}. It opens here once ${place} is built in ${APP}.` : `This is ${aKind}. It opens here once its part of ${APP} is built.`,
  },

  /** Who a new thing starts as seen by, on the forms that make one. */
  seenBy: 'Seen by',
  more: 'More',
  save: 'Save',
  linked: 'Linked',
  /** Leaving with something typed and not saved. */
  discard: { title: 'Leave without saving?', body: "What you typed isn't saved yet.", confirm: 'Leave', cancel: 'Keep writing' },

  // A page
  page: {
    title: 'Title',
    titlePlaceholder: 'Title',
    body: 'Words',
    bodyPlaceholder: 'Write something',
    edited: (ago: string) => `Edited ${ago}`,
    viewOnly: 'You can read this page, but not change it.',
    delete: 'Delete page',
    deleteAsk: { title: 'Delete this page?', body: 'It is gone for everyone it was shared with. This can’t be undone.', confirm: 'Delete page' },
    new: 'New note',
    create: 'Save',
  },

  // A list
  list: {
    title: 'Name of the list',
    titlePlaceholder: 'Groceries',
    lines: 'Lines to start with',
    linesNote: 'One line each. You can add more later.',
    linesPlaceholder: 'Milk\nBread\nApples',
    left: (left: number, all: number) => (all === 0 ? 'Nothing on it yet' : left === 0 ? `All ${all} done` : `${left} left of ${all}`),
    add: 'Add a line',
    addButton: 'Add',
    tick: (text: string) => `Tick ${text}`,
    untick: (text: string) => `Untick ${text}`,
    line: (text: string) => `${text}. More`,
    remove: 'Remove this line',
    empty: 'Nothing on this list yet. Add the first line below.',
    viewOnly: 'You can read this list, but not change it.',
    clearDone: 'Clear the ticked lines',
    delete: 'Delete list',
    deleteAsk: { title: 'Delete this list?', body: 'It is gone for everyone it was shared with. This can’t be undone.', confirm: 'Delete list' },
    new: 'New checklist',
    create: 'Save',
  },
} as const;
