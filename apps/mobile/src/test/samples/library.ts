/**
 * Made-up answers for the tests of Library: whole objects, the way the API sends them. Import them from
 * '@/test/samples/library'; the people and circles every test shares are in '@/test/samples'.
 */
import type {
  AlbumResponse,
  CommentResponse,
  DocumentCard,
  DocumentResponse,
  FilesSummary,
  ItemRow,
  LensesResponse,
  MomentResponse,
  PersonBrief,
  PlacesResponse,
  StorageResponse,
  TimelineResponse,
  WallResponse,
} from '@/api/generated/homeport';
import { createElement, type ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import type { LibraryItem } from '@/features/library/types';

import { loaded } from './index';
import { everyone, onlyMe, withAlex } from './spine';

/** An id the API could have made, from a small number: `id(7)`. */
export const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;

export const noraBrief: PersonBrief = { memberId: 'm-nora', name: 'Nora', avatarUrl: null };
export const alexBrief: PersonBrief = { memberId: 'm-alex', name: 'Alex', avatarUrl: null };
export const miaBrief: PersonBrief = { memberId: 'm-mia', name: 'Mia', avatarUrl: null };

/** A photo on the wall: Alex's, of the canoe, shared with everyone, unless said otherwise. */
export function photo(over: Partial<ItemRow> = {}): ItemRow & { id: string } {
  return {
    id: id(1),
    circleId: 'c-linds',
    kind: 'photo',
    title: '',
    thumbUrl: 'https://img.test/canoe.w320.jpg',
    url: 'https://img.test/canoe.w800.jpg',
    fileUrl: 'https://img.test/canoe.jpg',
    width: 780,
    height: 700,
    durationSeconds: null,
    takenAt: '2026-11-07T10:42:00Z',
    takenLocal: '2026-11-07T11:42:00',
    placeName: 'Lake Bled',
    addedBy: alexBrief,
    loved: false,
    momentId: id(1),
    mine: false,
    canEdit: true,
    chip: everyone,
    ...over,
  };
}

/** The canoe, with its caption and Nora's heart. */
export const canoe = photo({ title: "Mia's first time steering", loved: true });
/** A clip from the lake: 42 seconds. */
export const clip = photo({ id: id(5), kind: 'video', width: null, height: null, durationSeconds: 42, takenLocal: '2026-11-07T11:30:00', thumbUrl: 'https://img.test/clip.w320.jpg', url: 'https://img.test/clip.w800.jpg', fileUrl: 'https://img.test/clip.mp4' });

/** Seven things from the lake, the newest first: what the drawing of the wall shows. */
export const lakeItems = [
  canoe,
  photo({ id: id(2), addedBy: noraBrief, mine: true, takenLocal: '2026-11-07T11:39:00' }),
  photo({ id: id(3), addedBy: miaBrief, takenLocal: '2026-11-07T11:36:00' }),
  photo({ id: id(4), addedBy: miaBrief, takenLocal: '2026-11-07T11:33:00' }),
  clip,
  photo({ id: id(6), addedBy: noraBrief, mine: true, takenLocal: '2026-11-07T11:27:00' }),
  photo({ id: id(7), addedBy: miaBrief, takenLocal: '2026-11-07T11:24:00' }),
];

/** Saturday at the lake: three people, 48 photos and 3 videos. */
export function moment(over: Partial<MomentResponse> = {}): MomentResponse {
  return {
    id: id(1),
    circleId: 'c-linds',
    title: 'Saturday at Lake Bled',
    day: '2026-11-07',
    placeName: 'Lake Bled',
    total: 51,
    photos: 48,
    videos: 3,
    shared: true,
    people: [
      { ...noraBrief, you: true, count: 21 },
      { ...alexBrief, you: false, count: 19 },
      { ...miaBrief, you: false, count: 11 },
    ],
    coverUrl: 'https://img.test/canoe.w800.jpg',
    audience: 'circle',
    ...over,
  };
}

/** Thursday at home: Nora's own, nine photos. */
export const thursday = moment({ id: id(20), title: 'Thursday', day: '2026-11-05', placeName: 'Home', total: 9, photos: 9, videos: 0, shared: false, people: [{ ...noraBrief, you: true, count: 9 }], audience: 'me' });
export const homeItems = [20, 21, 22].map((n) => photo({ id: id(n), momentId: id(20), addedBy: noraBrief, mine: true, chip: onlyMe, placeName: 'Home', takenLocal: `2026-11-05T18:${n}:00`, takenAt: `2026-11-05T17:${n}:00Z` }));

export function wallPage(items: ItemRow[] = [...lakeItems, ...homeItems], moments: MomentResponse[] = [moment(), thursday], nextCursor: string | null = null): WallResponse {
  return { items, moments, nextCursor };
}

/** What a generated `use…Infinite` hook gives a screen once its pages are in. */
export function pages<T>(all: T[], more: boolean = false) {
  return { ...loaded({ pages: all, pageParams: all.map(() => undefined) }), hasNextPage: more, isFetchingNextPage: false, fetchNextPage: jest.fn() };
}

export const lenses: LensesResponse = {
  photos: 86,
  videos: 4,
  files: 11,
  places: 7,
  albums: { shared: 3, onlyYou: 1, fromJourney: 0 },
  people: [
    { ...miaBrief, count: 8, coverUrl: null },
    { memberId: 'm-biscuit', name: 'Biscuit', avatarUrl: null, count: 9, coverUrl: null },
  ],
};

export function timeline(over: Partial<TimelineResponse> = {}): TimelineResponse {
  return {
    years: [
      { year: 2026, photos: 3180, videos: 212 },
      { year: 2025, photos: 4, videos: 0 },
      { year: 2019, photos: 1, videos: 0 },
    ],
    year: 2026,
    months: [
      { month: '2026-11', photos: 409, videos: 3, tiles: [{ id: id(1), kind: 'photo', thumbUrl: 'https://img.test/canoe.w320.jpg' }, { id: id(5), kind: 'video', thumbUrl: 'https://img.test/clip.w320.jpg' }] },
      { month: '2026-10', photos: 268, videos: 0, tiles: [{ id: id(30), kind: 'photo', thumbUrl: 'https://img.test/autumn.w320.jpg' }] },
    ],
    ...over,
  };
}

/** Everything the viewer shows about the canoe: first of 51 in its moment, two loves, three comments. */
export function libraryItem(over: Partial<LibraryItem> = {}): LibraryItem {
  return {
    item: canoe,
    largeUrl: 'https://img.test/canoe.jpg',
    fileName: 'canoe.jpg',
    contentType: 'image/jpeg',
    bytes: 53653,
    lat: 46.3613,
    lng: 14.095,
    country: 'Slovenia',
    addedAt: '2026-11-07T12:00:00Z',
    about: [miaBrief],
    albums: [{ id: id(40), title: 'For the photo book' }],
    loves: 2,
    lovedBy: [noraBrief, miaBrief],
    comments: 3,
    neighbours: { newer: [], older: [lakeItems[1]!, lakeItems[2]!], position: 1, total: 51 },
    ...over,
  };
}

export function comment(over: Partial<CommentResponse> = {}): CommentResponse {
  return { id: id(50), body: 'She did so well!', createdAt: '2026-11-07T12:10:00Z', by: noraBrief, canRemove: true, ...over };
}

/** Summer 2026: an album everyone in the family adds to. */
export function album(over: Partial<AlbumResponse> = {}): AlbumResponse {
  return {
    id: id(41),
    circleId: 'c-linds',
    title: 'Summer 2026',
    note: '',
    origin: 'hand',
    person: null,
    folder: false,
    count: 544,
    fresh: 12,
    coverUrl: 'https://img.test/sea-cave.w800.jpg',
    contributors: [noraBrief, alexBrief, miaBrief],
    everyoneAdds: true,
    updatedAt: '2026-11-10T09:00:00Z',
    mine: true,
    canEdit: true,
    chip: everyone,
    ...over,
  };
}
/** The album that fills itself with every photo Mia is in. */
export const miasAlbum = album({ id: id(42), title: 'Mia', origin: 'person', person: miaBrief, count: 1204, fresh: 0, everyoneAdds: false, contributors: [noraBrief, alexBrief] });
export const biscuitsAlbum = album({ id: id(43), title: 'Biscuit', note: 'mostly asleep', origin: 'person', person: { memberId: 'm-biscuit', name: 'Biscuit', avatarUrl: null }, count: 388, fresh: 0, everyoneAdds: false });
export const fromJourney = album({ id: id(44), title: 'Iceland ring road', origin: 'journey', count: 214, fresh: 0, everyoneAdds: false });
export const photoBook = album({ id: id(40), title: 'For the photo book', count: 4, fresh: 0, everyoneAdds: false, chip: onlyMe });
/** A folder of files: Tax 2025, only Nora's. */
export const taxFolder = album({ id: id(45), title: 'Tax 2025', folder: true, count: 14, fresh: 0, everyoneAdds: false, coverUrl: null, contributors: [], chip: onlyMe });

export const places: PlacesResponse = {
  places: 38,
  countries: 6,
  list: [
    { name: 'Lake Bled', country: 'Slovenia', lat: 46.36, lng: 14.09, count: 54, photos: 51, videos: 3, visits: 3, lastDay: '2026-11-07', coverUrl: 'https://img.test/canoe.w800.jpg', people: [alexBrief, miaBrief, noraBrief] },
    { name: 'Cappadocia', country: 'Türkiye', lat: 38.64, lng: 34.83, count: 1, photos: 1, videos: 0, visits: 1, lastDay: '2019-09-24', coverUrl: null, people: [noraBrief] },
  ],
};

/** A document in the list of files: a PDF of Nora's, shared with Alex, with nothing special about it. */
export function doc(over: Partial<DocumentCard> = {}): DocumentCard & { id: string } {
  return {
    id: id(60),
    circleId: 'c-linds',
    title: 'Home insurance',
    badge: 'PDF',
    category: 'insurance',
    pages: 3,
    bytes: 1373,
    thumbUrl: null,
    fileUrl: 'https://files.test/home-insurance.pdf',
    keyDate: undefined,
    amountCents: null,
    currency: null,
    reminderSet: false,
    inVault: false,
    linkedFrom: null,
    about: [],
    addedBy: noraBrief,
    addedAt: '2026-10-03T09:00:00Z',
    mine: true,
    canEdit: true,
    chip: withAlex,
    ...over,
  };
}

/** The files of the drawing, each with the line it should get. */
export const insurance = doc({ keyDate: { label: 'renews', date: '2027-02-01', daysLeft: 81, soon: false, byHand: false }, reminderSet: true });
export const passport = doc({ id: id(61), title: "Mia's passport", badge: 'ID', category: 'id', pages: 1, keyDate: { label: 'expires', date: '2027-08-02', daysLeft: 263, soon: true, byHand: false }, about: [miaBrief], inVault: true });
export const schoolReport = doc({ id: id(62), title: "Mia's school report", category: 'school', pages: 4, about: [miaBrief] });
export const carRegistration = doc({ id: id(63), title: 'Car registration', category: 'other', pages: 1, keyDate: { label: 'valid_until', date: '2026-12-01', daysLeft: 19, soon: true, byHand: false } });
export const receipt = doc({ id: id(64), title: 'Receipt · wardrobe', badge: 'JPG', category: 'receipt', pages: 1, amountCents: 34900, currency: 'EUR', keyDate: { label: 'warranty', date: '2028-11-30', daysLeft: 749, soon: false, byHand: false }, chip: everyone });
export const boilerManual = doc({ id: id(65), title: 'Boiler manual', category: 'manual', pages: 12, linkedFrom: 'the House manual', chip: everyone });

export const filesSummary: FilesSummary = {
  total: 86,
  categories: [
    { category: 'id', count: 2 },
    { category: 'insurance', count: 1 },
    { category: 'school', count: 1 },
    { category: 'receipt', count: 1 },
  ],
  folders: [taxFolder],
};

/** Mia's passport as its own page gets it: three facts, the number kept out of sight, and a day for a reminder. */
export function documentAnswer(over: Partial<DocumentResponse> = {}): DocumentResponse {
  return {
    document: { ...passport, inVault: false },
    fileName: 'mia-s-passport.jpg',
    contentType: 'image/jpeg',
    pictureUrl: 'https://files.test/mia-s-passport.jpg',
    hasText: true,
    facts: [
      { label: 'Number', text: 'L898902C3', date: null, secret: true },
      { label: 'Born', text: '4 Dec 2016', date: '2016-12-04', secret: false },
      { label: 'Expires', text: '2 Aug 2027', date: '2027-08-02', secret: false },
    ],
    dates: [{ label: 'expires', date: '2027-08-02' }],
    remindOn: '2027-01-02',
    linked: [],
    clash: null,
    ...over,
  };
}

export const storage: StorageResponse = {
  usedBytes: 48 * 1024 ** 3,
  quotaBytes: 200 * 1024 ** 3,
  photoBytes: 31 * 1024 ** 3,
  videoBytes: 14 * 1024 ** 3,
  documentBytes: 2 * 1024 ** 3,
  otherBytes: 1024 ** 3,
  people: [
    { person: noraBrief, you: true, bytes: 22 * 1024 ** 3 },
    { person: alexBrief, you: false, bytes: 19 * 1024 ** 3 },
    { person: miaBrief, you: false, bytes: 6 * 1024 ** 3 },
    { person: { memberId: 'm-leo', name: 'Leo', avatarUrl: null }, you: false, bytes: 1024 ** 3 },
  ],
};

type ListProps = { data: readonly unknown[]; row: (item: unknown, index: number) => ReactElement | null; header?: ReactElement | null; footer?: ReactElement | null; empty?: ReactElement | null; onEnd?: () => void; onTop?: (item: unknown) => void };

/**
 * Stands in for `@/ui/List` in a screen's test. The real list draws only the rows a phone's screen has room
 * for (and can't be loaded by the tests at all); here every row is drawn, with what stands above and under
 * them. Pressing "the end of the list" is the person scrolling near the end; pressing "row N at the top" is
 * that row reaching the top of the screen.
 *
 *     jest.mock('@/ui/List', () => jest.requireActual('@/test/samples/library').listForTests);
 */
export const listForTests = {
  List: ({ data, row, header, footer, empty, onEnd, onTop }: ListProps) =>
    createElement(
      View,
      null,
      header,
      data.length === 0 ? empty : data.map((item, index) => createElement(View, { key: index }, row(item, index), onTop ? createElement(Pressable, { accessibilityLabel: `row ${index} at the top`, onPress: () => onTop(item) }) : null)),
      footer,
      onEnd ? createElement(Pressable, { accessibilityLabel: 'the end of the list', onPress: onEnd }) : null,
    ),
};
