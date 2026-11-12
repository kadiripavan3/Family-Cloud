/** Words that belong to no one screen: the buttons every screen has, and how small pieces are put together. */
import { places } from '@/theme/tokens';

import { APP } from './names';
import { compact } from './plural';

export const common = {
  appName: APP,
  back: 'Back',
  close: 'Close',
  next: 'Next',
  continue: 'Continue',
  skip: 'Skip',
  notNow: 'Not now',
  signOut: 'Log out',
  tryAgain: 'Try again',
  goHome: 'Go to Home',
  showMore: 'Show more',
  keepIt: 'Keep it',
  done: 'Done',
  cancel: 'Cancel',
  ok: 'OK',
  copy: 'Copy',
  copied: 'Copied',
  /** On a row for something that is not built yet. */
  soon: 'Soon',

  /** Facts that stand side by side on one line: "Wed 15:30 · Dentist". Parts that are empty are left out. */
  join: (parts: readonly (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · '),
  /** A few lighter words after a bold line, in the same line: "Add this week · school, bins, dentist". */
  after: (rest: string) => ` · ${rest}`,
  /** 3180 becomes "3,180". */
  number: (count: number) => count.toLocaleString('en-US'),
  /** 1200 becomes "1.2k". */
  compact: (count: number) => compact(count),

  /** The tabs. Each also stands at the top of its own page. */
  tabs: { home: 'Home', people: 'People', activity: 'Activity', you: 'You' },
  /** The round + button in the middle of the tab bar. */
  add: 'Add something',
  /** The six places things live, in the order of Home's top row. What Notes is called is a setting in the tokens. */
  places: { today: 'Today', plan: 'Plan', notes: places.notes, library: 'Library', money: 'Money', vault: 'Vault' },

  // What a screen reader says
  /** A row or a card: its parts one after another, each ending its own sentence. Parts that are empty are left out. */
  spoken: (parts: readonly (string | null | undefined | false)[]) => parts.filter(Boolean).join('. '),
  /** A number over a word: "3 circles". */
  stat: (value: string | number, label: string) => `${value} ${label}`,
  /** A tab or a chip with a count after it: "Asks, 1". */
  withCount: (label: string, count: string | number) => `${label}, ${count}`,
  /** A field that opens a picker: "Start date: 3 Apr. Change". */
  fieldChange: (label: string, value: string) => `${label}: ${value}. Change`,
  /** A section's heading that opens the whole list. */
  seeAll: (title: string) => `${title}. See all`,
  stepOf: (step: number, of: number) => `Step ${step} of ${of}`,
  digitCode: (length: number) => `${length}-digit code`,
} as const;
