import type {
  AnniversaryResponse,
  BoardResponse,
  BothYesDeckResponse,
  BothYesIdeaResponse,
  BothYesResponse,
  FairShareResponse,
  MysteryDateDateResponse,
  MysteryDateResponse,
  OurStoryMomentResponse,
  OurStoryResponse,
  PersonBrief,
  TodayResponse,
  TuckedNotesNoteResponse,
  TuckedNotesResponse,
} from '@/api/generated/homeport';

import { todayAnswer } from './spine';
import { board, picture } from './templates';

/**
 * Made-up answers for the tests of couples: whole objects, the way the API sends them. Import them from
 * '@/test/samples/couple'; the people and circles every test shares are in '@/test/samples'.
 */

// ---------- us-today: Today, for two ----------

export const RUN = 'aaaaaaaa-5555-4555-8555-555555555555';
export const TUCKED_BOARD = 'bbbbbbbb-5555-4555-8555-555555555555';
export const OCTOBER = 'eeeeeeee-3333-4333-8333-333333333333';
export const DATE_BOARD = 'cccccccc-5555-4555-8555-555555555555';
export const STORY_BOARD = 'dddddddd-5555-4555-8555-555555555555';
export const BOTH_YES_BOARD = 'eeeeeeee-5555-4555-8555-555555555555';
export const SOMEDAY = 'ffffffff-5555-4555-8555-555555555555';

/** What the API sends Nora for "Nora and Alex": a run, a tucked note's line, what Alex owes; the mystery date, two keepsakes and the pinned list. */
export function coupleToday(over: Partial<TodayResponse> = {}): TodayResponse {
  return todayAnswer({
    day: '2026-11-12',
    left: 3,
    items: [
      { thingId: RUN, kind: 'event', title: 'Run together', note: 'Week 3 of couch to 5K', lead: '7:00', done: null, minute: 420, avatarUrls: ['https://example.com/nora.jpg', 'https://example.com/alex.jpg'] },
      { thingId: TUCKED_BOARD, kind: 'board', title: 'A note is tucked away for you', note: 'From Alex. It turns up when it turns up.', lead: null, done: null, minute: 1440, avatarUrls: ['https://example.com/alex.jpg'] },
      { thingId: OCTOBER, kind: 'split', title: "You're owed for October", note: 'Alex €42', lead: '€42', done: null, minute: 1440, avatarUrls: ['https://example.com/alex.jpg'] },
    ],
    cards: [
      { thingId: DATE_BOARD, kind: 'board', look: 'mystery_date', emoji: '🔮', title: 'Friday is yours to plan', line: 'All Alex knows: “20:00, wear something warm”', figure: null, imageUrl: null, action: null, order: 10 },
      { thingId: STORY_BOARD, kind: 'board', look: 'our_story', emoji: '❤️', title: 'Our story', line: 'Since a wedding in Piran', figure: '4,503 days', imageUrl: 'https://example.com/bench.jpg', action: null, order: 20 },
      { thingId: BOTH_YES_BOARD, kind: 'board', look: 'both_yes', emoji: '🗳️', title: 'Both said yes', line: 'Thai, on Saturday', figure: 'A match', imageUrl: 'https://example.com/heart-hands.jpg', action: null, order: 30 },
      { thingId: SOMEDAY, kind: 'checklist', look: 'checklist', emoji: '🌍', title: 'Someday', line: '14 of 60 done', figure: null, imageUrl: null, action: null, order: 40 },
    ],
    ...over,
  });
}

// ---------- the boards of a couple's six templates ----------

/** Nora and Alex as a couple's boards name them: by first name, with their member id in "Nora and Alex". */
export const nora2: PersonBrief = { memberId: 'm-nora-2', name: 'Nora', avatarUrl: null };
export const alex2: PersonBrief = { memberId: 'm-alex-2', name: 'Alex', avatarUrl: null };

/** A board in "Nora and Alex", shared with both, as Nora (who started it) sees it. */
function coupleBoard(over: Partial<BoardResponse>): BoardResponse {
  return board({ circleId: 'c-couple', day: '2026-11-12', ...over });
}

// ---------- 17.3 Our story ----------

