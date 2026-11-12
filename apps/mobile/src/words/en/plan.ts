/** 7 Plan: the calendar, events, reminders, goals, and "Type it" (7.4), the line that is read as you write. */
import { mark } from '../rich';
import { formatList, plural } from './plural';

type Unit = 'day' | 'week' | 'month' | 'year';
type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
/** How often something comes round, as the API keeps it. */
type Repeat = { unit: Unit; every?: number | null; days?: readonly Weekday[] | null };

const WEEK: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const FULL: Record<Weekday, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const BRIEF: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

/** "1 hour", "90 minutes", "2 days", "1 week". */
function span(minutes: number): string {
  if (minutes % 10080 === 0) return plural(minutes / 10080, 'week');
  if (minutes % 1440 === 0) return plural(minutes / 1440, 'day');
  if (minutes % 60 === 0) return plural(minutes / 60, 'hour');
  return plural(minutes, 'minute');
}

/** "Every day", "Every other week", "Every 3 months". */
function everyUnit(every: number, one: string): string {
  return every === 1 ? `Every ${one}` : every === 2 ? `Every other ${one}` : `Every ${every} ${one}s`;
}

/** In a few words, the way the API says it: "Every day", "Weekdays", "Thursdays", "Tue and Fri", "Every other Thursday", "Every month". */
function repeatLabel(repeat: Repeat): string {
  const every = repeat.every && repeat.every > 0 ? repeat.every : 1;
  if (repeat.unit !== 'week') return everyUnit(every, repeat.unit);
  const on = WEEK.filter((day) => (repeat.days ?? []).includes(day));
  if (on.length === 0) return everyUnit(every, 'week');
  if (every === 1) {
    if (on.length === 7) return 'Every day';
    if (on.join() === 'mon,tue,wed,thu,fri') return 'Weekdays';
    if (on.join() === 'sat,sun') return 'Weekends';
    return on.length === 1 ? `${FULL[on[0]!]}s` : formatList(on.map((day) => BRIEF[day]));
  }
  if (on.length === 1) return every === 2 ? `Every other ${FULL[on[0]!]}` : `Every ${every} weeks on ${FULL[on[0]!]}`;
  return `${everyUnit(every, 'week')} on ${formatList(on.map((day) => BRIEF[day]))}`;
}

