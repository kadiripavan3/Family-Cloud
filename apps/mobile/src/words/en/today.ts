/** 3 Home: the row of six places and what stands under it, 3.1 Today and 3.4 the + button. */
import { places } from '@/theme/tokens';

import { spelled } from './plural';

/** "any of the five of you", "either of you", "you". */
const anyOfYou = (people: number) => (people <= 1 ? 'you' : people === 2 ? 'either of you' : `any of the ${spelled(people)} of you`);

export const today = {
  // 3.1 Today
  summary: {
    /** The emoji in the ring of the summary card, by kind of circle: the calendar for a family, the kind's own among equals. */
    emoji: { family: '📅', couple: '❤️', flat: '🏠', crew: '🤝', solo: '📅' },
    /** The bold line of the card: the first things of the day by their titles. */
    headline: (titles: readonly string[], more: number) => {
      if (titles.length === 0) return 'Nothing on today';
      const named = titles.join(', ');
      return more > 0 ? `${named} and ${more} more` : named;
    },
    counts: (left: number, done: number) => {
      if (left === 0 && done === 0) return 'Nothing due, nothing to tick';
      const todo = left === 0 ? 'Nothing left today' : left === 1 ? '1 thing left today' : `${left} things left today`;
      return done > 0 ? `${todo} · ${done} done` : todo;
    },
  },
  done: 'Done',
  notDone: 'Not done yet',
  /** Above the rail of what is new. */
  fresh: 'New in the library',

  /** 13.3 A brand-new circle: nothing on Today yet. */
  empty: {
    title: (circle: string) => `${circle} is ready`,
    body: (people: number) => (people <= 1 ? 'Nothing here yet. Whatever you add will show up on Today.' : `Nothing here yet. Whatever ${anyOfYou(people)} adds will show up on Today.`),
    /** Three ways to put the first thing in, by kind of circle: the address each one opens, and its words. */
    shortcuts: {
      family: [
        { emoji: '📅', to: 'event', label: 'Add this week', rest: 'school, bins, dentist' },
        { emoji: '✅', to: 'checklist', label: 'Start the shopping list', rest: 'everyone can tick it' },
        { emoji: '📝', to: 'note', label: 'Write the house manual', rest: 'the Wi‑Fi, the bins, the boiler' },
      ],
      couple: [
        { emoji: '📅', to: 'event', label: 'Plan a date', rest: 'something for the two of you' },
        { emoji: '✅', to: 'checklist', label: 'Start a list', rest: 'groceries, or someday' },
        { emoji: '📝', to: 'note', label: 'Write the first note', rest: 'who pays what?' },
      ],
      flat: [
        { emoji: '🧾', to: 'bill', label: 'Add a bill', rest: 'rent, power, internet' },
        { emoji: '✅', to: 'checklist', label: 'Start the cleaning rota', rest: 'everyone can tick it' },
        { emoji: '📝', to: 'note', label: 'Write the house rules', rest: 'agreed by everyone' },
      ],
      crew: [
        { emoji: '📷', to: 'photos', label: 'Add the photos', rest: "everyone's, in one album" },
        { emoji: '🧾', to: 'bill', label: 'Split what you paid', rest: 'scan a receipt' },
        { emoji: '📅', to: 'event', label: 'Plan the next one', rest: 'pick a date together' },
      ],
      solo: [
        { emoji: '📝', to: 'note', label: 'Write a note', rest: 'yours alone' },
        { emoji: '✅', to: 'checklist', label: 'Start a list', rest: 'tick it as you go' },
        { emoji: '🔑', to: 'password', label: 'Keep your first password', rest: 'the Wi‑Fi?' },
      ],
    },
  },

  /** A place that is shut for the youngest in a family: Money and the Vault for a teen or a child. */
  shut: {
    title: (place: string) => `${place} is shut for you`,
    body: (place: string, circle: string) => `In ${circle}, ${place} is for the adults. Ask one of them if you need something from it.`,
  },

  // 3.4 The + button: the ways to add something, wherever you are in the app
  plus: {
    title: 'Add something',
    typeIt: 'Type it: “Haircut for Leo, Saturday 10”',
    typeItLabel: 'Type what to add',
    typeItLater: 'Typing a sentence that files itself arrives with Plan. Pick one of the ten below for now.',
    /** The ten things it makes, by the last part of the address each one opens ("/new/note"). */
    things: { note: 'Note', checklist: 'Checklist', photos: 'Photos', scan: 'Scan', event: 'Event', reminder: 'Reminder', bill: 'Bill', sheet: 'Sheet', password: 'Password', goal: 'Goal' },
    goesInto: 'Goes into',
    seenBy: 'seen by',
    /** The pill that changes who the new thing starts as seen by, for a screen reader. */
    seenByLabel: (who: string) => `Seen by ${who}. Change`,
  },

  /** What Notes is called, for the shortcuts that lead there. */
  notesPlace: places.notes,
} as const;