export function moment(over: Partial<OurStoryMomentResponse> = {}): OurStoryMomentResponse {
  return { id: 'moment-met', day: '2014-07-14', precision: 'day', label: 'Piran', title: 'We met', text: "At Jana's wedding. You asked if the seat was taken. It was, by your coat.", star: true, from: null, photos: [picture()], addedBy: nora2, mine: true, ...over };
}

/** The story as the drawing has it: the day they met with its photo, a journey that was kept, the first flat, and Mia. */
export function storyView(over: Partial<OurStoryResponse> = {}): OurStoryResponse {
  return {
    since: '2014-07-14',
    days: 4503,
    sinceWords: 'a wedding in Piran',
    count: 4,
    moments: [
      moment(),
      moment({ id: 'moment-trip', day: '2015-08-01', precision: 'month', label: 'First trip', title: 'Mallorca by kayak', text: 'A journey you kept · 9 days, 212 photos', star: false, from: 'journey', photos: [] }),
      moment({ id: 'moment-flat', day: '2016-03-01', precision: 'month', label: 'First flat', title: 'The keys to Trubarjeva', text: 'One mattress, no curtains, a borrowed kettle.', star: false, photos: [], addedBy: alex2, mine: false }),
      moment({ id: 'moment-mia', day: '2016-12-04', label: 'Mia', title: 'Three of us', text: '3,420 grams, at 6:12 in the morning.', photos: [], addedBy: alex2, mine: false }),
    ],
    ...over,
  };
}

export function storyBoard(view: OurStoryResponse = storyView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return coupleBoard({ template: 'our_story', title: 'Our story', emoji: '❤️', settings: { since: view.since, sinceWords: view.sinceWords }, view, ...over });
}

// ---------- 17.4 Tucked notes ----------

export function tuckedNote(over: Partial<TuckedNotesNoteResponse> = {}): TuckedNotesNoteResponse {
  return { id: 'note-coffee', text: 'Your coffee this morning was the best part of my day.', from: nora2, forPerson: alex2, mine: true, turnsUp: 'this_week', at: null, before: '2026-11-15', waiting: false, found: false, foundAt: null, ...over };
}

/** A note that was found: Alex's for Nora unless said otherwise. */
export function foundNote(over: Partial<TuckedNotesNoteResponse> = {}): TuckedNotesNoteResponse {
  return tuckedNote({ id: 'note-washing', text: "I folded your washing. You're welcome. I love you.", from: alex2, forPerson: nora2, mine: false, before: null, found: true, foundAt: '2026-11-10T22:14:00', ...over });
}

/** The notes as Nora sees them: one of hers still hiding for Alex, and what was found so far. */
export function tuckedView(over: Partial<TuckedNotesResponse> = {}): TuckedNotesResponse {
  return {
    tucked: [tuckedNote()],
    turnedUp: [],
    found: 37,
    foundLately: [foundNote(), foundNote({ id: 'note-pocket', text: 'Look in the left pocket of your coat.', from: nora2, forPerson: alex2, mine: true, turnsUp: 'lands', foundAt: '2026-10-31T16:40:00' })],
    readers: [alex2],
    ways: [
      { way: 'this_week', works: true, waitsFor: null },
      { way: 'at', works: true, waitsFor: null },
      { way: 'lands', works: false, waitsFor: "A sign from their phone that they have arrived. Phones don't send it yet." },
      { way: 'rains', works: false, waitsFor: 'A weather source to say that it is raining. None is connected yet.' },
    ],
    ...over,
  };
}

/** The same board as Alex sees it while Nora's note is hiding: nothing of it at all. */
export const tuckedForReader: TuckedNotesResponse = tuckedView({ tucked: [], foundLately: [foundNote({ mine: true }), foundNote({ id: 'note-pocket', text: 'Look in the left pocket of your coat.', from: nora2, forPerson: alex2, mine: false, foundAt: '2026-10-31T16:40:00' })], readers: [nora2] });

export function tuckedBoard(view: TuckedNotesResponse = tuckedView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return coupleBoard({ template: 'tucked_notes', title: 'Tucked notes', emoji: '📝', settings: {}, view, ...over });
}

// ---------- 17.5 The anniversary questions ----------

