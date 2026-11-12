/**
 * 5 Notes: the gallery of templates (5.6), what every board shares (its bar, its menu, sound), and Notes'
 * own three templates that do work: the weekly meal plan (5.7), the chore wheel (5.8), the time capsule (5.9).
 * A template built in another place keeps its words in that place's own catalog file.
 */
import { APP } from './names';

export const templates = {
  // 5.6 Templates: the gallery
  gallery: {
    title: 'Templates',
    search: 'Search templates',
    closeSearch: 'Close search',
    /** The small mark on a template that does work. */
    live: 'LIVE',
    chips: {
      /** "All 53": templates and keepsakes together. */
      all: (count: number) => `All ${count}`,
      keepsakes: 'Keepsakes',
      fairAndFun: 'Fair and fun',
      /** A kind of circle's own templates, first in its gallery. */
      yours: { family: 'For families', couple: 'For two', flat: 'For a flat', crew: 'For friends', solo: 'For you' },
      topics: { home: 'Home', kids: 'Kids', food: 'Food', money: 'Money', trips: 'Trips', landlord: 'Landlord', together: 'Together', memories: 'Memories' },
    },
    /** A card, for a screen reader: its name, that it does work, its line. */
    card: (name: string, line: string, live: boolean) => [name, live ? 'Does work for you' : null, line].filter(Boolean).join('. '),
    noMatch: { title: 'Nothing by that name', body: (typed: string) => `No template has “${typed}” in its name or its line. Try another word.` },
    empty: { title: 'Nothing here yet', body: 'This shelf is empty for now.' },

    // The sheet a card opens
    start: {
      /** Above what a plain template makes. */
      makes: 'Starting it makes',
      /** Under it: who sees what it makes to begin with. `startsAs` is the kind's own words: "Only you, until shared". */
      startsAs: (startsAs: string) => `It starts as: ${startsAs}. You can change that afterwards.`,
      /** A template that does work. */
      liveNote: 'This one does work for you: it keeps itself up to date as you use it.',
      /** Boards of this template the circle has already. `circle` is the circle's name. */
      already: (circle: string) => `In ${circle} already`,
      button: 'Start',
      another: 'Start another',
      /** A template whose rules aren't in the API yet: under the API's own "Coming with the next update". */
      notReady: "It can't be started yet. Every template without this note can.",
    },
  },

  // What every board shares
  board: {
    more: 'More',
    send: 'Add',
    ok: 'OK',
    notYet: 'Not yet',
    menu: { audience: 'Who can see this', rename: 'Rename', delete: 'Delete' },
    rename: { title: 'Rename', label: 'Name', save: 'Save' },
    delete: {
      title: (name: string) => `Delete “${name}”?`,
      body: "Everything in it goes too, for everyone who can see it. This can't be undone.",
      confirm: 'Delete it',
    },
    /** A board whose template has no screen in this version of the app. */
    toCome: `This one arrives with the next update of ${APP}. Everything in it is kept, and it opens here as soon as the update is in.`,
  },

  // Recordings: the microphone, and playing one back
  sound: {
    add: 'Add a recording',
    remove: 'Take the recording off',
    /** A recording that is attached to what is being written, with its length ("0:06"). */
    attached: (length: string) => `Recording attached · ${length}`,
    /** "0:06", "3:12": how long a recording is, as a clock. */
    clock: (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    /** "2 min 14 s", "48 s": how long a recording is, in words. */
    length: (seconds: number) => (seconds < 60 ? `${seconds} s` : seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`),
    stop: (label: string) => `Stop. ${label}`,
    /** On a phone, until the phone build brings its own audio. */
    cantRecord: 'Recording with the microphone arrives with the phone app. Until then, type the words. In a browser you can pick a sound file.',
    cantPlay: 'Playing a recording back arrives with the phone app. It is kept safe, and it plays in a browser today.',
    unreachable: "The recording couldn't be uploaded. Check your connection and try again.",
    failed: "The recording couldn't be uploaded. Try again.",
  },

  // 5.7 The weekly meal plan
  mealPlan: {
    /** An empty day. */
    slot: 'Drop a recipe here',
    /** The same while a recipe was tapped and waits for a day. */
    slotFor: (recipe: string) => `Drop ${recipe} here`,
    /** The line under a dinner: "Tonight · 30 min", "40 min · Makes two dinners", "From the calendar". */
    mealLine: (meal: { tonight: boolean; minutes: number | null; note: string | null; fromCalendar: boolean }) =>
      [meal.tonight ? 'Tonight' : null, meal.minutes ? `${meal.minutes} min` : null, meal.note, meal.fromCalendar ? 'From the calendar' : null].filter(Boolean).join(' · '),
    recipe: {
      /** A recipe chip, for a screen reader. */
      spoken: (name: string, chosen: boolean) => (chosen ? `${name}. Chosen: tap a day to plan it` : `${name}. Plan it`),
      /** Under the chips once one was tapped. */
      hint: (name: string) => `Now tap the day for ${name}.`,
    },
    groceries: {
      on: (going: number) => (going === 1 ? '1 ingredient goes to Groceries' : `${going} ingredients go to Groceries`),
      off: (going: number) => (going === 1 ? '1 ingredient stays on the plan' : `${going} ingredients stay on the plan`),
      notAtHome: (atHome: number) => (atHome === 1 ? 'Not the one you ticked as “at home”' : `Not the ${atHome} you ticked as “at home”`),
      noneAtHome: 'Open a dinner to tick what you have at home',
      offNote: 'Switch it on and they go to your shopping list',
      toggle: 'Send ingredients to Groceries',
      open: 'Open the Groceries list',
    },
    cookingFor: { label: 'Cooking for', spoken: (people: number) => `Cooking for ${people}`, fewer: 'Cook for one fewer', more: 'Cook for one more' },
    menu: { next: 'Next week', previous: 'The week before', thisWeek: 'Back to this week' },
    // A dinner written by hand
    add: {
      title: (weekday: string) => `Dinner on ${weekday}`,
      name: 'What is it?',
      minutes: 'Minutes to make',
      cook: 'Who cooks',
      ingredients: 'What it needs, one per line',
      ingredientsNote: 'They go to Groceries, minus what you tick as at home.',
      keep: 'Keep it as a recipe for other weeks',
      save: 'Add to the plan',
    },
    // A dinner, opened
    meal: {
      cooks: (name: string) => `${name} cooks`,
      nobodyCooks: 'Nobody cooks yet',
      ingredients: 'What it needs',
      noIngredients: 'Nothing yet. Add what it needs below.',
      atHome: 'At home already',
      atHomeNote: "Tick what you have at home. It stays off the shopping list.",
      addIngredient: 'Add an ingredient',
      remove: 'Take it off the plan',
    },
  },
} as const;
