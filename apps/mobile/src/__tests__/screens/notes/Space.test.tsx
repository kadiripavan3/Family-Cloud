import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { changeFolder, createFolder, deleteThing, fileThing, pinThing, shareFolderContents, useGetFolder, useGetFolderItemsInfinite, useGetNotes, useGetUnfiledNotesInfinite } from '@/api/generated/homeport';
import FolderScreen from '@/app/(app)/folder/[id]';
import { forgetKeptChoices } from '@/lib/useKept';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending } from '@/test/samples';
import { folder, inHome, inManual, loadedPages, note, notesHome } from '@/test/samples/notes';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = {
  noteMade: jest.fn(() => Promise.resolve()),
  notePinned: jest.fn(() => Promise.resolve()),
  noteGone: jest.fn(() => Promise.resolve()),
  noteFiled: jest.fn(() => Promise.resolve()),
  folderSaved: jest.fn(() => Promise.resolve()),
  insideShared: jest.fn(() => Promise.resolve()),
};
let mockParams: { id: string; circle?: string } = { id: 'f-home' };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
// Whether a folder is a trip is asked of the link with Journey, which has its own test (together/TripSpace).
jest.mock('@/features/journeyLink/trip/dates', () => ({ useTripOf: () => mockTripOrFolder, useTripIds: () => mockTrips }));
jest.mock('@/features/journeyLink/trip/TripSpace', () => ({ TripSpace: ({ folder: shown }: { folder: { title: string } }) => mockWords(`the trip ${shown.title}`) }));
jest.mock('@/features/journeyLink/trip/TripDatesSheet', () => ({ TripDatesSheet: ({ visible }: { visible: boolean }) => (visible ? mockWords('the dates of the trip') : null) }));
jest.mock('@/lib/keep', () => ({ keep: { get: jest.fn(() => Promise.resolve(null)), set: jest.fn(() => Promise.resolve()), remove: jest.fn(() => Promise.resolve()) } }));
jest.mock('@/api/generated/homeport', () => ({
  useGetFolder: jest.fn(),
  useGetFolderItemsInfinite: jest.fn(),
  useGetUnfiledNotesInfinite: jest.fn(),
  useGetNotes: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  createFolder: jest.fn(),
  shareFolderContents: jest.fn(),
  pinThing: jest.fn(),
  unpinThing: jest.fn(),
  fileThing: jest.fn(),
  deleteThing: jest.fn(),
  changeFolder: jest.fn(),
  changePage: jest.fn(),
  renameChecklist: jest.fn(),
}));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));

const mockLinds = linds;
let mockTripOrFolder: 'trip' | 'folder' | 'asking' = 'folder';
let mockTrips = new Set<string>();
function mockWords(text: string) {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return <Text>{text}</Text>;
}
const mockMe = loaded(me());
const asked = jest.mocked(useGetFolder) as unknown as jest.Mock;
const inside = jest.mocked(useGetFolderItemsInfinite) as unknown as jest.Mock;
const home = folder();

/** What each folder holds, by its id. */
const HOLDS: Record<string, ReturnType<typeof note>[]> = { 'f-home': inHome, 'f-manual': inManual, 'f-appliances': [note({ id: 'n-boiler', title: 'Boiler' })], 'f-meals': [] };