const question = (id: string, text: string, yours: string, theirs: string, same: string | null = null) => ({
  id,
  text,
  answers: [
    { person: nora2, yours: true, text: yours },
    { person: alex2, yours: false, text: theirs },
  ],
  same,
});

/** Year twelve has opened; year thirteen is being written: Nora has answered two of three, Alex all of his. */
export function anniversaryView(over: Partial<AnniversaryResponse> = {}): AnniversaryResponse {
  return {
    since: '2014-07-14',
    people: [nora2, alex2],
    youAnswer: true,
    years: [12],
    shown: {
      year: 12,
      day: '2026-07-14',
      questions: [
        question('q-best', 'The best day of this year?', 'The canoe at Bled, when Mia steered.', 'Bled. Obviously Bled.', 'Bled'),
        question('q-more', 'What should we do more of?', 'Evenings with the phones away.', 'Dancing in the kitchen.'),
        question('q-thank', 'What did I not thank you for?', 'Every school run in January.', "Remembering my mother's birthday. Every year."),
      ],
    },
    next: {
      year: 13,
      opensOn: '2027-07-14',
      daysToGo: 244,
      dayHasCome: false,
      yours: [
        { questionId: 'q-best', question: 'The best day of this year?', answerId: 'a-best', answer: 'The first snow, and nobody had gloves.' },
        { questionId: 'q-more', question: 'What should we do more of?', answerId: 'a-more', answer: 'Walks with no destination.' },
        { questionId: 'q-thank', question: 'What did I not thank you for?', answerId: null, answer: null },
      ],
      answered: 2,
      youAreDone: false,
      others: [{ person: alex2, done: true }],
    },
    ...over,
  };
}

export function anniversaryBoard(view: AnniversaryResponse = anniversaryView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return coupleBoard({ template: 'anniversary', title: 'The anniversary questions', emoji: '📅', settings: { since: view.since, people: ['m-nora-2', 'm-alex-2'], firstYear: 12 }, view, ...over });
}

// ---------- 17.6 Mystery date ----------

/** Friday's date as Nora, who plans it, sees it: the plan, the clues with their moments, and nothing pulled from the jar. */
export function comingDate(over: Partial<MysteryDateDateResponse> = {}): MysteryDateDateResponse {
  return {
    id: 'date-friday',
    day: '2026-11-13',
    time: '20:00',
    at: '2026-11-13T19:00:00Z',
    planner: nora2,
    yours: true,
    hint: 'Wear something warm.',
    revealed: false,
    title: 'Night sledging on Krvavec',
    plan: [
      { id: 'line-sledging', icon: 'pin', title: 'Night sledging on Krvavec', note: 'Two tickets booked', ready: false, cents: null },
      { id: 'line-money', icon: 'euro', title: '€46, from the fun pot', note: 'He’ll see “a date” in Money, not what', ready: false, cents: 4600 },
      { id: 'line-ines', icon: 'users', title: 'Ines has the children until 23:30', note: 'Her guest pass is ready', ready: true, cents: null },
    ],
    clues: [{ id: 'clue-gloves', text: 'Bring the thick gloves.', opensAt: '2026-11-13T15:00:00', open: false }],
    cluesToCome: 1,
    suggestion: null,
    ...over,
  };
}

export function dateView(over: Partial<MysteryDateResponse> = {}): MysteryDateResponse {
  return {
    next: comingDate(),
    turn: alex2,
    yourTurn: false,
    thisYear: 9,
    past: [
      { id: 'date-cooking', title: 'A cooking class', planner: alex2, yours: false, day: '2026-10-09' },
      { id: 'date-cinema', title: 'Open-air cinema', planner: nora2, yours: true, day: '2026-09-11' },
    ],
    ideas: 12,
    ...over,
  };
}

/** The same date as Alex gets it: the day, the time and the hint, and not a word of the plan. */
export const dateForOther: MysteryDateResponse = dateView({
  next: comingDate({ yours: false, title: null, plan: [], clues: [], cluesToCome: 1 }),
  yourTurn: true,
  past: [
    { id: 'date-cooking', title: 'A cooking class', planner: alex2, yours: true, day: '2026-10-09' },
    { id: 'date-cinema', title: 'Open-air cinema', planner: nora2, yours: false, day: '2026-09-11' },
  ],
});

