import type { JotResponse, ReadingResponse, ReadItemResponse, WaysResponse, WidgetsResponse } from '@/api/generated/homeport';

/**
 * Made-up answers for the tests of Jot: whole objects, the way the API sends them. Import them from
 * '@/test/samples/jot'; the people and circles every test shares are in '@/test/samples'.
 */

const GROCERIES = '22222222-2222-4222-8222-222222222222';

/** One thing a jot became. On its own: "Milk", on the Groceries list, typed in the app just now. */
export function jotMade(over: Partial<JotResponse> = {}): JotResponse {
  return {
    id: 'j-milk',
    batchId: 'b-1',
    words: 'milk',
    source: 'app',
    became: 'list_item',
    title: 'Milk',
    where: 'Groceries',
    thingId: GROCERIES,
    thingKind: 'checklist',
    itemId: 'i-milk',
    gone: false,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

export const eggsJot = jotMade({ id: 'j-eggs', words: 'eggs', title: 'Eggs', itemId: 'i-eggs' });
export const plumberJot = jotMade({ id: 'j-plumber', batchId: 'b-2', words: 'Call the plumber tomorrow at 9', became: 'reminder', title: 'Call the plumber', where: 'Reminder · tomorrow 9:00', thingId: 'r-plumber', thingKind: 'reminder', itemId: null });
export const noteJot = jotMade({ id: 'j-note', batchId: 'b-3', words: 'Mia needs €5 for the class photo', became: 'note', title: 'Mia needs €5 for the class photo', where: 'Note', thingId: 'p-note', thingKind: 'page', itemId: null });
/** Held back: it looks like a code and hasn't been kept anywhere. */
export const codeJot = jotMade({ id: 'j-code', batchId: 'b-4', words: 'the gate code is 4471', became: 'code', title: 'Gate code 4471', where: 'Looks like a code', thingId: null, thingKind: null, itemId: null });

/** One thing a line holds, as it is read before anything is saved. */
export function readItem(over: Partial<ReadItemResponse> = {}): ReadItemResponse {
  return {
    as: 'list_item',
    words: 'milk',
    title: 'Milk',
    day: null,
    time: null,
    endTime: null,
    whenLabel: null,
    whenNear: null,
    person: null,
    personRole: null,
    personLabel: null,
    remindMinutes: null,
    remindLabel: null,
    repeat: null,
    list: { id: GROCERIES, title: 'Groceries' },
    quantity: null,
    code: null,
    place: null,
    pieces: [],
    ...over,
  };
}

export const eggsRead = readItem({ words: 'Eggs', title: 'Eggs' });
export const carRead = readItem({ as: 'reminder', words: 'remind Alex about the car at 6', title: 'The car', day: '2026-11-11', time: '18:00', whenNear: 'today 18:00', whenLabel: 'Wed 11 Nov · 18:00', person: { memberId: 'm-alex', name: 'Alex Strand', avatarUrl: null }, personRole: 'given_to', personLabel: 'Given to Alex', list: null });
export const mumRead = readItem({ as: 'reminder', words: 'remind me to call Mum at six', title: 'Call Mum', day: '2026-11-11', time: '18:00', whenNear: 'today 18:00', person: { memberId: 'm-nora', name: 'Nora Lind', avatarUrl: null }, personRole: 'given_to', personLabel: 'For you', list: null });
export const codeRead = readItem({ as: 'code', words: 'the gate code is 4471', title: 'Gate code 4471', code: 'code', list: null });

/** How a line is read: the things in it. */
export function reading(items: ReadItemResponse[] = [readItem()]): ReadingResponse {
  return { letter: false, items, dates: [], amounts: [] };
}

/** The school letter: too long to be a line, so its days and its amount come back. */
export const letterText =
  'Class 4B is going to the Postojna caves on Friday 20 November at 8:00. Please sign the attached form and return it by Wed 18 Nov. The trip costs €12, to be paid to the school together with the form.';
export const letterReading: ReadingResponse = {
  letter: true,
  items: [],
  dates: [
    { day: '2026-11-20', time: '08:00', deadline: false, title: 'Class 4B is going to the Postojna caves', around: 'Class 4B is going to the Postojna caves on Friday 20 November at 8:00.', start: 40, end: 61 },
    { day: '2026-11-18', time: null, deadline: true, title: 'Sign the attached form and return it', around: 'Please sign the attached form and return it by Wed 18 Nov.', start: 180, end: 194 },
  ],
  amounts: [{ cents: 1200, currency: 'EUR', around: 'The trip costs €12, to be paid to the school together with the form.', start: 210, end: 213 }],
};

export function ways(over: Partial<WaysResponse> = {}): WaysResponse {
  return { pinnedNote: true, voice: true, share: true, timedAs: 'reminder', codes: 'ask', buyList: { id: GROCERIES, title: 'Groceries' }, buyListIsYours: false, forwardAddress: null, ...over };
}

/** What the widgets, the pinned note and the Lock Screen show: the Linds' Wednesday, with Alex at the shop. */
export function widgets(over: Partial<WidgetsResponse> = {}): WidgetsResponse {
  const list = {
    id: GROCERIES,
    title: 'Groceries',
    left: 7,
    done: 1,
    lines: [
      { id: 'i-bananas', text: 'Bananas', done: false },
      { id: 'i-strawberries', text: 'Strawberries', done: false },
      { id: 'i-oats', text: 'Oat milk', done: false },
      { id: 'i-butter', text: 'Butter', done: true },
    ],
  };
  return {
    day: '2026-11-11',
    chips: ['Milk', 'Eggs', 'Bread', 'Coffee'],
    shopping: list,
    inUse: { list, by: { memberId: 'm-alex', name: 'Alex Strand', avatarUrl: null }, you: false, since: '2026-11-11T08:00:00Z' },
    next: [
      { thingId: 'e-dentist', kind: 'event', lead: '15:30', title: 'Dentist · Mia', note: 'Alex is taking her', done: null },
      { thingId: 'r-bins', kind: 'reminder', lead: '19:00', title: 'Bins, your turn', note: '', done: false },
      { thingId: 'b-power', kind: 'bill', lead: '€84', title: 'Electricity', note: 'Due tomorrow', done: null },
    ],
    addedToday: 3,
    ...over,
  };
}