export const plan = {
  // 7.1 Plan, under Home's row of six: one list for the day
  home: {
    /** The three doors under the row of places. */
    doors: { month: 'Month', reminders: 'Reminders', goals: 'Goals' },
    /** Above what was due before today and is still open. */
    overdue: { title: 'Still to do', since: 'from earlier' },
    /** Under an overdue line: "Was due Mon 9 Nov". */
    wasDue: (day: string) => `Was due ${day}`,
    nothingOn: 'Nothing on this day.',
    empty: { title: 'Nothing planned yet', body: 'Events, jobs and bills that are due show up here, one day at a time. The + button adds one.' },
    /** A day in the strip of seven, for a screen reader: "Wed 11 Nov, today". */
    weekDay: (day: string, isToday: boolean) => (isToday ? `${day}, today` : day),
  },

  /** One line of a day: an event, a job with a tick, something another place brought. */
  entry: {
    /** A row, for a screen reader: "15:30. Dentist · Mia. Trubarjeva 12". */
    spoken: (lead: string | null | undefined, title: string, note: string | null | undefined) => [lead, title, note].filter(Boolean).join('. '),
    /** The tick of a job, for a screen reader: "Take the bins out, Thu 12 Nov". */
    tick: (title: string, day: string) => `${title}, ${day}`,
    pay: 'Pay',
  },

  /** "Coming up" on a person's page: what the calendar holds for them in the next two weeks. */
  coming: {
    /** "Today 15:30", "Fri 4 Dec": the day and, when it has one, the time. */
    when: (day: string, time: string | null | undefined) => (time ? `${day} ${time}` : day),
    nothing: 'Nothing in the next two weeks.',
  },

  // 7.2 Month
  month: {
    everyone: 'Everyone',
    you: 'You',
    newEvent: 'New event',
    nothingOn: 'Nothing on this day.',
    /** A day in the grid, for a screen reader: "14 November 2026, today". */
    day: (day: string, isToday: boolean) => (isToday ? `${day}, today` : day),
  },

  // 7.3 An event
  event: {
    share: 'Share',
    more: 'More',
    cover: (title: string) => `The picture of ${title}`,
    allDay: 'All day',
    /** When it runs over several days: "Sat 5 Dec to Sun 6 Dec". */
    days: (from: string, to: string) => `${from} to ${to}`,
    /** Under the title, when it comes round again: "Thursdays · next on Thu 19 Nov". */
    repeats: (label: string, next: string | null) => (next ? `${label} · next on ${next}` : label),
    /** "Reminds you 1 hour before". `label` is the API's ("1 hour before", "at the time"). */
    reminds: (label: string) => `Reminds you ${label}`,
    answer: 'Your answer',
    answers: { going: 'Going', maybe: 'Maybe', cant: "Can't" },
    /** "9 going · 2 haven't answered", with the first part in bold. */
    going: (going: number, maybe: number, unanswered: number) => [
      mark('bold', `${going} going`),
      ...(maybe > 0 ? [` · ${maybe} maybe`] : []),
      ...(unanswered > 0 ? [unanswered === 1 ? " · 1 hasn't answered" : ` · ${unanswered} haven't answered`] : []),
    ],
    goingSpoken: (going: number, unanswered: number) => `${going} going, ${unanswered} not answered yet. See who is coming`,
    forThis: 'For this event',
    notes: 'Notes',

    // What an event gathers: a list, a budget, an album
    checklist: { add: 'Add a to-do list', note: 'What has to be done before it', title: (event: string) => `${event}: to do` },
    budget: { add: 'Add a budget', note: 'What it may cost, and what is spent', title: (event: string) => `${event}: budget` },
    album: {
      title: (event: string) => `${event}: album`,
      add: 'An album for it',
      note: 'Photos taken there land in it',
      /** The switch, for a screen reader. */
      switch: 'An album for this event',
      /** After switching it on in a browser. */
      made: "The album is made and linked. Filling it by itself with what is photographed there is the phone app's part.",
      off: 'The album is no longer linked to this event. It is still in the Library.',
    },
    copied: 'Copied, ready to paste into a message',
    notCopied: "This browser didn't let us copy it.",
    /** What Share hands over: "Mia's 10th birthday party · Sat 5 Dec · 14:00 to 17:00 · At home". */
    shared: (parts: readonly (string | null | undefined)[]) => parts.filter(Boolean).join(' · '),

    // The menu behind the three dots
    menu: { title: 'This event', change: 'Change', guests: "Who's coming", photo: 'Choose a picture', removePhoto: 'Take the picture off', delete: 'Delete event' },
    delete: { title: 'Delete this event?', body: 'It goes for everyone who can see it. Its lists and albums stay.', confirm: 'Delete event' },
    photoProblem: "We couldn't open your photos. Check that the app may see them.",

    // Who is coming
    guests: {
      title: "Who's coming",
      you: 'You',
      /** After a name: what they do there. "Alex is taking her". */
      part: (name: string, part: string) => `${name} ${part}`,
      answers: { going: 'Going', maybe: 'Maybe', cant: "Can't come", none: "Hasn't answered" },
      /** A row, for a screen reader: "Alex: Going. Change". */
      row: (name: string, answer: string) => `${name}: ${answer}. Change`,
      rowQuiet: (name: string, answer: string) => `${name}: ${answer}`,
      answerFor: (name: string) => `What did ${name} say?`,
      remove: 'Take off the event',
      add: 'Add someone',
      everyoneIsOn: 'Everyone in the circle is on it already.',
      outside: 'Someone from outside the circle',
      name: 'Their name',
      addName: 'Add',
    },
  },

  /** The form for a new event and for changing one. */
  eventForm: {
    newTitle: 'New event',
    changeTitle: 'Change the event',
    add: 'Add',
    typeIt: 'Or type it: “Haircut for Leo, Saturday 10”',
    title: 'What is it?',
    titlePlaceholder: "Dinner at Grandma Astrid's",
    when: 'When',
    where: 'Where',
    wherePlaceholder: 'At home',
    who: "Who's coming",
    whoNote: 'The first one you pick is who it is for.',
    nobody: 'Nobody yet',
    remind: 'Remind you',
    repeat: 'Repeats',
    notes: 'Notes',
    notesPlaceholder: 'Bring the cookies',
    needsTitle: 'Give it a name first.',
  },

  /** Reminding ahead of time: the choices, and how each is said. */
  remind: {
    title: 'Remind you',
    none: 'No reminder',
    /** "At the time", "10 minutes before", "1 hour before", "1 day before". */
    before: (minutes: number) => (minutes <= 0 ? 'At the time' : `${span(minutes)} before`),
  },

  /** How often something comes round. */
  repeat: {
    title: 'Repeats',
    none: "Doesn't repeat",
    label: repeatLabel,
    units: { day: 'Every day', week: 'Every week', month: 'Every month', year: 'Every year' },
    onDays: 'On these days',
    /** One letter for each day of the week, Monday first, and its name for a screen reader. */
    days: WEEK.map((day) => ({ letter: FULL[day][0]!, name: FULL[day] })),
  },

  /** Picking a day and a time. */
  when: {
    title: 'When',
    day: 'Day',
    noDay: 'No day yet',
    pickDay: 'Pick the day',
    starts: 'Starts',
    ends: 'Ends',
    time: 'Time',
    timePlaceholder: '9:30',
    /** Under a box where a time is typed. */
    timeNote: 'Write it as 9:30, 14:00 or 7pm. Leave it empty for no time.',
    readAs: (time: string) => `Read as ${time}`,
    timeProblem: 'Write a time like 9:30, 14:00 or 7pm.',
    endsBefore: "It can't end before it starts.",
    endNeedsStart: 'Say when it starts first.',
    removeDay: 'No day',
  },

  /** Picking people of the circle. */
  people: {
    you: 'You',
    nobody: 'Nobody in particular',
  },

  // 7.4 Type it
  quick: {
    title: 'New',
    add: 'Add',
    placeholder: 'Haircut for Leo Saturday at 10, remind me an hour before',
    field: 'What to add',
    hint: "Write it the way you'd say it. The day, the time, who it is for and who to remind are read as you type, and you can fix any of it.",
    reading: 'Reading…',
    readAs: 'Read as',
    in: 'in',
    /** What a line was read as. */
    as: { event: 'An event', reminder: 'A reminder', list_item: 'A line on a list', note: 'A note', code: 'A code' },
    /** The chip that says what it was read as, for a screen reader, when pressing it changes it. */
    asSpoken: (kind: string) => `Read as: ${kind}. Change`,
    asTitle: 'What is it?',
    asChoices: {
      event: { label: 'An event', note: 'On the calendar, with a start and an end' },
      reminder: { label: 'A reminder', note: 'A job with a tick, for you or for someone else' },
    },
    /** One row of the reading, for a screen reader: "Sat 14 Nov · 10:00 to 10:30. Change". */
    piece: (label: string) => `${label}. Change`,
    noDay: 'No day yet',
    /** "For Leo", "Given to Alex", "With Alex", "About Leo". */
    who: {
      for: (name: string) => `For ${name}`,
      given_to: (name: string) => `Given to ${name}`,
      with: (name: string) => `With ${name}`,
      about: (name: string) => `About ${name}`,
    },
    forYou: 'For you',
    noOne: 'For nobody in particular',
    whoTitle: 'Who is it for?',
    /** "Remind you · 1 hour before". */
    remind: (label: string) => `Remind you · ${label}`,
    noRemind: 'No reminder',
    noRepeat: "Doesn't repeat",
    placeTitle: 'Where',
    placeField: 'Where',
    noPlace: 'No place',
    /** A line that goes onto a list. */
    list: (list: string, quantity: string | null | undefined) => (quantity ? `Goes on ${list} · ×${quantity}` : `Goes on ${list}`),
    listUnnamed: 'Goes on your shopping list',
    note: 'Kept as a page in Notes',
    letter: 'This is long, so it is kept whole as a page in Notes.',
    /** Something that looks like a secret is never filed by a line. */
    code: { title: 'This looks like a code or a password', body: "It isn't saved from here. Keep it in the Vault, where it is scrambled on your phone." },
    discard: { title: 'Throw this away?', body: "What you've typed isn't added yet.", confirm: 'Throw away', keep: 'Keep typing' },
  },

  // 7.5 Reminders
  reminders: {
    title: 'Reminders',
    add: 'New reminder',
    tabs: { yours: 'Yours', asked: 'You asked', done: 'Done' },
    someTime: 'Some time',
    askedSomeone: 'You asked someone',
    atAPlace: 'When someone is there',
    /** Under the ones that wait for a place: the phone watches the place, and a browser can't. */
    placeNote: {
      phone: 'Your phone watches for these places and reminds whoever is there.',
      browser: "In the phone app, the phone watches for these places and reminds whoever is there. A browser can't, so here they wait until someone ticks them.",
    },
    nudge: 'Nudge',
    /** A nudge, for a screen reader: "Nudge Alex about Book the car service". */
    nudgeSpoken: (names: string, title: string) => `Nudge ${names} about ${title}`,
    nudgeSent: (names: string) => `A gentle nudge is on its way to ${names}.`,
    doneMark: 'Done',
    /** Nothing under a tab. */
    empty: {
      yours: { title: 'Nothing to do', body: 'Jobs with a tick land here: yours by day, and the ones that wait for a place.' },
      asked: { title: 'Nothing asked', body: 'Give a reminder to someone and you see here whether it is done.' },
      done: { title: 'Nothing ticked yet', body: 'What you and the others tick off is kept here.' },
    },
    /** A ticked one in the Done tab: "12 Nov at 7:40 · by Nora for Leo · 1 star". */
    doneOn: (day: string, time: string) => `${day} at ${time}`,
    doneBy: (by: string, forWhom: string | null) => (forWhom && forWhom !== by ? `by ${by} for ${forWhom}` : `by ${by}`),
    stars: (stars: number) => plural(stars, 'star'),
    untickSpoken: (title: string) => `${title}, done. Take the tick off`,
  },

  // A reminder, opened
  reminder: {
    more: 'More',
    when: 'When',
    repeats: 'Repeats',
    who: 'Who has it',
    you: 'You',
    /** "Alex's turn, then you": whose turn it is and whose after that. */
    turn: (now: string, then: string | null) => (then ? `${now}'s turn, then ${then}` : `${now}'s turn`),
    yourTurn: (then: string | null) => (then ? `Your turn, then ${then}` : 'Your turn'),
    takesTurns: 'They take turns',
    askedBy: 'Asked by',
    place: 'Where',
    near: (place: string) => `Near ${place}`,
    placeNote: {
      phone: 'The phone of whoever has this watches for the place.',
      browser: "In the phone app, the phone of whoever has this watches for the place. A browser can't, so here it waits to be ticked.",
    },
    remind: 'Reminds',
    notes: 'Notes',
    attached: 'Attached',
    stars: (stars: number) => `Worth ${plural(stars, 'star')}`,
    nudge: 'Nudge',
    menu: { title: 'This reminder', change: 'Change', delete: 'Delete reminder' },
    delete: { title: 'Delete this reminder?', body: 'It goes for everyone it was given to.', confirm: 'Delete reminder' },
  },

  /** The form for a new reminder and for changing one. */
  reminderForm: {
    newTitle: 'New reminder',
    changeTitle: 'Change the reminder',
    add: 'Add',
    typeIt: 'Or type it: “Ask Alex to book the car service”',
    title: 'What has to be done?',
    titlePlaceholder: 'Take the bins out',
    when: 'When',
    noDay: 'Some time',
    repeat: 'Repeats',
    giveTo: 'Give it to',
    mine: 'Nobody: it is yours',
    giveNote: 'Whoever you give it to sees it and can tick it. You see whether it is done.',
    takesTurns: { label: 'Take turns', note: 'One of them has it at a time. Each tick hands it on.' },
    place: 'When someone is near',
    placePlaceholder: 'the post office',
    placeNote: "Instead of a time: it waits until whoever has it is near that place. The phone app watches the place; a browser can't.",
    remind: 'Remind',
    notes: 'Notes',
    notesPlaceholder: 'Anything that helps',
    needsTitle: 'Say what has to be done first.',
  },

  // 7.6 Goals
  goals: {
    title: 'Goals',
    add: 'New goal',
    /** Under the big ring: what the number is of. */
    ring: { money: 'saved', count: 'done' },
    /** A goal's card, for a screen reader: "Norway 2027. 70%. €5,600 of €8,000 · on track for April". */
    spoken: (title: string, percent: number, line: string) => `${title}. ${percent}%. ${line}`,
    empty: { title: 'No goals yet', body: 'Something you are working towards, with a ring that fills: a trip, a fund, twenty books.', action: 'Start a goal' },
  },

  // 7.7 A goal
  goal: {
    share: 'Share',
    more: 'More',
    cover: (title: string) => `The picture of ${title}`,
    /** The small label on the picture: "Goal · by March 2027", or only "Goal". */
    label: (by: string | null | undefined) => (by ? `Goal · ${by}` : 'Goal'),
    percent: (percent: number) => `${percent}%`,
    months: { money: 'Saved each month', count: 'Added each month' },
    /** The twelve bars, for a screen reader. */
    monthsSpoken: (year: number) => `What was put in during each month of ${year}`,
    /** One letter for each month, January first. */
    monthLetters: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
    noRecent: 'Nothing has been put in yet.',
    /** Where the number is read from. */
    source: {
      note: 'Change it there and the ring moves',
      sheetSoon: 'Sheets arrive with Money. Until then this goal counts what is put in here by hand.',
      journeySoon: 'This goal follows a challenge in the sister app. The link between the two apps arrives later; until then it counts what is put in here by hand.',
    },
    steps: { line: (done: number, all: number) => `${done} of ${all} steps done` },
    /** The button in the bar at the bottom. */
    add: { money: 'Add money', count: 'Add one', steps: 'Open the steps' },
    addSheet: {
      money: 'Add money',
      amount: 'How much, in euros',
      note: 'A few words',
      notePlaceholder: 'payday',
      who: 'Who put it in',
      confirm: 'Add',
      amountProblem: 'Write an amount, like 150 or 12.50.',
    },
    takeBack: { title: 'Take this back?', body: (line: string) => `“${line}” is removed and the ring moves back.`, confirm: 'Take it back' },
    /** A line of what was put in, for a screen reader, when pressing it offers to take it back. */
    recentSpoken: (line: string, note: string) => `${line}. ${note}. Take it back`,
    copied: 'Copied, ready to paste into a message',
    notCopied: "This browser didn't let us copy it.",
    menu: { title: 'This goal', audience: 'Who can see it', change: 'Change', delete: 'Delete goal' },
    delete: { title: 'Delete this goal?', body: 'The ring and everything that was put in go, for everyone who can see it.', confirm: 'Delete goal' },
  },

  /** The form for a new goal and for changing one. */
  goalForm: {
    newTitle: 'New goal',
    changeTitle: 'Change the goal',
    add: 'Start it',
    title: 'What are you working towards?',
    titlePlaceholder: 'Norway 2027',
    blurb: 'A few words about it',
    blurbPlaceholder: 'Two weeks by train and ferry',
    kind: 'What it counts',
    kinds: { money: 'Money', count: 'A number', steps: 'Steps' },
    kindNotes: {
      money: 'An amount to save or pay off. People add money and the ring fills.',
      count: 'Books, stars, runs: anything you count. Each tick adds one.',
      steps: 'A list of steps. The ring fills as they are ticked.',
    },
    target: { money: 'How much, in euros', count: 'How many' },
    unitWords: 'What is counted',
    unitWordsPlaceholder: 'books',
    current: { money: 'Already saved, in euros', count: 'Already done' },
    steps: 'The steps, one on each line',
    stepsPlaceholder: 'Book the ferry',
    by: 'To be done by',
    noDay: 'No day',
    removeDay: 'No day',
    emoji: 'Its picture',
    needsTitle: 'Give the goal a name first.',
    needsTarget: 'Say how much, or how many.',
    needsSteps: 'Write at least one step.',
  },
} as const;
