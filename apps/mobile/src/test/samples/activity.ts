/**
 * Made-up answers for the tests of Activity, the Sunday summary, exporting and leaving: whole objects, the
 * way the API sends them. Import them from '@/test/samples/activity'; the people and circles every test
 * shares are in '@/test/samples'.
 */
import type { ActivityLine, ActivityResponse, AskResponse, ExportResponse, LeavingResponse, SummaryResponse, SwitcherResponse } from '@/api/generated/homeport';

import { loaded } from './index';

/** The moment the tests of Activity stand at: Wednesday 11 November 2026, 21:00 on the phone's own clock. */
export const NOW = new Date(2026, 10, 11, 21, 0, 0);
/** A moment so many minutes before `NOW`, as the API writes one. */
export const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

export const ids = {
  ask: '02782788-9652-4713-ba31-0cda32184fc2',
  pin: '50e98856-fa96-4ff1-b747-1be33210a3f7',
  bill: '0e070f8e-b017-408e-b53b-c2c03bb02409',
  bins: '3d6b9ad3-8574-4070-bb69-5c2065c17825',
  wheel: '934cc7ac-9bcd-4996-a338-e61926c8abf9',
  groceries: '13e92bfb-6283-4e1e-a03f-a8811016dcad',
  alex: '76513055-0044-4217-b6be-be8daf795981',
  hero: 'f89b1c71-88db-4b3a-896f-cf399b099bf0',
  dentist: 'a1911651-392d-48b4-9641-ef88c256423e',
  export: '5f0c7a0e-11aa-4c3e-9a51-5d5a8f6a2b10',
};

const alex = { memberId: ids.alex, name: 'Alex', avatarUrl: null };
const mia = { memberId: 'm-mia', name: 'Mia', avatarUrl: null };
const leo = { memberId: 'm-leo', name: 'Leo', avatarUrl: null };

/** Alex asks to see the bank card PIN, twelve minutes ago, for today only: new, with its two buttons. */
export const askLine: ActivityLine = {
  id: 'line-ask',
  kind: 'ask',
  at: ago(12),
  fresh: true,
  sentence: [
    { text: 'Alex', bold: true },
    { text: ' asks to see ', bold: false },
    { text: 'Bank card PIN', bold: true },
    { text: ' in the Vault', bold: false },
  ],
  note: 'for today only',
  people: [alex],
  emoji: null,
  imageUrl: null,
  thingId: ids.pin,
  thingKind: 'vault_item',
  buttons: [
    { label: 'Allow', act: 'allow_ask', thingId: ids.pin, askId: ids.ask, memberId: ids.alex, until: '2026-11-11T23:00:00Z', once: false, dueOn: null },
    { label: 'Not now', act: 'decline_ask', thingId: ids.pin, askId: ids.ask, memberId: ids.alex, until: null, once: null, dueOn: null },
  ],
};

/** Alex's nineteen photos, two hours ago: new, one line for all of them, with a picture and no thing of its own. */
export const photosLine: ActivityLine = {
  id: 'line-photos',
  kind: 'photos',
  at: ago(120),
  fresh: true,
  sentence: [
    { text: 'Alex', bold: true },
    { text: ' added 19 photos to ', bold: false },
    { text: 'Saturday at the lake', bold: true },
  ],
  note: null,
  people: [alex],
  emoji: null,
  imageUrl: 'https://example.com/canoe.jpg',
  thingId: null,
  thingKind: undefined,
  buttons: [],
};

/** Leo fed Biscuit at 7:40 this morning. */
export const wheelLine: ActivityLine = {
  id: 'line-wheel',
  kind: 'board',
  at: new Date(2026, 10, 11, 7, 40).toISOString(),
  fresh: false,
  sentence: [
    { text: 'Leo', bold: true },
    { text: ' fed Biscuit and earned a star', bold: false },
  ],
  note: 'Chore wheel',
  people: [leo],
  emoji: null,
  imageUrl: null,
  thingId: ids.wheel,
  thingKind: 'board',
  buttons: [],
};

/** Ines, a guest, opened her pass on Monday at 18:02: nobody's face, nothing to open. */
export const passLine: ActivityLine = {
  id: 'line-pass',
  kind: 'guest_pass',
  at: new Date(2026, 10, 9, 18, 2).toISOString(),
  fresh: false,
  sentence: [
    { text: 'Ines', bold: true },
    { text: ' opened their guest pass', bold: false },
  ],
  note: 'it ended at 23:30',
  people: [],
  emoji: null,
  imageUrl: null,
  thingId: null,
  thingKind: undefined,
  buttons: [],
};

/** Alex and Mia changed Groceries on Monday: two faces, and a line that counts several moments. */
export const listLine: ActivityLine = {
  id: 'line-list',
  kind: 'list',
  at: new Date(2026, 10, 9, 17, 15).toISOString(),
  fresh: false,
  sentence: [
    { text: 'Alex', bold: true },
    { text: ' and ', bold: false },
    { text: 'Mia', bold: true },
    { text: ' changed ', bold: false },
    { text: 'Groceries', bold: true },
  ],
  note: '9 things added, 5 ticked',
  people: [alex, mia],
  emoji: null,
  imageUrl: null,
  thingId: ids.groceries,
  thingKind: 'checklist',
  buttons: [],
};

