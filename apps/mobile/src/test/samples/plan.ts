/**
 * Made-up answers for the tests of Plan: whole objects, the way the API sends them. Import them from
 * '@/test/samples/plan'; the people and circles every test shares are in '@/test/samples'.
 *
 * The family's week is the one the screens draw: Wednesday 11 November 2026 is today.
 */
import type {
  DoneResponse,
  EntryResponse,
  EventResponse,
  GoalResponse,
  GoalRowResponse,
  GuestResponse,
  MonthResponse,
  PersonBrief,
  PlanEntryResponse,
  PlanResponse,
  ReadingResponse,
  ReadItemResponse,
  ReminderResponse,
  RemindersResponse,
} from '@/api/generated/homeport';

import { everyone, notMia, onlyMe, withAlex } from './spine';

export const TODAY = '2026-11-11';
/** 7:40 this morning, wherever the test runs. */
const AT_740 = new Date(2026, 10, 11, 7, 40, 0).toISOString();

export const ids = {
  schoolRun: 'aaaaaaaa-0001-4000-8000-000000000001',
  dentist: 'aaaaaaaa-0002-4000-8000-000000000002',
  bins: 'aaaaaaaa-0003-4000-8000-000000000003',
  swimming: 'aaaaaaaa-0004-4000-8000-000000000004',
  haircut: 'aaaaaaaa-0005-4000-8000-000000000005',
  party: 'aaaaaaaa-0006-4000-8000-000000000006',
  carService: 'aaaaaaaa-0007-4000-8000-000000000007',
  feedBiscuit: 'aaaaaaaa-0008-4000-8000-000000000008',
  parcel: 'aaaaaaaa-0009-4000-8000-000000000009',
  tripForm: 'aaaaaaaa-0010-4000-8000-000000000010',
  norway: 'aaaaaaaa-0011-4000-8000-000000000011',
  books: 'aaaaaaaa-0012-4000-8000-000000000012',
  tenK: 'aaaaaaaa-0013-4000-8000-000000000013',
  partyPrep: 'aaaaaaaa-0014-4000-8000-000000000014',
  bill: 'aaaaaaaa-0015-4000-8000-000000000015',
};

/** People as the calendar names them: by first name, with their place in the circle. */
export const noraBrief: PersonBrief = { memberId: 'm-nora', name: 'Nora', avatarUrl: null };
export const alexBrief: PersonBrief = { memberId: 'm-alex', name: 'Alex', avatarUrl: 'https://example.com/alex.jpg' };
export const miaBrief: PersonBrief = { memberId: 'm-mia', name: 'Mia', avatarUrl: 'https://example.com/mia.jpg' };
export const leoBrief: PersonBrief = { memberId: 'm-leo', name: 'Leo', avatarUrl: 'https://example.com/leo.jpg' };

// ---------- the day's list ----------

export function planEntry(over: Partial<PlanEntryResponse> = {}): PlanEntryResponse {
  return {
    thingId: ids.dentist,
    kind: 'event',
    title: 'Dentist · Mia',
    day: TODAY,
    lead: '15:30',
    leadEnd: '16:15',
    done: null,
    canTick: false,
    dueOn: null,
    note: 'Trubarjeva 12',
    noteIcon: 'pin',
    repeats: false,
    action: null,
    due: null,
    whose: { memberId: 'm-mia', name: 'Mia', tint: 3 },
    avatarUrls: ['https://example.com/mia.jpg', 'https://example.com/alex.jpg'],
    minute: 930,
    mine: true,
    canEdit: true,
    chip: everyone,
    ...over,
  };
}