export function dateBoard(view: MysteryDateResponse = dateView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return coupleBoard({ template: 'mystery_date', title: 'Date night', emoji: '🔮', settings: {}, view, ...over });
}

// ---------- 17.7 Both said yes ----------

export function deck(over: Partial<BothYesDeckResponse> = {}): BothYesDeckResponse {
  return { id: 'deck-dinner', name: 'Dinner', label: 'Dinner', emoji: '🍽️', locked: false, day: '2026-11-14', picture: null, ideas: 8, seen: 5, youFinished: false, finished: [], matches: 1, ...over };
}

export function idea(over: Partial<BothYesIdeaResponse> = {}): BothYesIdeaResponse {
  return { id: 'idea-tacos', deckId: 'deck-dinner', text: 'Tacos from the place on Trubarjeva', emoji: '🌮', yours: null, match: false, ...over };
}

/** Dinner is open on its sixth idea, with one match; three more decks are being decided, one of them locked. */
export function bothYesView(over: Partial<BothYesResponse> = {}): BothYesResponse {
  return {
    people: [nora2, alex2],
    youAnswer: true,
    decks: [
      deck(),
      deck({ id: 'deck-film', name: "Friday's film", label: 'Film', emoji: '🎬', day: '2026-11-13', ideas: 10, seen: 3, matches: 0 }),
      deck({ id: 'deck-holiday', name: 'Summer 2027', label: 'Holiday', emoji: '🌍', day: null, ideas: 6, seen: 2, finished: [alex2], matches: 0 }),
      deck({ id: 'deck-names', name: 'Names', label: 'Names', emoji: '👶', locked: true, day: null, ideas: 228, seen: 214, finished: [alex2], matches: 6 }),
    ],
    deck: { id: 'deck-dinner', card: idea(), number: 6, of: 8, matches: [idea({ id: 'idea-thai', text: 'Thai', emoji: '🍜', yours: true, match: true })] },
    ...over,
  };
}

export function bothYesBoard(view: BothYesResponse = bothYesView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return coupleBoard({ template: 'both_yes', title: 'Both said yes', emoji: '🗳️', settings: { people: ['m-nora-2', 'm-alex-2'] }, view, ...over });
}

// ---------- 17.8 The fair share ----------

const job = (jobId: string, name: string, hours: number) => ({ jobId, name, emoji: null, hours });

/** October as the drawing has it: Nora 31 hours, Alex 22, and one swap that would bring it close. */
export function fairShareView(over: Partial<FairShareResponse> = {}): FairShareResponse {
  return {
    month: '2026-10',
    monthName: 'October',
    months: ['2026-11', '2026-10'],
    totalHours: 53,
    people: [
      { person: nora2, you: true, hours: 31, percent: 58, jobs: [job('job-meals', 'Meals', 11), job('job-school', 'School things', 7), job('job-laundry', 'Laundry', 6), job('job-doctor', 'Doctor, dentist', 4), job('job-birthdays', 'Birthdays', 3)] },
      { person: alex2, you: false, hours: 22, percent: 42, jobs: [job('job-bedtimes', 'Bedtimes', 9), job('job-bins', 'Bins, repairs', 5), job('job-car', 'The car', 4), job('job-bills', 'Bills', 2), job('job-biscuit', 'Biscuit', 2)] },
    ],
    gapHours: 9,
    close: false,
    swap: { from: nora2, gives: job('job-school', 'School things', 7), to: alex2, takes: job('job-car', 'The car', 4), gapAfter: 3, line: 'Alex takes the school things; you take the car.' },
    offered: null,
    jobs: [
      { id: 'job-meals', name: 'Meals', emoji: '🍲', yourHours: 11 },
      { id: 'job-school', name: 'School things', emoji: '🎒', yourHours: 7 },
      { id: 'job-car', name: 'The car', emoji: '🚗', yourHours: null },
    ],
    canTick: true,
    ...over,
  };
}

export function fairShareBoard(view: FairShareResponse = fairShareView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return coupleBoard({ template: 'fair_share', title: 'Fair share', emoji: '🧮', settings: { people: ['m-nora-2', 'm-alex-2'] }, view, ...over });
}
