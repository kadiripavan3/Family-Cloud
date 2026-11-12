import type {
  BoardCard,
  BoardResponse,
  CircleResponse,
  FairerSplitShareResponse,
  FairerSplitSplitResponse,
  FairerSplitVersionResponse,
  FairerSplitViewResponse,
  GuestBookLineResponse,
  GuestBookViewResponse,
  HeadsUpNoticeResponse,
  HeadsUpViewResponse,
  HeardQuoteResponse,
  HeardViewResponse,
  KittyItemResponse,
  KittyLineResponse,
  KittyViewResponse,
  LivedHereRowResponse,
  LivedHereViewResponse,
  PersonBrief,
} from '@/api/generated/homeport';

import { circle, everyone, member, thing } from './spine';
import { board, boardCard, picture } from './templates';

/**
 * Made-up answers for the tests of housemates: whole objects, the way the API sends them. Import them from
 * '@/test/samples/flat'; the people and circles every test shares are in '@/test/samples'.
 *
 * The flat is Trubarjeva 9, seen on Kai's phone on Thursday 12 November 2026, at ten to eight in the
 * evening: Kai, Lea and Lena live there, and Ana has moved out.
 */

/** The moment the flat's tests are seen at. `pinClock()` makes it "now". */
export const NOW = new Date(2026, 10, 12, 19, 50);

/**
 * Pins the clock for a test (the date only: timers keep running), so "an hour ago", "Tuesday" and "2 Nov"
 * read the same whenever and wherever the test runs. Put the real clock back with `jest.useRealTimers()`.
 */
export function pinClock(now: Date = NOW) {
  jest.useFakeTimers({
    now,
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'performance', 'hrtime'],
  });
}

/** A moment on this phone's clock, as the API writes moments. */
const at = (year: number, month: number, day: number, hours: number, minutes: number) => new Date(year, month - 1, day, hours, minutes).toISOString();

export const kaiBrief: PersonBrief = { memberId: 'm-kai', name: 'Kai', avatarUrl: null };
export const leaBrief: PersonBrief = { memberId: 'm-lea', name: 'Lea', avatarUrl: null };
export const lenaBrief: PersonBrief = { memberId: 'm-lena', name: 'Lena', avatarUrl: null };
export const anaBrief: PersonBrief = { memberId: 'm-ana', name: 'Ana', avatarUrl: null };

/** The flat, seen by Kai. Nobody is in charge: everyone runs it. */
export const flatCircle: CircleResponse = circle({
  id: 'c-flat',
  kind: 'flat',
  name: 'Trubarjeva 9',
  startsAs: 'circle',
  hasRoles: false,
  myMemberId: 'm-kai',
  myRole: 'adult',
  members: [
    member({ id: 'm-kai', circleId: 'c-flat', name: 'Kai', role: 'owner', you: true }),
    member({ id: 'm-lea', circleId: 'c-flat', name: 'Lea', role: 'adult', tint: 2 }),
    member({ id: 'm-lena', circleId: 'c-flat', name: 'Lena', role: 'adult', tint: 3 }),
  ],
  shared: {},
});

/** A board of the flat, whatever its template. */
const flatBoard = (over: Partial<BoardResponse>): BoardResponse => board({ circleId: 'c-flat', chip: everyone, day: '2026-11-12', updatedAt: '2026-11-12T09:00:00Z', ...over });

// ---------- 18.3 the kitty ----------

export function kittyItem(over: Partial<KittyItemResponse> = {}): KittyItemResponse {
  return { id: 'item-loo-roll', name: 'Loo roll', low: false, tappedBy: null, ...over };
}

export function kittyLine(over: Partial<KittyLineResponse> = {}): KittyLineResponse {
  return { id: 'line-loo-roll', kind: 'out', title: 'Loo roll, bin bags', who: leaBrief, day: '2026-11-10', cents: -890, receipt: picture('receipt'), mine: false, ...over };
}