export const schoolRun = planEntry({ thingId: ids.schoolRun, title: 'School run', lead: '8:00', leadEnd: null, note: 'Weekdays · Alex drives', noteIcon: 'repeat', whose: { memberId: 'm-alex', name: 'Alex', tint: 2 }, avatarUrls: ['https://example.com/alex.jpg'], minute: 480, mine: false });
export const dentist = planEntry();
/** A job that takes turns: Nora's today, with a tick she may give. */
export const bins = planEntry({ thingId: ids.bins, kind: 'reminder', title: 'Take the bins out', lead: '19:00', leadEnd: null, done: false, canTick: true, note: 'Tue and Fri · your turn, then Alex', noteIcon: 'repeat', whose: { memberId: 'm-nora', name: 'Nora', tint: 1 }, avatarUrls: [], minute: 1140 });
export const swimming = planEntry({ thingId: ids.swimming, title: 'Swimming · Mia', day: '2026-11-12', lead: '17:00', leadEnd: null, note: 'Thursdays', noteIcon: 'repeat', avatarUrls: ['https://example.com/mia.jpg'], minute: 1020 });
/** What another place brought: a bill that is due, with its amount in front and no chip of Plan's own. */
export const electricity = planEntry({ thingId: ids.bill, kind: 'bill' as never, title: 'Electricity is due', day: '2026-11-12', lead: '€84', leadEnd: null, note: 'Split with Alex · he has paid his half', noteIcon: 'none', whose: null, avatarUrls: [], minute: 1440, chip: null });
export const haircut = planEntry({ thingId: ids.haircut, title: 'Haircut · Leo', day: '2026-11-14', lead: '10:00', leadEnd: '10:30', note: 'Reminds you an hour before', noteIcon: 'bell', whose: { memberId: 'm-leo', name: 'Leo', tint: 4 }, avatarUrls: ['https://example.com/leo.jpg'], minute: 600 });

const dot = (memberId: string | null, tint: number) => ({ memberId, tint });

/** The week of 9 November, from today on: today's three lines, tomorrow's two. */
export function planAnswer(over: Partial<PlanResponse> = {}): PlanResponse {
  return {
    day: TODAY,
    week: [
      { day: '2026-11-09', dots: [dot('m-alex', 2)] },
      { day: '2026-11-10', dots: [dot('m-nora', 1), dot('m-mia', 3)] },
      { day: '2026-11-11', dots: [dot('m-mia', 3), dot('m-nora', 1), dot('m-alex', 2)] },
      { day: '2026-11-12', dots: [dot('m-mia', 3), dot(null, 0)] },
      { day: '2026-11-13', dots: [dot('m-nora', 1)] },
      { day: '2026-11-14', dots: [dot('m-leo', 4), dot(null, 0)] },
      { day: '2026-11-15', dots: [] },
    ],
    days: [
      { day: '2026-11-11', entries: [schoolRun, dentist, bins] },
      { day: '2026-11-12', entries: [electricity, swimming] },
      { day: '2026-11-13', entries: [] },
      { day: '2026-11-14', entries: [haircut] },
    ],
    overdue: [],
    ...over,
  };
}

/** November 2026 as whole weeks, Monday 26 October to Sunday 6 December, with dots on a few days. */
export function monthAnswer(over: Partial<MonthResponse> = {}): MonthResponse {
  const dots: Record<string, ReturnType<typeof dot>[]> = {
    '2026-11-11': [dot('m-mia', 3), dot('m-nora', 1), dot('m-alex', 2)],
    '2026-11-14': [dot('m-leo', 4), dot(null, 0)],
    '2026-12-05': [dot(null, 0)],
  };
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(2026, 9, 26 + index);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { day, inMonth: date.getMonth() === 10, dots: dots[day] ?? [] };
  });
  return { month: '2026-11', days, ...over };
}

// ---------- an event ----------

export function guest(over: Partial<GuestResponse> = {}): GuestResponse {
  return { id: 'g-nora', memberId: 'm-nora', name: 'Nora', avatarUrl: null, part: '', answer: 'going', you: true, ...over };
}

