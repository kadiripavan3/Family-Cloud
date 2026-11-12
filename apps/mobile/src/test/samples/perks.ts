import type {
  BoardResponse,
  HabitChartsCellResponse,
  HabitChartsChartResponse,
  HabitChartsResponse,
  PersonBrief,
  PiggyBankMoneyResponse,
  PiggyBankResponse,
  PiggyBankSettings,
  SaturdayJarIdeaResponse,
  SaturdayJarResponse,
  SecretMissionsMissionResponse,
  SecretMissionsResponse,
  SleepsCountResponse,
  SleepsResponse,
  WhereIsItItemResponse,
  WhereIsItResponse,
  WhoseTurnResponse,
  WhoseTurnThingResponse,
  WhoseTurnTurnResponse,
} from '@/api/generated/homeport';

import { alexBrief, board, leoBrief, miaBrief, noraBrief, picture } from './templates';

/**
 * Made-up answers for the tests of Fair and fun: whole objects, the way the API sends them. Import them from
 * '@/test/samples/perks'; the people and circles every test shares are in '@/test/samples'. Today is
 * Wednesday 11 November 2026 in these, as in the drawings.
 */

export const biscuitBrief: PersonBrief = { memberId: 'm-biscuit', name: 'Biscuit', avatarUrl: null };

// ---------- 16.1 Whose turn? ----------

export function turn(over: Partial<WhoseTurnTurnResponse> = {}): WhoseTurnTurnResponse {
  return { id: 'turn-film-mia', thingId: 'thing-film', thing: 'Film night', who: miaBrief, you: false, day: '2026-11-06', note: 'Frozen, again', ...over };
}

export function turnThing(over: Partial<WhoseTurnThingResponse> = {}): WhoseTurnThingResponse {
  return { id: 'thing-film', name: 'Film night', emoji: '🎬', does: 'chooses the film', when: null, onDay: '2026-11-11', tonight: true, next: leoBrief, yourTurn: true, people: [miaBrief, leoBrief], last: turn(), line: 'Mia chose last Friday. Frozen, again.', ...over };
}

/** The list as the drawing has it: film night is tonight and it is Leo's turn; four more keep count. */
export function turnsView(over: Partial<WhoseTurnResponse> = {}): WhoseTurnResponse {
  const seat = turn({ id: 'turn-seat-leo', thingId: 'thing-seat', thing: 'The front seat', who: leoBrief, day: '2026-11-11', note: 'had it on the way to school' });
  return {
    things: [
      turnThing(),
      turnThing({ id: 'thing-seat', name: 'The front seat', emoji: '🚗', does: null, onDay: null, tonight: false, next: miaBrief, last: seat, line: 'Leo had it on the way to school' }),
      turnThing({ id: 'thing-pizza', name: 'Pizza toppings', emoji: '🍕', does: null, onDay: null, tonight: false, next: leoBrief, last: turn({ id: 'turn-pizza', thingId: 'thing-pizza', thing: 'Pizza toppings', note: 'went for olives last time' }), line: 'Mia went for olives last time' }),
      turnThing({ id: 'thing-bath', name: 'First in the bath', emoji: '🛁', does: null, when: 'Every evening', onDay: null, tonight: false, next: miaBrief, last: turn({ id: 'turn-bath', thingId: 'thing-bath', thing: 'First in the bath', who: leoBrief, day: '2026-11-10', note: null }), line: 'Every evening' }),
      turnThing({ id: 'thing-walk', name: 'The early walk with Biscuit', emoji: '🐶', does: null, onDay: null, tonight: false, next: alexBrief, yourTurn: false, people: [noraBrief, alexBrief], last: turn({ id: 'turn-walk', thingId: 'thing-walk', thing: 'The early walk with Biscuit', who: noraBrief, you: true, day: '2026-11-10', note: null }), line: 'You did Monday and Tuesday' }),
    ],
    turns: 61,
    since: '2026-03-14',
    canChange: true,
    historyFrom: '2026-10-12',
    historyTo: '2026-11-11',
    history: [seat, turn({ id: 'turn-bath', thingId: 'thing-bath', thing: 'First in the bath', who: leoBrief, day: '2026-11-10', note: null }), turn()],
    ...over,
  };
}

export function turnsBoard(view: WhoseTurnResponse = turnsView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'whose_turn', title: 'Whose turn?', emoji: '🎬', settings: {}, view, ...over });
}