/** The kitty as the drawing has it: €6.40, Lena hasn't paid in and it's her turn to shop, loo roll is running low. */
export function kittyView(over: Partial<KittyViewResponse> = {}): KittyViewResponse {
  return {
    balanceCents: 640,
    currency: 'EUR',
    low: true,
    eachCents: 1000,
    payInDay: 1,
    month: '2026-11-01',
    monthName: 'November',
    paidIn: [kaiBrief, leaBrief],
    notPaidIn: [lenaBrief],
    paidInCents: 2000,
    youPaidIn: true,
    yourPayInId: 'line-in-kai',
    items: [
      kittyItem({ low: true, tappedBy: leaBrief }),
      kittyItem({ id: 'item-bin-bags', name: 'Bin bags' }),
      kittyItem({ id: 'item-oil', name: 'Oil' }),
      kittyItem({ id: 'item-dish-soap', name: 'Dish soap' }),
      kittyItem({ id: 'item-coffee', name: 'Coffee' }),
    ],
    shopper: lenaBrief,
    yourTurn: false,
    leftOverCents: 1000,
    leftOverFrom: 'October',
    lines: [
      kittyLine(),
      kittyLine({ id: 'line-oil', title: 'Olive oil, salt, sponges', who: kaiBrief, day: '2026-11-02', cents: -1470, receipt: null, mine: true }),
      kittyLine({ id: 'line-in-lea', kind: 'in', title: 'Paid in for November', who: leaBrief, day: '2026-11-01', cents: 1000, receipt: null }),
      kittyLine({ id: 'line-in-kai', kind: 'in', title: 'Paid in for November', who: kaiBrief, day: '2026-11-01', cents: 1000, receipt: null, mine: true }),
    ],
    ...over,
  };
}

/** The same kitty on the first of the month, before Kai paid in, when it is Kai's turn to shop. */
export const kittyOwing: KittyViewResponse = kittyView({
  balanceCents: 1000,
  low: false,
  paidIn: [],
  notPaidIn: [kaiBrief, leaBrief, lenaBrief],
  paidInCents: 0,
  youPaidIn: false,
  yourPayInId: null,
  shopper: kaiBrief,
  yourTurn: true,
  lines: [],
});

export function kittyBoard(view: KittyViewResponse = kittyView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return flatBoard({ template: 'kitty', title: 'The kitty', emoji: '💰', settings: { eachCents: view.eachCents, currency: view.currency, payInDay: view.payInDay }, view, ...over });
}

/** The kitty in a list of the flat's boards: what "Running low" on Today finds it by. */
export const kittyCard: BoardCard = boardCard({ circleId: 'c-flat', template: 'kitty', title: 'The kitty', emoji: '💰', glance: "€6.40 left · Lena hasn't paid in yet" });

// ---------- 18.4 a fairer split ----------

export function share(person: PersonBrief, cents: number, over: Partial<FairerSplitShareResponse> = {}): FairerSplitShareResponse {
  return { person, you: person.memberId === 'm-kai', cents, byRuleCents: cents, measure: null, note: null, percent: 33, paid: false, ...over };
}

export function version(over: Partial<FairerSplitVersionResponse> = {}): FairerSplitVersionResponse {
  return {
    id: 'proposal-rent',
    way: 'room',
    totalCents: 95000,
    shared: 20,
    shares: [share(kaiBrief, 37200, { measure: 18, note: 'the big room' }), share(leaBrief, 31000, { measure: 14 }), share(lenaBrief, 26800, { measure: 11, note: 'facing the street' })],
    proposedBy: kaiBrief,
    proposedAt: '2026-08-30T19:30:00Z',
    agreedOn: '2026-09-01',
    agreedBy: [kaiBrief, leaBrief, lenaBrief],
    waitingFor: [],
    youAgreed: true,
    needsYou: false,
    yours: false,
    ...over,
  };
}

/** The rent: by room size, nudged to round numbers, agreed by all three on 1 September. */
export function rentSplit(over: Partial<FairerSplitSplitResponse> = {}): FairerSplitSplitResponse {
  return { id: 'split-rent', name: 'Rent', title: 'Rent', group: 'rent', repeats: true, from: null, to: null, payer: null, currency: 'EUR', agreed: version(), proposed: null, settled: false, ...over };
}