/** Mia's birthday party: hidden from her, two answers still missing, a to-do list linked. */
export function event(over: Partial<EventResponse> = {}): EventResponse {
  return {
    id: ids.party,
    circleId: 'c-linds',
    title: "Mia's 10th birthday party",
    day: '2026-12-05',
    time: '14:00',
    endDay: '2026-12-05',
    endTime: '17:00',
    allDay: false,
    timeZone: 'Europe/Ljubljana',
    startsAt: '2026-12-05T13:00:00Z',
    endsAt: '2026-12-05T16:00:00Z',
    place: 'At home',
    notes: '',
    coverUrl: 'https://example.com/cake.jpg',
    remindMinutes: null,
    remindLabel: null,
    repeat: null,
    nextDay: null,
    guests: [guest(), guest({ id: 'g-alex', memberId: 'm-alex', name: 'Alex', avatarUrl: 'https://example.com/alex.jpg', you: false }), guest({ id: 'g-luka', memberId: null, name: 'Luka', answer: null, you: false })],
    myAnswer: 'going',
    going: 9,
    maybe: 0,
    cant: 0,
    unanswered: 2,
    links: [{ id: ids.partyPrep, circleId: 'c-linds', kind: 'checklist', place: 'notes', title: 'Party prep', updatedAt: '2026-11-01T09:00:00Z', mine: true, canEdit: true, chip: notMia, glance: '4 of 9 done' }],
    updatedAt: '2026-11-10T09:00:00Z',
    mine: true,
    canEdit: true,
    chip: notMia,
    ...over,
  };
}

// ---------- reminders ----------

export function reminder(over: Partial<ReminderResponse> = {}): ReminderResponse {
  return {
    id: ids.bins,
    circleId: 'c-linds',
    title: 'Take the bins out',
    notes: '',
    dueOn: TODAY,
    dueTime: '19:00',
    timeZone: 'Europe/Ljubljana',
    dueAt: '2026-11-11T18:00:00Z',
    remindMinutes: 0,
    repeat: { unit: 'week', every: 1, days: ['tue', 'fri'], until: null, label: 'Tue and Fri' },
    takesTurns: true,
    turn: noraBrief,
    then: alexBrief,
    givenTo: [noraBrief, alexBrief],
    askedBy: noraBrief,
    place: null,
    stars: 0,
    done: false,
    doneAt: null,
    doneBy: null,
    tickedDueOn: null,
    yours: true,
    asked: false,
    canTick: true,
    canNudge: false,
    note: '19:00 · Tue and Fri · takes turns',
    noteIcon: 'repeat',
    attached: [],
    createdAt: '2026-11-01T09:00:00Z',
    updatedAt: '2026-11-10T09:00:00Z',
    mine: true,
    canEdit: true,
    chip: everyone,
    ...over,
  };
}

const plain = { repeat: null, takesTurns: false, turn: null, then: null, givenTo: [] as PersonBrief[] };
export const tripForm = reminder({ ...plain, id: ids.tripForm, title: "Sign Mia's school trip form", dueOn: '2026-11-13', dueTime: null, note: 'Form attached · due Friday', noteIcon: 'clip', attached: ['Form'], chip: onlyMe });
/** Asked of Alex on Monday, not done: it can be nudged. */
export const carService = reminder({ ...plain, id: ids.carService, title: 'Book the car service', dueOn: null, dueTime: null, dueAt: null, givenTo: [alexBrief], yours: false, asked: true, canNudge: true, note: 'Asked on Monday · not done yet', noteIcon: 'none', chip: withAlex });
/** Asked of Leo and done this morning. */
export const feedBiscuit = reminder({ ...plain, id: ids.feedBiscuit, title: 'Feed Biscuit', dueOn: '2026-11-12', dueTime: '07:30', givenTo: [leoBrief], stars: 1, done: true, doneAt: AT_740, doneBy: leoBrief, tickedDueOn: TODAY, yours: false, asked: true, note: 'Done at 7:40 · 1 star', noteIcon: 'none' });
/** One that waits for a place instead of a time. */
export const parcel = reminder({ ...plain, id: ids.parcel, title: 'Pick up the parcel', dueOn: null, dueTime: null, dueAt: null, place: { words: 'the post office', lat: 46.05, lng: 14.5, radiusM: 200 }, note: "When you're near the post office", noteIcon: 'pin', chip: onlyMe });

