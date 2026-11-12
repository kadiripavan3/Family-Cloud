/**
 * Made-up answers for the tests of Notes: whole objects, the way the API sends them. Import them from
 * '@/test/samples/notes'; the people and circles every test shares are in '@/test/samples'.
 */
import type { BlockResponse, ChecklistResponse, FolderResponse, NoteItem, NotesHome, PageResponse, PersonBrief, ThingBrief } from '@/api/generated/homeport';
import type { Change, ChangeStore } from '@/features/notes/changes/types';

import { checklist, everyone, item, notMia, onlyMe, page, thing, withAlex } from './spine';

/** People as the API names them on a line or a page: by the name they are called. */
export const alexBrief: PersonBrief = { memberId: 'm-alex', name: 'Alex', avatarUrl: null };
export const miaBrief: PersonBrief = { memberId: 'm-mia', name: 'Mia', avatarUrl: null };
export const noraBrief: PersonBrief = { memberId: 'm-nora', name: 'Nora', avatarUrl: null };

/** Two hours ago, as the API writes a moment. */
const twoHoursAgo = () => new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

/** A space or a folder, as its own screen gets it. */
export function folder(over: Partial<FolderResponse> = {}): FolderResponse {
  return { id: 'f-home', circleId: 'c-linds', title: 'Home', emoji: '🏠', space: true, parentId: null, breadcrumb: [], updatedAt: '2026-11-11T09:00:00Z', mine: true, canEdit: true, chip: everyone, folders: 6, pages: 48, pinned: false, ...over };
}

/** One row of a folder, of the pins or of "lately". */
export function note(over: Partial<NoteItem> = {}): NoteItem {
  return {
    id: 'n-1',
    circleId: 'c-linds',
    kind: 'page',
    place: 'notes',
    title: 'Bins and recycling days',
    emoji: '',
    updatedAt: '2026-11-11T09:00:00Z',
    mine: true,
    canEdit: true,
    chip: everyone,
    glance: null,
    editedBy: undefined,
    editedAt: null,
    left: null,
    done: null,
    here: [],
    folders: null,
    pages: null,
    pinned: false,
    ...over,
  };
}

/** The four spaces of the family, as Notes' home draws them. */
export const spaces: FolderResponse[] = [
  folder(),
  folder({ id: 'f-kids', title: 'Kids', emoji: '🧒', chip: withAlex, folders: 4, pages: 31 }),
  folder({ id: 'f-trips', title: 'Trips', emoji: '✈️', folders: 3, pages: 2 }),
  folder({ id: 'f-work', title: "Nora's work", emoji: '💼', chip: onlyMe, folders: 2, pages: 19 }),
];

/** The pinned list with someone in it, and a pinned page. */
export const pinnedGroceries = note({ id: '22222222-2222-4222-8222-222222222222', kind: 'checklist', title: 'Groceries', emoji: '🛒', glance: '5 of 12 done', left: 7, done: 5, here: [{ who: alexBrief, did: 'added', at: '2026-11-11T09:00:00Z' }], pinned: true, mine: false });
export const pinnedWifi = note({ id: '11111111-1111-4111-8111-111111111111', title: 'Wi‑Fi and smart home', emoji: '📶', chip: withAlex, editedBy: alexBrief, editedAt: twoHoursAgo(), pinned: true });

export function notesHome(over: Partial<NotesHome> = {}): NotesHome {
  return { spaces, pinned: [pinnedGroceries, pinnedWifi], recent: [note({ id: 'n-recent', title: 'Christmas plan', chip: { audience: 'circle', people: [], hiddenFrom: ['Mia', 'Leo'] } })], unfiled: 3, ...over };
}

/** What stands in the space "Home", in order: folders, a list someone is in, a sheet, pages. */
export const inHome: NoteItem[] = [
  note({ id: 'f-manual', kind: 'folder', title: 'House manual', folders: 1, pages: 6 }),
  note({ id: 'f-meals', kind: 'folder', title: 'Meals', folders: 1, pages: 3 }),
  note({ id: '22222222-2222-4222-8222-222222222222', kind: 'checklist', title: 'Groceries', glance: '5 of 12 done', left: 7, done: 5, here: [{ who: alexBrief, did: 'ticked', at: '2026-11-11T09:00:00Z' }], mine: false }),
  note({ id: 's-budget', kind: 'sheet', place: 'money', title: 'Renovation budget', glance: '€12,400' }),
  note({ id: 'n-xmas', title: 'Christmas plan', chip: { audience: 'circle', people: [], hiddenFrom: ['Mia', 'Leo'] } }),
];

