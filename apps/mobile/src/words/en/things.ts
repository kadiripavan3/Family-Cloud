/** Things of any kind, in lists of mixed kinds: what each kind is called, and the screen for a kind that isn't built yet. */
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
} as const;