export function remindersAnswer(over: Partial<RemindersResponse> = {}): RemindersResponse {
  return {
    day: TODAY,
    yoursCount: 3,
    askedCount: 2,
    yours: [
      { day: TODAY, reminders: [reminder()] },
      { day: '2026-11-13', reminders: [tripForm] },
    ],
    asked: [carService, feedBiscuit],
    places: [parcel],
    ...over,
  };
}

export function doneTick(over: Partial<DoneResponse> = {}): DoneResponse {
  return { tickId: 't-1', reminderId: ids.feedBiscuit, title: 'Feed Biscuit', doneAt: AT_740, doneBy: noraBrief, doneFor: leoBrief, dueOn: TODAY, stars: 1, mine: true, canEdit: true, chip: everyone, ...over };
}

// ---------- goals ----------

export function goalRow(over: Partial<GoalRowResponse> = {}): GoalRowResponse {
  return {
    id: ids.norway,
    circleId: 'c-linds',
    title: 'Norway 2027',
    emoji: '',
    coverUrl: 'https://example.com/lake.jpg',
    percent: 70,
    line: '€5,600 of €8,000 · on track for March',
    reached: false,
    unit: 'money',
    unitWords: '',
    source: 'sheet',
    people: [noraBrief, alexBrief, miaBrief, leoBrief],
    cheer: 'All four chip in',
    updatedAt: '2026-11-10T09:00:00Z',
    mine: true,
    canEdit: true,
    chip: everyone,
    ...over,
  };
}

export const booksRow = goalRow({ id: ids.books, title: 'Read 20 books', emoji: '📚', coverUrl: null, percent: 65, line: '13 of 20 · together', source: null, people: [noraBrief], cheer: 'Nora chips in' });
export const tenKRow = goalRow({ id: ids.tenK, title: 'Family 10K', emoji: '🏃', coverUrl: null, percent: 40, line: 'Day 12 of 30 in Journey', source: 'journey', people: [], cheer: '' });

export function goalEntry(over: Partial<EntryResponse> = {}): EntryResponse {
  return { id: 'e-1', by: alexBrief, amount: 15000, line: 'Alex added €150', note: 'payday', day: '2026-11-01', ...over };
}

/** The holiday fund: money, read from a sheet that can't be read yet, on track for March. */
export function goal(over: Partial<GoalResponse> = {}): GoalResponse {
  return {
    id: ids.norway,
    circleId: 'c-linds',
    title: 'Norway 2027',
    blurb: 'Two weeks by train and ferry, paid for before we go',
    emoji: '',
    coverUrl: 'https://example.com/lake.jpg',
    unit: 'money',
    currency: 'EUR',
    unitWords: '',
    target: 800000,
    current: 560000,
    currentLabel: '€5,600',
    targetLabel: '€8,000',
    how: 'source',
    startDay: '2026-03-05',
    targetDay: '2027-03-31',
    byLabel: 'by March 2027',
    amountLine: '€5,600 of €8,000',
    line: '€5,600 of €8,000 · on track for March',
    pace: { percent: 70, toGo: 240000, reached: false, onTrack: true, paceLine: 'On track: €120 a week gets there', toGoLine: '€2,400 to go', timeLine: '20 weeks left' },
    people: [noraBrief, alexBrief, miaBrief, leoBrief],
    cheer: 'All four chip in',
    source: { kind: 'sheet', ref: 'norway-budget/saved', line: 'Reads “Saved” in Norway budget', live: false, thingId: null, thingKind: null },
    addHere: true,
    steps: null,
    year: 2026,
    months: [0, 0, 38000, 55000, 48000, 66000, 25000, 30000, 88000, 78000, 132000, 0],
    recent: [goalEntry(), goalEntry({ id: 'e-2', by: miaBrief, amount: 500, line: 'Mia added €5', note: 'from her pocket money', day: '2026-10-30' })],
    updatedAt: '2026-11-10T09:00:00Z',
    mine: true,
    canEdit: true,
    chip: everyone,
    ...over,
  };
}