export const kittySplit: FairerSplitSplitResponse = rentSplit({
  id: 'split-kitty',
  name: 'The kitty',
  title: 'The kitty',
  group: 'kitty',
  agreed: version({ id: 'proposal-kitty', way: 'equal', totalCents: 3000, shared: null, shares: [share(kaiBrief, 1000), share(leaBrief, 1000), share(lenaBrief, 1000)] }),
});

/** October's electricity, by nights at home: Lea paid the bill, Kai and Lena still owe their shares. */
export function electricity(over: Partial<FairerSplitSplitResponse> = {}): FairerSplitSplitResponse {
  return rentSplit({
    id: 'split-electricity',
    name: 'Electricity',
    title: "October's electricity",
    group: 'bills',
    repeats: false,
    from: '2026-10-01',
    to: '2026-10-31',
    payer: leaBrief,
    agreed: version({
      id: 'proposal-electricity',
      way: 'nights',
      totalCents: 15900,
      shared: null,
      shares: [share(kaiBrief, 6079, { measure: 26 }), share(leaBrief, 7015, { measure: 30, paid: true }), share(lenaBrief, 2806, { measure: 12 })],
      proposedBy: leaBrief,
      agreedOn: '2026-11-05',
    }),
    ...over,
  });
}

/** Lea's new numbers for the rent, as Kai sees them: Lea said yes by proposing, Kai and Lena are still asked. */
export const leasProposal: FairerSplitVersionResponse = version({
  id: 'proposal-new',
  shares: [share(kaiBrief, 38000, { measure: 18, note: 'the big room' }), share(leaBrief, 30000, { measure: 14 }), share(lenaBrief, 27000, { measure: 11, note: 'facing the street' })],
  proposedBy: leaBrief,
  agreedOn: null,
  agreedBy: [leaBrief],
  waitingFor: [kaiBrief, lenaBrief],
  youAgreed: false,
  needsYou: true,
  yours: false,
});

export function splitView(over: Partial<FairerSplitViewResponse> = {}): FairerSplitViewResponse {
  return { splits: [rentSplit(), kittySplit, electricity()], waitingForYou: 0, ...over };
}

export function splitBoard(view: FairerSplitViewResponse = splitView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return flatBoard({ template: 'fairer_split', title: 'How we split', emoji: '📊', settings: {}, view, ...over });
}

// ---------- 18.5 heads-up ----------

export function notice(over: Partial<HeadsUpNoticeResponse> = {}): HeadsUpNoticeResponse {
  return {
    id: 'notice-saturday',
    text: 'Six people over on Saturday, done by midnight',
    detail: null,
    what: 'guests',
    from: leaBrief,
    mine: false,
    writtenAt: new Date(NOW.getTime() - 60 * 60_000).toISOString(),
    fromDay: '2026-11-14',
    untilDay: null,
    nightsAway: null,
    replies: [{ who: lenaBrief, says: 'fine', text: null, yours: false }],
    waitingFor: [kaiBrief],
    everyoneFine: false,
    yourAnswer: null,
    needsYou: true,
    over: false,
    ...over,
  };
}

export const sisterNotice: HeadsUpNoticeResponse = notice({
  id: 'notice-sister',
  text: "My sister's staying, Friday to Sunday",
  detail: 'on the sofa',
  from: lenaBrief,
  writtenAt: new Date(NOW.getTime() - 24 * 60 * 60_000).toISOString(),
  fromDay: '2026-11-13',
  untilDay: '2026-11-15',
  replies: [
    { who: kaiBrief, says: 'fine', text: null, yours: true },
    { who: leaBrief, says: 'fine', text: null, yours: false },
  ],
  waitingFor: [],
  everyoneFine: true,
  yourAnswer: 'fine',
  needsYou: false,
});

export const awayNotice: HeadsUpNoticeResponse = notice({
  id: 'notice-away',
  text: "I'm away 20 to 27 November",
  what: 'away',
  from: kaiBrief,
  mine: true,
  writtenAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60_000).toISOString(),
  fromDay: '2026-11-20',
  untilDay: '2026-11-27',
  nightsAway: 7,
  replies: [{ who: leaBrief, says: 'fine', text: 'will water the plants', yours: false }],
  waitingFor: [lenaBrief],
  needsYou: false,
});