/** What stands in "House manual": two pages (one that Alex changed two hours ago) and a folder. */
export const inManual: NoteItem[] = [
  note({ id: '11111111-1111-4111-8111-111111111111', title: 'Wi‑Fi and smart home', editedBy: alexBrief, editedAt: twoHoursAgo() }),
  note({ id: 'n-bins', title: 'Bins and recycling days' }),
  note({ id: 'f-appliances', kind: 'folder', title: 'Appliances and manuals', folders: 0, pages: 4 }),
];

/** What a generated `use…Infinite` hook gives a screen, for a mock: its first page, and no more to come. */
export function loadedPages<T>(items: T[]) {
  return {
    data: { pages: [{ items, nextCursor: null }], pageParams: [undefined] },
    isPending: false,
    isError: false,
    error: null,
    isFetching: false,
    isRefetching: false,
    isPaused: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  };
}

/** The shopping list of the drawing: lines under three headings, some ticked, one that repeats, one kept from Mia, what it held before. */
export function groceries(over: Partial<ChecklistResponse> = {}): ChecklistResponse {
  const items = over.items ?? [
    item({ id: 'i-bananas', text: 'Bananas', section: 'Fruit and veg', addedBy: miaBrief }),
    item({ id: 'i-onions', text: 'Red onions', section: 'Fruit and veg', done: true, doneBy: alexBrief }),
    item({ id: 'i-berries', text: 'Strawberries, 2 boxes', section: 'Fruit and veg', addedBy: miaBrief, addedAt: new Date(Date.now() - 30_000).toISOString() }),
    item({ id: 'i-milk', text: 'Milk, 2 litres', section: 'Fridge', repeats: 'weekly', addedBy: noraBrief }),
    item({ id: 'i-butter', text: 'Butter', section: 'Fridge', done: true, doneBy: alexBrief }),
    item({ id: 'i-dog', text: 'Dog food for Biscuit', section: 'Other', addedBy: noraBrief }),
    item({ id: 'i-candles', text: 'Birthday candles', section: 'Other', hiddenFrom: ['Mia'], addedBy: noraBrief }),
  ];
  return checklist({
    title: 'Groceries',
    emoji: '🛒',
    aisles: true,
    sections: [
      { name: 'Fruit and veg', left: 2, done: 1, sumCents: null },
      { name: 'Fridge', left: 1, done: 1, sumCents: null },
      { name: 'Other', left: 2, done: 0, sumCents: null },
    ],
    here: [{ who: alexBrief, did: 'ticked', at: '2026-11-11T09:00:00Z' }],
    suggestions: [
      { text: 'Eggs', section: 'Fridge' },
      { text: 'Bread', section: 'Bakery' },
    ],
    breadcrumb: [{ id: 'f-home', title: 'Home', emoji: '🏠' }],
    folderId: 'f-home',
    editedBy: alexBrief,
    editedAt: '2026-11-11T09:00:00Z',
    ...over,
    items,
  });
}

/** One block of a page. */
export function block(over: Partial<BlockResponse> = {}): BlockResponse {
  return { id: 'b-1', kind: 'paragraph', text: 'The heating app is on the hallway tablet.', marks: [], thing: null, checklist: null, unseen: false, media: null, lat: null, lng: null, updatedAt: '2026-11-11T09:00:00Z', ...over };
}

/** A thing as a live block or a picker shows it. */
export function brief(over: Partial<ThingBrief> = {}): ThingBrief {
  return thing(over);
}

/** The list drawn inside the Wi‑Fi page. */
export const dropsList = checklist({
  id: '33333333-3333-4333-8333-333333333333',
  title: 'If the internet drops',
  chip: withAlex,
  items: [item({ id: 'i-unplug', text: 'Unplug the white box for 10 seconds', done: true, doneBy: alexBrief }), item({ id: 'i-call', text: 'Still nothing? Call Telemach, 080 12 34' })],
});

export const routerPhoto = { id: 'm-desk', kind: 'photo' as const, url: 'https://example.com/desk.w800.jpg', thumbUrl: 'https://example.com/desk.w320.jpg', fileUrl: null, fileName: 'desk.jpg', contentType: 'image/jpeg', width: 780, height: 700, durationSeconds: null, bytes: 72958 };