/** Electricity is due tomorrow: no moment, the bill's own emoji, and "Pay". */
export const dueLine: ActivityLine = {
  id: `due:${ids.bill}:2026-11-12`,
  kind: 'due',
  at: null,
  fresh: false,
  sentence: [
    { text: 'Electricity', bold: true },
    { text: ' is due tomorrow, €84.20', bold: false },
  ],
  note: 'Your half is €42.10',
  people: [],
  emoji: '⚡',
  imageUrl: null,
  thingId: ids.bill,
  thingKind: 'bill',
  buttons: [{ label: 'Pay', act: 'pay', thingId: ids.bill, askId: null, memberId: null, until: null, once: null, dueOn: '2026-11-12' }],
};

/** A journey told in the sister app and kept from there, on Sunday: Journey's mark in front, a picture, and no thing of its own to open. */
export const keptLine: ActivityLine = {
  id: 'line-kept',
  kind: 'kept',
  at: new Date(2026, 10, 8, 19, 30).toISOString(),
  fresh: false,
  sentence: [
    { text: 'Iceland ring road', bold: true },
    { text: ' was kept from Journey', bold: false },
  ],
  note: '214 originals, now in Trips',
  people: [],
  emoji: null,
  imageUrl: 'https://example.com/waterfall.jpg',
  thingId: null,
  thingKind: undefined,
  buttons: [],
};

/** A line from long ago. */
export const oldLine: ActivityLine = { ...wheelLine, id: 'line-old', at: new Date(2026, 9, 2, 9, 0).toISOString(), note: 'Chore wheel' };

/** One page of Activity as the drawing has it: the ask and the photos new, what is due, the morning, and Monday. */
export function activityPage(over: Partial<ActivityResponse> = {}): ActivityResponse {
  return { due: [dueLine], items: [askLine, photosLine, wheelLine, passLine, listLine], nextCursor: null, asks: 1, fresh: 2, muted: false, ...over };
}

/** What `useGetActivityInfinite` gives the screen: the pages so far, and whether there is another. */
export function activityAsked(pages: ActivityResponse[] = [activityPage()], more = false) {
  return { ...loaded({ pages, pageParams: pages.map(() => undefined) }), hasNextPage: more, isFetchingNextPage: false, fetchNextPage: jest.fn() };
}

/** The ask, as the API sends it back once it is answered. */
export function ask(over: Partial<AskResponse> = {}): AskResponse {
  return { id: ids.ask, circleId: 'c-linds', thingId: ids.pin, title: 'Bank card PIN', kind: 'vault_item', askerId: ids.alex, askerName: 'Alex', until: '2026-11-11T23:00:00Z', once: false, state: 'open', askedAt: ago(12), answeredAt: null, mine: false, ...over };
}

/** The Linds' week of 2 to 8 November, as the drawing has it. */
export function summary(over: Partial<SummaryResponse> = {}): SummaryResponse {
  return {
    circleId: 'c-linds',
    circleName: 'The Linds',
    from: '2026-11-02',
    to: '2026-11-08',
    range: '2 to 8 Nov',
    hero: { thingId: ids.hero, kind: 'photo', imageUrl: 'https://example.com/canoe.jpg', pill: 'Most loved', title: '86 new photos, one very good Saturday', line: "Mia's first time steering" },
    stats: [
      { figure: '€350', label: 'saved', order: 40 },
      { figure: '86', label: 'photos', order: 10 },
      { figure: '5', label: 'events', order: 20 },
      { figure: '3', label: 'bills paid', order: 30 },
    ],
    nextWeek: [
      { thingId: ids.dentist, kind: 'event', emoji: '📅', imageUrl: null, title: 'Dentist for Mia, haircut for Leo', line: 'Wed 15:30 · Sat 10:00', day: '2026-11-11' },
      { thingId: ids.bill, kind: 'bill', emoji: '⚡', imageUrl: null, title: 'Electricity, €84.20', line: 'Due Thursday', day: '2026-11-12' },
    ],
    sections: [],
    anything: true,
    inShort: '86 photos · 5 events · 3 bills paid · €350 saved',
    ...over,
  };
}

/** The numbers before Nora leaves The Linds. */
export function leavingNumbers(over: Partial<LeavingResponse> = {}): LeavingResponse {
  return { circleId: 'c-linds', circleName: 'The Linds', onlyYours: 24, shared: 156, passwords: 5, lastOne: false, nextOwner: 'Alex', ownerNeeded: false, ...over };
}

/** An export of The Linds: ready unless told otherwise. */
export function exported(over: Partial<ExportResponse> = {}): ExportResponse {
  return {
    id: ids.export,
    circleId: 'c-linds',
    scope: 'everything',
    state: 'ready',
    url: 'https://files.example.com/exports/k3y/homeport-export-2026-11-11.zip',
    bytes: 48 * 1024 * 1024,
    files: 214,
    leftOut: [],
    askedAt: ago(120),
    readyAt: ago(118),
    expiresAt: '2026-11-18T19:02:00Z',
    ...over,
  };
}

/** The circle switcher's answer: each circle's line as the API writes it, and what "Just me" counts. */
export function switcher(over: Partial<SwitcherResponse> = {}): SwitcherResponse {
  return {
    circles: [
      { id: 'c-linds', name: 'The Linds', kind: 'family', coverUrl: null, line: 'Family · 4 people and Biscuit' },
      { id: 'c-crew', name: 'Lisbon crew', kind: 'crew', coverUrl: null, line: "Friends · 5 people · you're owed €64" },
      { id: 'c-couple', name: 'Nora and Alex', kind: 'couple', coverUrl: null, line: 'Couple · 2 people' },
    ],
    onlyYou: 38,
    ...over,
  };
}
