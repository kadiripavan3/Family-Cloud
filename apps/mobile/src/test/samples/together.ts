/**
 * Made-up answers for the tests of With Journey: whole objects, the way the API sends them. Import them from
 * '@/test/samples/together'; the people and circles every test shares are in '@/test/samples'.
 */
import type {
  AppSwitchResponse,
  AtHomeResponse,
  AwayResponse,
  GoodnightResponse,
  HomeSettingsResponse,
  JourneyBookResponse,
  JourneyBrief,
  JourneyDraftResponse,
  JourneyJobResponse,
  JourneyPastDay,
  KeepOptions,
  KeptResponse,
  LeavingCheckResponse,
  PersonBrief,
  TodayCard,
  TripResponse,
} from '@/api/generated/homeport';

import { everyone, loaded } from './index';

/** Ids as the API writes them. */
export const id = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`;
export const ICELAND = id(1);
export const BOOK = id(2);
export const ALBUM = id(3);
export const KEPT = id(4);
export const DRAFT = id(5);
export const TRIP = id(6);
export const NIGHT = id(7);
export const ENTRY = id(8);

export const noraBrief: PersonBrief = { memberId: 'm-nora', name: 'Nora', avatarUrl: null };
export const alexBrief: PersonBrief = { memberId: 'm-alex', name: 'Alex', avatarUrl: null };
export const miaBrief: PersonBrief = { memberId: 'm-mia', name: 'Mia', avatarUrl: null };
export const leoBrief: PersonBrief = { memberId: 'm-leo', name: 'Leo', avatarUrl: null };

/** A list that comes in pages, loaded: one page, or as many as given. */
export function pages<T>(items: T[], more = false) {
  return { ...loaded({ pages: [{ items, nextCursor: more ? 'next' : null }], pageParams: [undefined] }), hasNextPage: more, isFetchingNextPage: false, fetchNextPage: jest.fn() };
}

/** What the switch between the two apps shows for Nora: she has a profile in Journey. */
export function appSwitch(over: Partial<AppSwitchResponse> = {}): AppSwitchResponse {
  return {
    mode: 'local',
    available: true,
    signedInAs: 'Nora Lind',
    journey: { id: 'a-nora', username: 'noralind', displayName: 'Nora Lind', avatarUrl: null, journeys: 3, followers: 112, following: 58, openUrl: 'journey://profile/noralind' },
    note: null,
    notYet: [],
    ...over,
  };
}

/** Iceland ring road, as Journey has it: finished, told by Nora and Alex. */
export function journey(over: Partial<JourneyBrief> = {}): JourneyBrief {
  return {
    id: ICELAND,
    title: 'Iceland ring road',
    status: 'completed',
    visibility: 'public',
    coverUrl: 'https://img.test/waterfall.jpg',
    startDate: '2026-04-01',
    lastDay: '2026-04-14',
    targetDays: null,
    latestNumber: 14,
    progressLabel: 'Day 14',
    days: 14,
    entries: 62,
    photos: 214,
    clips: 9,
    places: 11,
    followers: 58,
    owner: { id: 'a-nora', name: 'Nora Lind', avatarUrl: null },
    authors: [
      { id: 'a-nora', name: 'Nora Lind', avatarUrl: null },
      { id: 'a-alex', name: 'Alex Strand', avatarUrl: null },
    ],
    mine: true,
    closingNote: "We drove the whole circle and it still wasn't enough.",
    lastEntryAt: '2026-04-14T20:30:00Z',
    openUrl: `journey://journey/${ICELAND}`,
    ...over,
  };
}

/** What "Keep this journey" shows for Iceland, kept for the first time. */
export function keepOptions(over: Partial<KeepOptions> = {}): KeepOptions {
  return { journey: journey(), photos: 214, clips: 9, inLibrary: 201, originalsNote: null, clipsNote: null, keepIn: { folderId: 'f-trips', title: 'Trips' }, audience: 'circle', keptId: null, pageId: null, ...over };
}

/** A job that is running: keeping, halfway. */
export function job(over: Partial<JourneyJobResponse> = {}): JourneyJobResponse {
  return { id: id(90), kind: 'keep', status: 'running', step: 'Bringing photos home', done: 12, total: 24, problem: null, subjectId: KEPT, updatedAt: '2026-11-12T10:00:00Z', ...over };
}

/** Iceland, kept in The Linds in April: its book in Notes and its album in the Library. */
export function kept(over: Partial<KeptResponse> = {}): KeptResponse {
  return {
    id: KEPT,
    circleId: 'c-linds',
    journeyId: ICELAND,
    title: 'Iceland ring road',
    byline: 'Nora and Alex',
    coverUrl: 'https://img.test/waterfall.w800.jpg',
    pageId: BOOK,
    albumId: ALBUM,
    status: 'completed',
    visibility: 'public',
    stats: { days: 14, entries: 62, photos: 214, clips: 9, places: 11, followers: 58 },
    originals: { matched: 201, brought: 13, leftInJourney: 9 },
    startsOn: '2026-04-01',
    endsOn: '2026-04-14',
    keptAt: '2026-04-20T19:00:00Z',
    syncedAt: '2026-04-20T19:00:00Z',
    openUrl: `journey://journey/${ICELAND}`,
    keptBy: noraBrief,
    mine: true,
    ...over,
  };
}