/** A notice that is over: Lena's weeks at her parents' in October. */
export const overNotice: HeadsUpNoticeResponse = notice({
  id: 'notice-parents',
  text: "At my parents' for a while",
  what: 'away',
  from: lenaBrief,
  writtenAt: at(2026, 9, 29, 19, 0),
  fromDay: '2026-10-01',
  untilDay: '2026-10-20',
  nightsAway: 19,
  replies: [],
  waitingFor: [],
  needsYou: false,
  over: true,
});

/** Heads-up as the drawing has it: Lea's Saturday waits for Kai, Lena's sister is fine with everyone, Kai's week away, and the quiet hours. */
export function headsUpView(over: Partial<HeadsUpViewResponse> = {}): HeadsUpViewResponse {
  return { notices: [notice(), sisterNotice, awayNotice], earlier: 3, needYou: 1, standing: 'Quiet after 23:00 on weeknights', standingNote: 'From the House rules, agreed by all three.', ...over };
}

export function headsUpBoard(view: HeadsUpViewResponse = headsUpView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return flatBoard({ template: 'heads_up', title: 'Heads-up', emoji: '👋', settings: { standing: view.standing, standingNote: view.standingNote }, view, ...over });
}

// ---------- 18.6 heard in the kitchen ----------

export function heardQuote(over: Partial<HeardQuoteResponse> = {}): HeardQuoteResponse {
  return { id: 'quote-buffering', text: "I'm not hungover. I'm buffering.", who: leaBrief, whoName: null, you: false, about: null, day: '2026-11-08', writtenAt: at(2026, 11, 8, 11, 40), writtenBy: kaiBrief, mine: true, ...over };
}

export const quoteMould: HeardQuoteResponse = heardQuote({ id: 'quote-mould', text: "That's not mould. That's character.", who: kaiBrief, you: true, about: 'about the bathroom ceiling', day: '2026-10-30', writtenAt: at(2026, 10, 30, 21, 5), writtenBy: lenaBrief, mine: false });
export const quoteHeating: HeardQuoteResponse = heardQuote({ id: 'quote-heating', text: 'Whose turn is it to have opinions about the heating?', who: lenaBrief, about: 'the first cold night', day: '2026-10-16', writtenAt: at(2026, 10, 16, 22, 15), writtenBy: leaBrief, mine: false });
export const quoteClock: HeardQuoteResponse = heardQuote({ id: 'quote-clock', text: "I'm not late. The clock is early.", day: '2026-10-09', writtenAt: at(2026, 10, 9, 20, 45), writtenBy: lenaBrief, mine: false });

/** The 112 lines of the flat: Lea 44, Lena 38, Kai 30. */
export function heardView(over: Partial<HeardViewResponse> = {}): HeardViewResponse {
  return {
    total: 112,
    people: [
      { person: leaBrief, you: false, count: 44 },
      { person: lenaBrief, you: false, count: 38 },
      { person: kaiBrief, you: true, count: 30 },
    ],
    latest: [heardQuote(), quoteMould, quoteHeating, quoteClock],
    ...over,
  };
}

export function heardBoard(view: HeardViewResponse = heardView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return flatBoard({ template: 'heard', title: 'Heard in the kitchen', emoji: '💬', mine: false, settings: {}, view, ...over });
}

// ---------- 18.7 the guest book ----------

export function guestLine(over: Partial<GuestBookLineResponse> = {}): GuestBookLineResponse {
  return { id: 'line-tom', text: 'Came for a weekend, stayed for the pancakes.', name: 'Tom', about: 'from Leeds', nights: 3, day: '2026-10-12', photo: picture('breakfast'), waiting: false, fromTheDoor: true, letInBy: leaBrief, ...over };
}