/** A goal that counts by hand: books read, one tick at a time. */
export const booksGoal = goal({
  id: ids.books,
  title: 'Read 20 books',
  blurb: '',
  emoji: '📚',
  coverUrl: null,
  unit: 'count',
  target: 20,
  current: 13,
  currentLabel: '13',
  targetLabel: '20',
  how: 'number',
  targetDay: null,
  byLabel: null,
  amountLine: '13 of 20',
  line: '13 of 20 · together',
  pace: { percent: 65, toGo: 7, reached: false, onTrack: null, paceLine: 'At this pace: about 22 weeks to go', toGoLine: '7 to go', timeLine: null },
  source: null,
  months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 3, 0],
  recent: [],
});

// ---------- a line that is read ----------

/** "Haircut for Leo Saturday at 10, remind me an hour before", as the API reads it. */
export function readItem(over: Partial<ReadItemResponse> = {}): ReadItemResponse {
  return {
    as: 'event',
    words: 'Haircut for Leo Saturday at 10, remind me an hour before',
    title: 'Haircut',
    day: '2026-11-14',
    time: '10:00',
    endTime: '10:30',
    whenLabel: 'Sat 14 Nov · 10:00 to 10:30',
    whenNear: 'Sat 14 Nov, 10:00',
    person: leoBrief,
    personRole: 'for',
    personLabel: 'For Leo',
    remindMinutes: 60,
    remindLabel: '1 hour before',
    repeat: null,
    list: null,
    quantity: null,
    code: null,
    place: { words: 'Barber Miha', label: 'Barber Miha, from last time' },
    pieces: [
      { start: 8, end: 15, text: 'for Leo', what: 'person', became: 'For Leo' },
      { start: 16, end: 24, text: 'Saturday', what: 'day', became: 'Sat 14 Nov' },
      { start: 25, end: 30, text: 'at 10', what: 'time', became: '10:00' },
      { start: 32, end: 56, text: 'remind me an hour before', what: 'remind', became: '1 hour before' },
    ],
    ...over,
  };
}

export function reading(items: ReadItemResponse[] = [readItem()], over: Partial<ReadingResponse> = {}): ReadingResponse {
  return { letter: false, items, dates: [], amounts: [], ...over };
}

/** "Ask Alex to book the car service tomorrow at 6": a reminder, given to Alex. */
export const askAlex = readItem({
  as: 'reminder',
  words: 'Ask Alex to book the car service tomorrow at 6',
  title: 'Book the car service',
  day: '2026-11-12',
  time: '18:00',
  endTime: null,
  whenLabel: 'Thu 12 Nov · 18:00',
  whenNear: 'tomorrow 18:00',
  person: alexBrief,
  personRole: 'given_to',
  personLabel: 'Given to Alex',
  remindMinutes: null,
  remindLabel: null,
  place: null,
  pieces: [],
});
/** "milk": a line for the shopping list. */
export const milk = readItem({ as: 'list_item', words: 'milk', title: 'Milk', day: null, time: null, endTime: null, whenLabel: null, whenNear: null, person: null, personRole: null, personLabel: null, remindMinutes: null, remindLabel: null, list: { id: 'l-groceries', title: 'Groceries' }, place: null, pieces: [] });

/**
 * Makes the phone's calendar read 9:00 on the samples' today (Wednesday 11 November 2026) while timers keep
 * running as they are. Call it in `beforeAll`, and `jest.useRealTimers()` in `afterAll`.
 */
export function onSampleToday(): void {
  jest.useFakeTimers({
    now: new Date(2026, 10, 11, 9, 0, 0),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance'],
  });
}