// ---------- 16.2 The piggy bank ----------

export function money(over: Partial<PiggyBankMoneyResponse> = {}): PiggyBankMoneyResponse {
  return { id: 'money-stars', kind: 'in', jar: 'save', toJar: null, cents: 200, title: '10 stars from the chore wheel', note: null, fromName: null, stars: 10, day: '2026-11-08', by: noraBrief, ...over };
}

/** Mia's piggy bank as the drawing has it: €23.40 in three jars, 5% a month on Save, and the skates fund at 68%. */
export function piggyView(over: Partial<PiggyBankResponse> = {}): PiggyBankResponse {
  return {
    child: miaBrief,
    currency: 'EUR',
    totalCents: 2340,
    jars: [
      { jar: 'spend', cents: 840, goalCents: 2000, fill: 42 },
      { jar: 'save', cents: 1200, goalCents: null, fill: 68 },
      { jar: 'give', cents: 300, goalCents: 1500, fill: 20 },
    ],
    interestPercent: 5,
    lastInterest: { day: '2026-11-01', cents: 60 },
    nextInterestOn: '2026-12-01',
    fund: { name: 'Skates fund', stars: 50, starsIn: 34, percent: 68, starsToGo: 16 },
    starCents: 20,
    lately: [
      money(),
      money({ id: 'money-grandma', jar: 'spend', cents: 500, title: 'From Grandma Astrid', note: 'For a good school report', fromName: 'Astrid Lind', stars: null, day: '2026-11-05' }),
      money({ id: 'money-stickers', kind: 'out', jar: 'spend', cents: -350, title: 'Stickers', note: 'Her own choice', stars: null, day: '2026-11-03' }),
    ],
    canChange: true,
    ...over,
  };
}

export const piggySettings: PiggyBankSettings = { forMemberId: 'm-mia', currency: 'EUR', interestPercent: 5, paidThrough: '2026-11-01', starCents: 20, fund: { name: 'Skates fund', stars: 50 }, spendGoalCents: 2000, saveGoalCents: null, giveGoalCents: 1500 };

export function piggyBoard(view: PiggyBankResponse = piggyView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'piggy_bank', title: "Mia's piggy bank", emoji: '🐷', settings: piggySettings, view, ...over });
}

// ---------- 16.3 Secret missions ----------

export function mission(over: Partial<SecretMissionsMissionResponse> = {}): SecretMissionsMissionResponse {
  return { id: 'mission-nora', weekStart: '2026-11-09', doer: noraBrief, yours: true, target: miaBrief, forYou: false, text: "Do one of Mia's jobs before she notices.", did: null, done: false, doneAt: null, revealed: false, reply: null, liked: false, photo: null, ...over };
}

const lastWeek = (over: Partial<SecretMissionsMissionResponse>) => mission({ weekStart: '2026-11-02', yours: false, done: true, doneAt: '2026-11-04T20:15:00Z', revealed: true, ...over });

/** Week 46 as Nora sees it: her own mission for Mia, Leo's to read to him, and last week's four, revealed. */
export function missionsView(over: Partial<SecretMissionsResponse> = {}): SecretMissionsResponse {
  return {
    week: 46,
    weekStart: '2026-11-09',
    revealsOn: '2026-11-15',
    people: 4,
    yours: [mission(), mission({ id: null, doer: leoBrief, yours: false, target: biscuitBrief, text: 'Give Biscuit ten minutes of scratches behind the ears.' })],
    revealedWeekStart: '2026-11-02',
    revealed: [
      lastWeek({ id: 'mission-alex', doer: alexBrief, target: noraBrief, forYou: true, text: "Make Nora's coffee before she asks.", did: 'made your coffee three mornings running', reply: 'You guessed by Wednesday', liked: true }),
      lastWeek({ id: 'mission-mia', doer: miaBrief, target: leoBrief, text: 'Let Leo win at something.', did: 'let him win at cards, twice', reply: 'Leo had no idea' }),
      lastWeek({ id: 'mission-leo', doer: leoBrief, target: alexBrief, text: 'Hide a small drawing where Dad will look.', did: "hid a drawing in Dad's bag", reply: 'Found in Reine, on day 3', photo: picture() }),
      lastWeek({ id: 'mission-walk', doer: noraBrief, yours: true, target: biscuitBrief, text: 'Take Biscuit on one very long walk.', did: 'one very long walk', reply: "Biscuit can't read, but knew" }),
    ],
    ...over,
  };
}