export const lineMaja: GuestBookLineResponse = guestLine({ id: 'line-maja', text: 'Best sofa in Ljubljana. Sorry about the glass.', name: 'Maja', about: "Lena's sister", nights: 2, day: '2026-09-17', photo: picture('mugs'), letInBy: lenaBrief });
export const lineAna: GuestBookLineResponse = guestLine({ id: 'line-ana', text: 'Thank you for New Year. I remember most of it.', name: 'Ana', about: 'who used to live here', nights: null, day: '2026-01-01', photo: picture('sparkler'), letInBy: kaiBrief });
export const lineKatja: GuestBookLineResponse = guestLine({ id: 'line-katja', text: 'Came to help Ana move out. Cried on your sofa.', name: 'Katja', about: "Ana's sister", nights: 4, day: '2025-12-12', photo: null });
/** A line that came through the code by the door an hour ago and waits for a flatmate's yes. */
export const lineWaiting: GuestBookLineResponse = guestLine({ id: 'line-waiting', text: 'The balcony at sunrise. Thank you.', name: 'Nika', about: 'from Maribor', nights: 1, day: '2026-11-12', photo: null, waiting: true, letInBy: null });

/** The book as the drawing has it: 23 guests, 61 nights, the code by the door, nothing waiting. */
export function guestBookView(over: Partial<GuestBookViewResponse> = {}): GuestBookViewResponse {
  return { guests: 4, nights: 9, since: 2025, link: 'https://homeport.app/book/6hzd5-vkx3q-4qy6v-6tz5a', decides: true, waiting: [], latest: [guestLine(), lineMaja, lineAna, lineKatja], ...over };
}

export function guestBookBoard(view: GuestBookViewResponse = guestBookView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return flatBoard({ template: 'guest_book', title: 'The guest book', emoji: '🔑', settings: {}, view, ...over });
}

// ---------- 18.8 everyone who's lived here ----------

export function rollRow(over: Partial<LivedHereRowResponse> = {}): LivedHereRowResponse {
  return { entryId: 'resident-lena', person: lenaBrief, name: 'Lena', count: 1, you: false, fromYear: 2026, untilYear: null, note: 'The small room, facing the street', byHand: true, ...over };
}

export const anaRow: LivedHereRowResponse = rollRow({ entryId: 'resident-ana', person: anaBrief, name: 'Ana', fromYear: 2023, untilYear: 2025, note: 'Moved to Lisbon. Still in the photos, off the Wi‑Fi.' });
export const beforeRow: LivedHereRowResponse = rollRow({ entryId: 'before-two', person: null, name: 'Two people before you', count: 2, fromYear: 2021, untilYear: 2023, note: 'Left the house manual and a cactus' });
export const houseRules = thing({ id: '66666666-6666-4666-8666-666666666666', circleId: 'c-flat', title: 'House rules', chip: everyone, glance: 'Quiet after 22:00 on weekdays' });
export const binDays = thing({ id: '77777777-7777-4777-8777-777777777777', circleId: 'c-flat', title: 'Bin days', chip: everyone, mine: false, glance: 'Tuesday night: rubbish' });
export const whoToCall = thing({ id: '88888888-8888-4888-8888-888888888888', circleId: 'c-flat', title: 'Who to call', chip: everyone, glance: 'Mr Zupan, weekdays before 17:00' });

/** The roll as the drawing has it: Lena, Lea and Kai here now; Ana and two people before. */
export function rollView(over: Partial<LivedHereViewResponse> = {}): LivedHereViewResponse {
  return {
    hereNow: [rollRow(), rollRow({ entryId: 'resident-lea', person: leaBrief, name: 'Lea', fromYear: 2024, note: null }), rollRow({ entryId: 'resident-kai', person: kaiBrief, name: 'Kai', you: true, fromYear: 2023, note: null })],
    before: [anaRow, beforeRow],
    handedOn: [
      { entryId: 'handed-rules', thing: houseRules },
      { entryId: 'handed-bins', thing: binDays },
    ],
    ...over,
  };
}

export function rollBoard(view: LivedHereViewResponse = rollView(), over: Partial<BoardResponse> = {}): BoardResponse {
  return flatBoard({ template: 'lived_here', title: 'Trubarjeva 9, flat 3', emoji: '🏡', settings: {}, view, ...over });
}