const bookPhoto = (n: number) => ({ blockId: id(100 + n), url: `https://img.test/day-${n}.w800.jpg`, thumbUrl: `https://img.test/day-${n}.w320.jpg`, caption: '' });

/** The book of Iceland: two days, the first with seven photos of which the page holds six. */
export function book(over: Partial<JourneyBookResponse> = {}): JourneyBookResponse {
  return {
    kept: kept(),
    canEdit: true,
    chip: everyone,
    days: [
      { day: '2026-04-01', label: 'Day 1', place: 'Reykjavík', words: ['Picked up the van, got lost twice before leaving the car park, and ate hot dogs by the harbour in the rain.'], photos: [1, 2, 3, 4, 5, 6].map(bookPhoto), shots: 7, more: 1 },
      { day: '2026-04-02', label: 'Day 2', place: 'Skógafoss', words: ['A rainbow at the falls and nobody else there until nine.'], photos: [], shots: 0, more: 0 },
    ],
    job: null,
    ...over,
  };
}

const draftItem = (n: number, over: { kind?: 'photo' | 'video'; dropped?: boolean } = {}) => ({ itemId: id(200 + n), kind: over.kind ?? ('photo' as const), thumbUrl: `https://img.test/lake-${n}.w320.jpg`, durationSeconds: over.kind === 'video' ? 12 : null, dropped: over.dropped ?? false });

/** A draft from Saturday at the lake and two days around it, sorted into three days, as drawn. (Each day carries a few of its photos.) */
export function draft(over: Partial<JourneyDraftResponse> = {}): JourneyDraftResponse {
  return {
    id: DRAFT,
    circleId: 'c-linds',
    title: 'A weekend at Lake Bled',
    from: { kind: 'moment', title: 'Saturday at the lake', coverUrl: 'https://img.test/canoe.jpg', daysAround: 2 },
    days: [
      { day: '2026-11-06', number: 1, line: 'the drive up', place: null, photos: 9, clips: 0, items: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => draftItem(n)) },
      { day: '2026-11-07', number: 2, line: 'on the water', place: 'Lake Bled', photos: 31, clips: 3, items: [...[10, 11, 12, 13, 14, 15].map((n) => draftItem(n)), draftItem(16, { kind: 'video' })] },
      { day: '2026-11-08', number: 3, line: 'the walk back', place: null, photos: 11, clips: 0, items: [20, 21].map((n) => draftItem(n)) },
    ],
    photos: 51,
    clips: 3,
    status: 'draft',
    visibility: 'private',
    journeyId: null,
    openUrl: null,
    job: null,
    updatedAt: '2026-11-12T10:00:00Z',
    ...over,
  };
}

/** "Before it leaves home" for that draft: every switch on, as it starts. */
export function check(over: Partial<LeavingCheckResponse> = {}): LeavingCheckResponse {
  return {
    draftId: DRAFT,
    children: { on: true, count: 14, of: 51, names: ['Mia', 'Leo'] },
    town: { on: true, shows: 'Lake Bled' },
    home: { on: true, count: 2, homeKnown: true },
    onlyPhotosAndVideos: true,
    tooLong: 0,
    flags: [],
    visibility: 'private',
    photosGoing: 35,
    clipsGoing: 0,
    items: [
      { itemId: id(201), day: '2026-11-06', thumbUrl: 'https://img.test/lake-1.w320.jpg', goes: true, leftOut: [], flags: [], backOn: false },
      { itemId: id(202), day: '2026-11-07', thumbUrl: 'https://img.test/lake-2.w320.jpg', goes: false, leftOut: ['child'], flags: [], backOn: false },
      { itemId: id(203), day: '2026-11-07', thumbUrl: 'https://img.test/lake-3.w320.jpg', goes: false, leftOut: ['dropped'], flags: [], backOn: false },
      { itemId: id(204), day: '2026-11-08', thumbUrl: 'https://img.test/lake-4.w320.jpg', goes: true, leftOut: [], flags: [], backOn: true },
    ],
    ...over,
  };
}