export function missionsBoard(view: SecretMissionsResponse = missionsView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'secret_missions', title: 'Secret missions', emoji: '🎯', settings: {}, view, ...over });
}

// ---------- 16.4 The Saturday jar ----------

export function idea(over: Partial<SaturdayJarIdeaResponse> = {}): SaturdayJarIdeaResponse {
  return { id: 'idea-picnic', text: 'A picnic by the pond in Tivoli', emoji: '🧺', by: miaBrief, mine: true, place: 'outdoors', minutes: 120, cents: 0, addedOn: '2026-06-14', done: false, doneOn: null, eventId: null, albumId: null, ...over };
}

/** The three ideas the drawing lists under "Fits today". */
export const jarIdeas: SaturdayJarIdeaResponse[] = [
  idea({ id: 'idea-den', text: 'Build a den in the living room', emoji: '⛺', by: leoBrief, place: 'home', minutes: null, addedOn: '2026-11-02' }),
  idea({ id: 'idea-pool', text: 'The big slides at the pool', emoji: '🏊', by: alexBrief, mine: false, place: 'indoors', minutes: 240, cents: 6000, addedOn: '2026-10-24' }),
  idea({ id: 'idea-pancakes', text: 'Pancakes for dinner', emoji: '🥞', by: miaBrief, place: 'home', minutes: 30, addedOn: '2026-10-15' }),
];

/** The jar as the drawing has it: shaken this morning for a day outdoors, the picnic came out, 31 ideas inside. */
export function jarView(over: Partial<SaturdayJarResponse> = {}): SaturdayJarResponse {
  return { count: 31, done: 0, asked: { minutes: null, cents: null, outdoors: true }, pulled: idea(), weather: null, everyoneFree: null, people: 4, comingUp: [], ...over };
}

export function saturdayBoard(view: SaturdayJarResponse = jarView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'saturday_jar', title: 'The Saturday jar', emoji: '🧺', settings: { weather: null }, view, ...over });
}

// ---------- 16.5 Sleeps until… ----------

export function count(over: Partial<SleepsCountResponse> = {}): SleepsCountResponse {
  return { id: 'count-astrid', title: 'Grandma Astrid comes', emoji: '👵', note: null, day: '2026-11-23', yearly: false, sleeps: 12, links: 14, off: 2, tornTonight: false, canTear: true, tearer: leoBrief, ...over };
}

/** The counts as the drawing has them: twelve sleeps until Grandma comes, with a chain of fourteen; three more below. */
export function sleepsView(over: Partial<SleepsResponse> = {}): SleepsResponse {
  return {
    first: count(),
    others: [
      count({ id: 'count-birthday', title: "Mia's birthday", emoji: '🎂', day: '2026-12-04', yearly: true, sleeps: 23, links: 23, off: 0, tearer: null }),
      count({ id: 'count-christmas', title: 'Christmas morning', emoji: '🎄', day: '2026-12-25', yearly: true, sleeps: 44, links: 44, off: 0, tearer: null }),
      count({ id: 'count-norway', title: 'Norway', emoji: '✈️', note: 'from the trip', day: '2027-04-03', sleeps: 143, links: 60, off: 0, tearer: null }),
    ],
    passed: [],
    ...over,
  };
}

export function sleepsBoard(view: SleepsResponse = sleepsView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'sleeps', title: 'Sleeps until…', emoji: '🌙', settings: {}, view, ...over });
}

// ---------- 16.6 Where is it? ----------

export function item(over: Partial<WhereIsItItemResponse> = {}): WhereIsItItemResponse {
  return { id: 'item-tent', name: 'Tent', emoji: '⛺', place: 'Attic, blue crate 3', note: 'Tent, pegs and both mats.', photo: picture(), putBy: alexBrief, putOn: '2026-09-14', seen: null, seenBy: null, seenAt: null, only: [], mine: false, ...over };
}