describe('5.2 a space', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetKeptChoices();
    mockParams = { id: 'f-home' };
    asked.mockReturnValue(loaded(home));
    inside.mockImplementation((id: string) => loadedPages(HOLDS[id] ?? []));
    jest.mocked(useGetNotes as unknown as jest.Mock).mockReturnValue(loaded(notesHome()));
  });

  it('shows its emoji, its name, who it is shared with and how much is in it', async () => {
    await render(inApp(<FolderScreen />));
    expect(screen.getByRole('header', { name: 'Notes' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Home' })).toBeOnTheScreen();
    expect(screen.getByText('48 pages')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: The Linds. Change who can see this' })).toBeOnTheScreen();
  });

  it('shows folders, lists, sheets and pages side by side, each with a few words at the end', async () => {
    await render(inApp(<FolderScreen />));
    expect(inside).toHaveBeenCalledWith('f-home', undefined, expect.objectContaining({ query: expect.anything() }));
    // A folder: how many pages are in it. A list: how much is left, and who is in it. A sheet: where it stands. A hidden page: from whom.
    expect(screen.getByRole('button', { name: 'House manual. Folder. 6 pages. Show what is in House manual' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Groceries. List. 7 left · Alex is ticking' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Renovation budget. Sheet. €12,400' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Christmas plan. Page. Not Mia or Leo' })).toBeOnTheScreen();
  });

  it('opens folders inside folders in place, as deep as they go, and closes them again', async () => {
    await render(inApp(<FolderScreen />));
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: /^Wi‑Fi and smart home/ })).toBeNull();
    await user.press(screen.getByRole('button', { name: /^House manual\./ }));
    // A page someone else changed lately says who, and how long ago.
    expect(screen.getByRole('button', { name: 'Wi‑Fi and smart home. Page. Alex, 2h' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Bins and recycling days. Page' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: /^Appliances and manuals\./ }));
    expect(screen.getByRole('button', { name: 'Boiler. Page' })).toBeOnTheScreen();
    expect(inside).toHaveBeenCalledWith('f-appliances', undefined, expect.anything());
    // An empty folder says so.
    await user.press(screen.getByRole('button', { name: /^Meals\./ }));
    expect(screen.getByText('Nothing in it yet')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'House manual. Folder. 6 pages. Hide what is in House manual' }));
    expect(screen.queryByRole('button', { name: /^Wi‑Fi and smart home/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Boiler. Page' })).toBeNull();
  });

  it('opens a page, a list or a sheet by its kind', async () => {
    await render(inApp(<FolderScreen />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Groceries\./ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'checklist', id: '22222222-2222-4222-8222-222222222222' } });
    await user.press(screen.getByRole('button', { name: /^Renovation budget\./ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'sheet', id: 's-budget' } });
  });

  it('makes a page or a list in it, and a folder with a name and an emoji', async () => {
    jest.mocked(createFolder).mockResolvedValue(folder({ id: 'f-new', title: 'Garden', space: false, parentId: 'f-home' }));
    await render(inApp(<FolderScreen />));
    const user = userEvent.setup();
    expect(screen.getByText('Page, checklist, sheet or folder')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'New in Home' }));
    await user.press(screen.getByRole('button', { name: 'Page. Words, photos, lists and live blocks' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/new/note', params: { folder: 'f-home' } });
    await user.press(screen.getByRole('button', { name: 'New in Home' }));
    await user.press(screen.getByRole('button', { name: 'Checklist. Lines to tick, alone or together' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/new/checklist', params: { folder: 'f-home' } });
    await user.press(screen.getByRole('button', { name: 'New in Home' }));
    await user.press(screen.getByRole('button', { name: 'Sheet. Rows, sums and formulas' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/new/sheet');
    await user.press(screen.getByRole('button', { name: 'New in Home' }));
    await user.press(screen.getByRole('button', { name: 'Folder. A shelf inside this one' }));
    expect(screen.getByRole('header', { name: 'New folder in Home' })).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Name'), 'Garden');
    await user.press(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(createFolder).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', parentId: 'f-home', title: 'Garden', emoji: '' }));
    await waitFor(() => expect(mockCache.noteMade).toHaveBeenCalledWith('c-linds'));
  });

  it('opens the gallery of templates', async () => {
    await render(inApp(<FolderScreen />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Templates' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/templates');
  });

  it("moves a row up and down in its folder's order, from the menu that holding it opens", async () => {
    jest.mocked(fileThing).mockResolvedValue({ folderId: 'f-home', breadcrumb: [] });
    await render(inApp(<FolderScreen />));
    const user = userEvent.setup();
    // The first row can only go down; it goes after the second. (A folder can also be opened by itself from here.)
    await user.longPress(screen.getByRole('button', { name: /^House manual\./ }));
    expect(screen.getByRole('button', { name: 'Open this folder' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Move up' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Move down' }));
    await waitFor(() => expect(fileThing).toHaveBeenLastCalledWith('f-manual', { folderId: 'f-home', after: 'f-meals' }));
    // The second goes first; the third goes after the first.
    await user.longPress(screen.getByRole('button', { name: /^Meals\./ }));
    await user.press(screen.getByRole('button', { name: 'Move up' }));
    await waitFor(() => expect(fileThing).toHaveBeenLastCalledWith('f-meals', { folderId: 'f-home', atStart: true }));
    await user.longPress(screen.getByRole('button', { name: /^Groceries\./ }));
    await user.press(screen.getByRole('button', { name: 'Move up' }));
    await waitFor(() => expect(fileThing).toHaveBeenLastCalledWith('22222222-2222-4222-8222-222222222222', { folderId: 'f-home', after: 'f-manual' }));
    expect(mockCache.noteFiled).toHaveBeenCalledWith({ id: 'f-meals', circleId: 'c-linds' });
  });

  it('moves a row into another folder, into a folder inside one, or out of every folder', async () => {
    jest.mocked(fileThing).mockResolvedValue({ folderId: 'f-kids', breadcrumb: [] });
    await render(inApp(<FolderScreen />));
    const user = userEvent.setup();
    const openMove = async () => {
      await user.longPress(screen.getByRole('button', { name: /^Christmas plan\./ }));
      await user.press(screen.getByRole('button', { name: 'Move to another folder' }));
    };
    await openMove();
    expect(screen.getByRole('header', { name: 'Move “Christmas plan”' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Move into Kids' }));
    await waitFor(() => expect(fileThing).toHaveBeenLastCalledWith('n-xmas', { folderId: 'f-kids' }));
    await waitFor(() => expect(mockCache.noteFiled).toHaveBeenCalledWith(expect.objectContaining({ id: 'n-xmas', circleId: 'c-linds' })));
    // The folders inside a space are one press away.
    await openMove();
    await user.press(screen.getAllByRole('button', { name: 'Show what is in Home' }).at(-1)!);
    await user.press(screen.getByRole('button', { name: 'Move into House manual' }));
    await waitFor(() => expect(fileThing).toHaveBeenLastCalledWith('n-xmas', { folderId: 'f-manual' }));
    await openMove();
    await user.press(screen.getByRole('button', { name: 'Out of every folder' }));
    await waitFor(() => expect(fileThing).toHaveBeenLastCalledWith('n-xmas', { folderId: null }));
  });

  it("says what the API says when something can't be moved there", async () => {
    jest.mocked(fileThing).mockRejectedValue(new ApiError(400, 'inside_itself', "A folder can't go inside itself."));
    await render(inApp(<FolderScreen />));
    const user = userEvent.setup();
    await user.longPress(screen.getByRole('button', { name: /^House manual\./ }));
    await user.press(screen.getByRole('button', { name: 'Move to another folder' }));
    // A folder that is taken out of every folder becomes a space; and it is not offered itself to move into.
    expect(screen.getByRole('button', { name: 'To the top, as a space' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Move into Trips' }));
    expect(await screen.findByText("A folder can't go inside itself.")).toBeOnTheScreen();
  });

  it('renames a folder from its row, pins a page, and deletes after asking', async () => {
    jest.mocked(changeFolder).mockResolvedValue(folder({ id: 'f-meals', title: 'Meals and recipes', space: false }));
    jest.mocked(pinThing).mockResolvedValue(undefined);
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(inApp(<FolderScreen />));
    const user = userEvent.setup();
    await user.longPress(screen.getByRole('button', { name: /^Meals\./ }));
    await user.press(screen.getByRole('button', { name: 'Name and emoji' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Meals and recipes');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeFolder).toHaveBeenCalledWith('f-meals', { title: 'Meals and recipes', emoji: '' }));
    await waitFor(() => expect(mockCache.folderSaved).toHaveBeenCalled());

    await user.longPress(screen.getByRole('button', { name: /^Christmas plan\./ }));
    await user.press(screen.getByRole('button', { name: 'Pin to the top of Notes' }));
    await waitFor(() => expect(mockCache.notePinned).toHaveBeenCalledWith({ id: 'n-xmas', circleId: 'c-linds' }, true));

    await user.longPress(screen.getByRole('button', { name: /^Christmas plan\./ }));
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('header', { name: 'Delete “Christmas plan”?' })).toBeOnTheScreen();
    expect(deleteThing).not.toHaveBeenCalled();
    await user.press(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    await waitFor(() => expect(mockCache.noteGone).toHaveBeenCalledWith({ id: 'n-xmas', circleId: 'c-linds' }));
    expect(deleteThing).toHaveBeenCalledWith('n-xmas');
  });

  it('opens a folder by itself from its row, to make things inside it', async () => {
    await render(inApp(<FolderScreen />));
    const user = userEvent.setup();
    await user.longPress(screen.getByRole('button', { name: /^Meals\./ }));
    await user.press(screen.getByRole('button', { name: 'Open this folder' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/folder/[id]', params: { id: 'f-meals' } });
    // Only a folder has that row.
    await user.longPress(screen.getByRole('button', { name: /^Christmas plan\./ }));
    expect(screen.queryByRole('button', { name: 'Open this folder' })).toBeNull();
  });

  it("offers a row only what the person may do with it", async () => {
    inside.mockImplementation(() => loadedPages([note({ id: 'n-theirs', title: 'Oven', mine: false, canEdit: false })]));
    await render(inApp(<FolderScreen />));
    await userEvent.setup().longPress(screen.getByRole('button', { name: /^Oven\./ }));
    expect(screen.getByRole('button', { name: 'Pin to the top of Notes' })).toBeOnTheScreen();
    for (const row of ['Name and emoji', 'Move to another folder', 'Delete']) expect(screen.queryByRole('button', { name: row })).toBeNull();
  });

  it('pins the space, shares what is in it the same way, and deletes it', async () => {
    jest.mocked(shareFolderContents).mockResolvedValue({ changed: 3, notYours: 1 });
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(inApp(<FolderScreen />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Share everything in it the same way' }));
    expect(await screen.findByText('3 things in it now have this audience. 1 thing from someone else stayed as it was.')).toBeOnTheScreen();
    expect(shareFolderContents).toHaveBeenCalledWith('f-home');
    await user.press(screen.getByRole('button', { name: 'OK' }));
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('The folder goes. What is in it stays, and moves up one level.')).toBeOnTheScreen();
    await user.press(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(deleteThing).toHaveBeenCalledWith('f-home');
  });

  it('is for reading only for someone who may not put things in it', async () => {
    asked.mockReturnValue(loaded(folder({ canEdit: false, mine: false })));
    inside.mockImplementation(() => loadedPages([]));
    await render(inApp(<FolderScreen />));
    expect(screen.getByText('Nothing in here that you can see.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'New in Home' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('button', { name: 'Pin to the top of Notes' })).toBeOnTheScreen();
    for (const row of ['Name and emoji', 'Share everything in it the same way', 'Delete']) expect(screen.queryByRole('button', { name: row })).toBeNull();
  });

  it('shows the way back up for a folder that is opened by itself', async () => {
    mockParams = { id: 'f-manual' };
    asked.mockReturnValue(loaded(folder({ id: 'f-manual', title: 'House manual', emoji: '', space: false, parentId: 'f-home', breadcrumb: [{ id: 'f-home', title: 'Home', emoji: '🏠' }], folders: 1, pages: 6 })));
    await render(inApp(<FolderScreen />));
    expect(screen.getByRole('header', { name: 'House manual' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Home. Open this folder' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/folder/[id]', params: { id: 'f-home' } });
  });

  it('draws its shape while it loads, keeps its Back, and says so when the folder is not there', async () => {
    asked.mockReturnValue(pending());
    const view = await render(inApp(<FolderScreen />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await view.rerender(inApp(<FolderScreen />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
  });

  it("says what went wrong with a folder's rows, and asks again", async () => {
    const problem = { ...failed(new ApiError(500, 'server', 'Something went wrong on our side. Try again.')), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() };
    inside.mockImplementation(() => problem);
    await render(inApp(<FolderScreen />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(problem.refetch).toHaveBeenCalledTimes(1);
  });
});

describe('what is not filed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: 'unfiled', circle: 'c-linds' };
  });

  it('lists the pages and lists that are in no folder, and opens them', async () => {
    jest.mocked(useGetUnfiledNotesInfinite as unknown as jest.Mock).mockReturnValue(loadedPages([note({ id: 'n-loose', title: 'Gift list for Alex' })]));
    await render(inApp(<FolderScreen />));
    expect(useGetUnfiledNotesInfinite).toHaveBeenCalledWith('c-linds', undefined, expect.anything());
    expect(screen.getByRole('header', { name: 'Not filed' })).toBeOnTheScreen();
    expect(screen.getByText('Pages and lists that are in no folder yet. Hold one to move it.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Gift list for Alex. Page' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'page', id: 'n-loose' } });
  });

  it('says so when everything is filed', async () => {
    jest.mocked(useGetUnfiledNotesInfinite as unknown as jest.Mock).mockReturnValue(loadedPages([]));
    await render(inApp(<FolderScreen />));
    expect(screen.getByText('Everything is filed.')).toBeOnTheScreen();
  });
});

describe('a folder that is a trip (10.7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetKeptChoices();
    mockParams = { id: 'f-home' };
    asked.mockReturnValue(loaded(home));
    inside.mockImplementation((id: string) => loadedPages(HOLDS[id] ?? []));
  });
  afterEach(() => {
    mockTripOrFolder = 'folder';
    mockTrips = new Set();
  });

  it('is drawn as the trip, with its three stages', async () => {
    mockTripOrFolder = 'trip';
    await render(inApp(<FolderScreen />));
    expect(screen.getByText('the trip Home')).toBeOnTheScreen();
    expect(screen.queryByText('48 pages')).toBeNull();
  });

  it("waits in a folder's shape, with its Back, while it isn't known which of the two it is", async () => {
    mockTripOrFolder = 'asking';
    await render(inApp(<FolderScreen />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('becomes one from its menu, by being given dates', async () => {
    await render(inApp(<FolderScreen />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Make it a trip' }));
    expect(screen.getByText('the dates of the trip')).toBeOnTheScreen();
  });

  it('opens a trip among its rows on the trip\'s own page, instead of unfolding it in place', async () => {
    mockTrips = new Set(['f-manual']);
    await render(inApp(<FolderScreen />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^House manual\./ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/folder/[id]', params: { id: 'f-manual' } });
    expect(screen.queryByRole('button', { name: /^Wi‑Fi and smart home/ })).toBeNull();
  });
});