/** Norway 2027: a trip that is still being planned. */
export function trip(over: Partial<TripResponse> = {}): TripResponse {
  return {
    id: TRIP,
    circleId: 'c-linds',
    title: 'Norway 2027',
    emoji: '',
    space: 'Trips',
    startsOn: '2027-04-03',
    endsOn: '2027-04-17',
    stage: 'plan',
    items: [
      { id: id(301), circleId: 'c-linds', kind: 'page', place: 'notes', title: 'Day by day', emoji: '', updatedAt: '2026-11-06T10:00:00Z', mine: true, canEdit: true, chip: everyone, glance: '14 days sketched · Bergen to Tromsø' },
      { id: id(302), circleId: 'c-linds', kind: 'checklist', place: 'notes', title: 'Packing, per person', emoji: '', updatedAt: '2026-11-07T10:00:00Z', mine: true, canEdit: true, chip: everyone, glance: '22 of 61 done', left: 39, done: 22 },
      { id: id(303), circleId: 'c-linds', kind: 'sheet', place: 'money', title: 'Norway budget', emoji: '', updatedAt: '2026-11-08T10:00:00Z', mine: true, canEdit: true, chip: everyone, glance: '€2,500 of €7,640' },
    ],
    becomes: { on: '2027-04-03', title: 'Norway 2027', coAuthors: [alexBrief], route: ['Bergen', 'Flåm', 'Tromsø'], canBecome: true, note: null },
    journey: null,
    book: null,
    money: { sheetId: id(303), title: 'Norway budget', plannedCents: 764000, paidCents: 250000, currency: 'EUR' },
    mine: true,
    canEdit: true,
    chip: everyone,
    ...over,
  };
}

/** Alex, away on Lofoten by bike: Day 6 of 9, two entries new, the latest loved by Mia. */
export function away(over: Partial<AwayResponse> = {}): AwayResponse {
  return {
    who: alexBrief,
    journey: journey({ id: id(10), title: 'Lofoten by bike', status: 'active', progressLabel: 'Day 6 of 9', mine: false, openUrl: `journey://journey/${id(10)}` }),
    newCount: 2,
    latest: { entryId: ENTRY, label: 'Day 6', place: 'Reine', title: 'Ferry day, and finally a rest', imageUrl: 'https://img.test/bike.jpg', lovedBy: [miaBrief], loved: false },
    ...over,
  };
}

export const bromo: JourneyPastDay = { yearsAgo: 2, day: '2024-11-12', title: 'Sunrise over Bromo', label: 'Day 22', place: 'Mount Bromo', imageUrl: 'https://img.test/bromo.jpg', keptId: id(11), pageId: id(12) };

/** A goodnight from Alex for tonight, loved by Leo. */
export function goodnight(over: Partial<GoodnightResponse> = {}): GoodnightResponse {
  return {
    id: NIGHT,
    circleId: 'c-linds',
    circleName: 'The Linds',
    title: 'Goodnight, you two',
    from: alexBrief,
    clip: { id: id(20), kind: 'video', url: '', thumbUrl: null, fileUrl: 'https://img.test/clip.mp4', fileName: 'clip.mp4', contentType: 'video/mp4', width: null, height: null, durationSeconds: 48, bytes: 8455 },
    posterUrl: 'https://img.test/fog.jpg',
    recordedAt: '2026-11-12T18:10:00Z',
    recordedLocal: '2026-11-12T19:10:00',
    place: 'Reine, Norway',
    dayLabel: 'Day 6',
    forDay: '2026-11-12',
    showFrom: '20:00',
    replyTo: null,
    replies: [],
    lovedBy: [leoBrief],
    loved: false,
    mine: false,
    canEdit: false,
    chip: everyone,
    ...over,
  };
}

/** Journey at home for The Linds on that day. */
export function atHome(over: Partial<AtHomeResponse> = {}): AtHomeResponse {
  return { available: true, away: [away()], onThisDay: [bromo], goodnights: [goodnight()], bedtime: '20:00', ...over };
}

export function homeSettings(over: Partial<HomeSettingsResponse> = {}): HomeSettingsResponse {
  return { circleId: 'c-linds', homeLat: 46.0569, homeLng: 14.5058, homeRadiusM: 150, bedtime: '20:00', timeZone: 'Europe/Ljubljana', canChange: true, ...over };
}

/** Journey's three cards on Today, as the API sends them. The one about Alex is not a thing: it has no id and no kind. */
export const goodnightCard: TodayCard = { thingId: NIGHT, kind: 'goodnight', look: 'goodnight', emoji: '🌙', title: 'Goodnight from Alex', line: 'For bedtime at 20:00 · Reine, Norway', figure: '0:48', imageUrl: 'https://img.test/fog.jpg', action: 'Play', order: 5 };
export const awayCard: TodayCard = { thingId: null, kind: undefined, look: 'journey_away', emoji: '🌍', title: 'Alex is on a journey', line: 'Lofoten by bike · Day 6 of 9', figure: '2 new', imageUrl: 'https://img.test/bike.jpg', action: 'Open in Journey', order: 20 };
export const pastCard: TodayCard = { thingId: id(12), kind: 'page', look: 'journey_on_this_day', emoji: '📷', title: 'Sunrise over Bromo', line: '2 years ago · Day 22 · kept journey', figure: null, imageUrl: 'https://img.test/bromo.jpg', action: null, order: 60 };