/** The page of the drawing: a live block from the Vault, a heading, a list to tick, a photo, and a paragraph that names Alex. */
export function wifiPage(over: Partial<PageResponse> = {}): PageResponse {
  const heating = 'The heating app is on the hallway tablet. @Alex knows the boiler code.';
  return page({
    emoji: '📶',
    chip: withAlex,
    editedBy: alexBrief,
    editedAt: twoHoursAgo(),
    folderId: 'f-manual',
    breadcrumb: [
      { id: 'f-home', title: 'Home', emoji: '🏠' },
      { id: 'f-manual', title: 'House manual', emoji: '' },
    ],
    blocks: [
      block({ id: 'b-wifi', kind: 'live', text: '', thing: brief({ id: 'v-wifi', kind: 'vault_item', place: 'vault', title: 'Linds-Home-5G', glance: 'Password kept in the Vault', chip: withAlex }) }),
      block({ id: 'b-heading', kind: 'heading', text: 'If the internet drops' }),
      block({ id: 'b-list', kind: 'checklist', text: '', thing: brief({ id: dropsList.id, kind: 'checklist', title: 'If the internet drops', glance: '1 of 2 done' }), checklist: dropsList }),
      block({ id: 'b-photo', kind: 'photo', text: 'Where the router lives', media: routerPhoto }),
      block({ id: 'b-heating', text: heating, marks: [{ start: heating.indexOf('@Alex'), end: heating.indexOf('@Alex') + 5, kind: 'mention', url: null, memberId: 'm-alex' }] }),
    ],
    ...over,
  });
}

/** The gift list drawn inside the birthday page: three lines with amounts, one of them bought. */
export const giftIdeas = checklist({
  id: '44444444-4444-4444-8444-444444444444',
  title: 'Gift ideas',
  chip: notMia,
  sumCents: 16300,
  sumDoneCents: 4500,
  items: [
    item({ id: 'i-skates', text: 'Roller skates, size 33', note: 'Alex bought them', amountCents: 4500, done: true, doneBy: alexBrief }),
    item({ id: 'i-paints', text: 'Watercolour set', note: 'Grandma Astrid wants this one', amountCents: 2800 }),
    item({ id: 'i-climbing', text: 'Climbing course, 5 lessons', note: 'From both of us', amountCents: 9000 }),
  ],
});

/** A page for everyone but one (4.4): the gift list drawn in it, and the party's event, budget and list as three links. */
export function birthdayPage(over: Partial<PageResponse> = {}): PageResponse {
  return page({
    id: '55555555-5555-4555-8555-555555555555',
    title: "Mia's 10th birthday",
    emoji: '🎂',
    chip: notMia,
    editedBy: noraBrief,
    editedAt: '2026-11-10T09:00:00Z',
    folderId: 'f-birthdays',
    breadcrumb: [
      { id: 'f-kids', title: 'Kids', emoji: '🧒' },
      { id: 'f-birthdays', title: 'Birthdays', emoji: '' },
    ],
    blocks: [
      block({ id: 'b-gifts-h', kind: 'heading', text: 'Gift ideas' }),
      block({ id: 'b-gifts', kind: 'checklist', text: '', thing: brief({ id: giftIdeas.id, kind: 'checklist', title: 'Gift ideas', chip: notMia }), checklist: giftIdeas }),
      block({ id: 'b-party-h', kind: 'heading', text: 'The party' }),
      block({ id: 'b-event', kind: 'live', text: '', thing: brief({ id: 'e-party', kind: 'event', place: 'plan', title: "Mia's 10th birthday party", glance: 'Sat 5 Dec, 14:00', chip: notMia }) }),
      block({ id: 'b-budget', kind: 'live', text: '', thing: brief({ id: 's-party', kind: 'sheet', place: 'money', title: 'Party budget', glance: '€180 of €250', chip: notMia }) }),
      block({ id: 'b-prep', kind: 'live', text: '', thing: brief({ id: 'l-prep', kind: 'checklist', title: 'Party prep', glance: '4 of 9 done', chip: notMia }) }),
    ],
    ...over,
  });
}

/** A store for waiting changes that lives in memory, like the phone's but without the phone. `rows` is what it holds. */
export function memoryStore(initial: Change[] = []): { rows: Map<string, Change>; store: ChangeStore } {
  const rows = new Map(initial.map((row) => [row.key, row]));
  const store: ChangeStore = {
    load: async (owner) => [...rows.values()].filter((row) => row.owner === owner).sort((a, b) => a.seq - b.seq),
    save: async (row) => void rows.set(row.key, row),
    remove: async (keys) => keys.forEach((key) => rows.delete(key)),
    removeAll: async (owner) => {
      for (const row of [...rows.values()]) if (row.owner === owner) rows.delete(row.key);
    },
  };
  return { rows, store };
}