const key = item({ id: 'item-key', name: 'Spare car key', emoji: '🔑', place: 'With Marta next door', note: null, photo: null, putBy: noraBrief, putOn: '2026-07-15', only: [noraBrief, alexBrief], mine: true });
const lights = item({ id: 'item-lights', name: 'Christmas lights', emoji: '🎄', place: 'Cellar, top shelf, on the left', note: null, photo: null, putOn: '2026-01-16' });
const bag = item({ id: 'item-bag', name: "Leo's swimming bag", emoji: '🎒', place: 'Hall cupboard, bottom shelf', note: null, photo: null, putBy: noraBrief, putOn: '2026-11-06', seen: 'on the hall hook', seenBy: miaBrief, seenAt: '2026-11-11T07:50:00', mine: true });
const passports = item({ id: 'item-passports', name: 'The passports', emoji: '🪪', place: 'Bedroom, grey folder', note: null, photo: null, putBy: noraBrief, putOn: '2026-10-03', only: [noraBrief, alexBrief], mine: true });

/** Everything put away, as Nora sees it with nothing asked: five things, the newest first. */
export function whereView(over: Partial<WhereIsItResponse> = {}): WhereIsItResponse {
  return { asked: null, found: null, items: [key, lights, bag, passports, item()], count: 5, ...over };
}

/** The same once "where's the tent" was asked: the tent answers, the other four stand under it. */
export const whereAnswered: WhereIsItResponse = whereView({ asked: "where's the tent", found: item(), items: [key, lights, bag, passports] });

export function whereBoard(view: WhereIsItResponse = whereView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'where_is_it', title: 'Where is it?', emoji: '📍', settings: {}, view, ...over });
}

// ---------- 16.7 Habit charts ----------

/** A week of cells from Monday 9 November 2026; today is Wednesday. `done` lists which days of the week are ticked, Monday as 0. */
export function cells(done: number[], due: number[] = [0, 1, 2, 3, 4, 5, 6]): HabitChartsCellResponse[] {
  return Array.from({ length: 7 }, (_, index) => ({ day: `2026-11-${String(9 + index).padStart(2, '0')}`, due: due.includes(index), done: done.includes(index), today: index === 2 }));
}

export function chart(over: Partial<HabitChartsChartResponse> = {}): HabitChartsChartResponse {
  return {
    id: 'chart-leo',
    title: 'Bed made, bag packed',
    emoji: null,
    people: [leoBrief],
    who: 'Leo',
    earnsStars: true,
    stars: 21,
    days: [],
    rows: [
      { row: 0, label: 'Bed made', icon: 'sun', cells: cells([0, 1, 2]) },
      { row: 1, label: 'Bag packed', icon: 'moon', cells: cells([0, 1]) },
    ],
    doneThisWeek: 5,
    possibleSoFar: 6,
    streak: 2,
    dueToday: true,
    doneToday: false,
    line: '5 of 6 so far this week',
    ...over,
  };
}

/** The charts as the drawing has them: Leo's and Mia's with their stars, and the grown-ups' two. */
export function chartsView(over: Partial<HabitChartsResponse> = {}): HabitChartsResponse {
  return {
    weekStart: '2026-11-09',
    weekEnd: '2026-11-15',
    charts: [
      chart(),
      chart({ id: 'chart-mia', title: 'Reading, 20 minutes', people: [miaBrief], who: 'Mia', stars: 34, rows: [{ row: 0, label: null, icon: 'book', cells: cells([0, 1]) }], doneThisWeek: 2, possibleSoFar: 3, streak: 9, line: '9 days in a row' }),
      chart({ id: 'chart-phones', title: 'Phones off the table at dinner', emoji: '📱', people: [], who: 'Everyone', earnsStars: false, stars: null, rows: [{ row: 0, label: null, icon: null, cells: cells([0, 1, 2]) }], doneThisWeek: 3, possibleSoFar: 3, streak: 4, doneToday: true, line: '4 dinners running' }),
      chart({ id: 'chart-screens', title: 'One evening a week with no screens', emoji: '📺', people: [noraBrief, alexBrief], who: 'You and Alex', earnsStars: false, stars: null, days: ['wed'], rows: [{ row: 0, label: null, icon: null, cells: cells([], [2]) }], doneThisWeek: 0, possibleSoFar: 1, streak: 2, line: 'Wednesdays' }),
    ],
    ...over,
  };
}

export function chartsBoard(view: HabitChartsResponse = chartsView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return board({ template: 'habit_charts', title: 'Habit charts', emoji: '✅', settings: {}, view, ...over });
}
