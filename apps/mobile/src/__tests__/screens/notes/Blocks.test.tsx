import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { sendPageChanges, useGetLinkableInfinite, useGetPage } from '@/api/generated/homeport';
import { useOnline } from '@/api/online';
import Page from '@/app/(app)/page/[id]';
import { ChangesProvider } from '@/features/notes/changes/outbox';
import { pickFile } from '@/features/notes/page/pickFile';
import { pickPhoto, sendPhoto, sendPickedFile } from '@/features/notes/page/send';
import { inApp } from '@/test/phone';
import { linds, loaded, me } from '@/test/samples';
import { brief, loadedPages, memoryStore, routerPhoto, wifiPage } from '@/test/samples/notes';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { listSent: jest.fn(() => Promise.resolve()), pageSent: jest.fn(() => Promise.resolve()) };
let mockNext = 0;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }), useIsFocused: () => true }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache, cacheFor: () => mockCache }));
jest.mock('@/api/online', () => ({ useOnline: jest.fn(() => true) }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
// Whether a page is a kept journey's book is asked of the link with Journey, which has its own test (together/JourneyBook).
jest.mock('@/features/journeyLink/book/useBookOf', () => ({ useBookOf: () => mockBookOrPage }));
jest.mock('@/features/journeyLink/book/JourneyBook', () => ({ JourneyBook: ({ pageId }: { pageId: string }) => mockBook(pageId) }));
jest.mock('@/features/notes/changes/store', () => ({ changeStore: {} }));
jest.mock('@/features/notes/MoveSheet', () => ({ MoveSheet: () => null }));
jest.mock('@/features/notes/page/send', () => ({ pickPhoto: jest.fn(), sendPhoto: jest.fn(), sendPickedFile: jest.fn() }));
jest.mock('@/features/notes/page/pickFile', () => ({ pickFile: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({
  // What the API keeps in this build: no bills yet, so that tile says so.
  ThingKind: { page: 'page', checklist: 'checklist', event: 'event', goal: 'goal', vault_item: 'vault_item', sheet: 'sheet' },
  useGetPage: jest.fn(),
  useGetAudience: jest.fn(() => ({ data: undefined })),
  useGetLinks: jest.fn(() => ({ data: [] })),
  useGetLinkableInfinite: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  getGetPageQueryKey: (id: string) => [`/v1/pages/${id}`],
  getGetChecklistQueryKey: (id: string) => [`/v1/checklists/${id}`],
  getPage: jest.fn(),
  getChecklist: jest.fn(),
  sendPageChanges: jest.fn(),
  sendChecklistChanges: jest.fn(),
  changePage: jest.fn(),
  sharePageLists: jest.fn(),
  deleteThing: jest.fn(),
  pinThing: jest.fn(),
  unpinThing: jest.fn(),
  fileThing: jest.fn(),
  changeFolder: jest.fn(),
  renameChecklist: jest.fn(),
}));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => `client-${(mockNext += 1)}`) }));

const mockId = '11111111-1111-4111-8111-111111111111';
const mockLinds = linds;
const mockMe = loaded(me());
const send = jest.mocked(sendPageChanges);
const linkable = jest.mocked(useGetLinkableInfinite) as unknown as jest.Mock;
const sent = () => send.mock.calls.flatMap(([, body]) => body.changes);
const onPhone = () => inApp(<ChangesProvider store={memoryStore().store}>{<Page />}</ChangesProvider>);

/** Opens "Add to this page" and presses one of its tiles. */
async function add(user: ReturnType<typeof userEvent.setup>, tile: string) {
  await user.press(screen.getByRole('button', { name: 'Add to this page' }));
  await user.press(screen.getByRole('button', { name: tile }));
}

let mockBookOrPage: 'book' | 'page' | 'asking' = 'page';
function mockBook(pageId: string) {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return <Text>{`the book of ${pageId}`}</Text>;
}

describe('5.4 Add to a page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = 0;
    jest.mocked(useOnline).mockReturnValue(true);
    (jest.mocked(useGetPage) as unknown as jest.Mock).mockReturnValue(loaded(wifiPage()));
    send.mockImplementation(async (_id, body) => ({ answers: body.changes.map(() => ({ outcome: 'done' as const })), page: wifiPage({ version: 'v2' }) }));
    linkable.mockReturnValue(loadedPages([]));
  });

  it('offers fifteen kinds of block in the order of the drawing, and says which stay live', async () => {
    await render(onPhone());
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add to this page' }));
    expect(screen.getByRole('header', { name: 'Add to this page' })).toBeOnTheScreen();
    const tiles = ['Text', 'Checklist', 'Photo', 'File', 'Place', 'Sheet', 'Bill', 'Event', 'Password', 'Goal', 'Person', 'Countdown', 'Recipe', 'Poll', 'Sum'];
    for (const tile of tiles) expect(screen.getByRole('button', { name: tile })).toBeOnTheScreen();
    expect(screen.getByText("Sheets, bills, events, passwords and goals stay live. Change them here or where they live: it's the same thing.")).toBeOnTheScreen();
  });

  it('starts a text block to type in', async () => {
    await render(onPhone());
    await add(userEvent.setup(), 'Text');
    expect(screen.getByLabelText('Text')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Add to this page' })).toBeNull();
  });

  it('starts a list in the page, with a name and its first lines', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    await add(user, 'Checklist');
    expect(screen.getByRole('header', { name: 'A list in this page' })).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Name of the list'), 'Before a holiday');
    await user.type(screen.getByLabelText('Lines to start with'), 'Water off\n\n Heating to 12 ');
    await user.press(screen.getByRole('button', { name: 'Add the list' }));
    await waitFor(() => expect(sent()).toEqual([{ op: 'add', add: { clientId: 'client-1', kind: 'checklist', title: 'Before a holiday', items: ['Water off', 'Heating to 12'] } }]));
  });

  it('draws a list that exists already, chosen from the lists of the circle', async () => {
    const packing = brief({ id: 'l-packing', kind: 'checklist', title: 'What to bring to Norway', glance: '2 of 9 done' });
    linkable.mockReturnValue(loadedPages([packing]));
    await render(onPhone());
    const user = userEvent.setup();
    await add(user, 'Checklist');
    await user.press(screen.getByRole('button', { name: 'Use a list you already have' }));
    expect(screen.getByRole('header', { name: 'Choose a list' })).toBeOnTheScreen();
    expect(linkable).toHaveBeenLastCalledWith('c-linds', { kind: 'checklist' }, expect.anything());
    await user.press(screen.getByRole('button', { name: /^What to bring to Norway\./ }));
    await waitFor(() => expect(sent()).toEqual([{ op: 'add', add: { clientId: 'client-1', kind: 'checklist', thingId: 'l-packing' } }]));
  });

  it('puts another thing on the page as a live block: chosen by kind, found by words', async () => {
    const party = brief({ id: 'e-party', kind: 'event', place: 'plan', title: "Mia's 10th birthday party", glance: 'Sat 5 Dec, 14:00' });
    linkable.mockReturnValue(loadedPages([party, brief({ id: mockId, kind: 'event', title: 'This very page' })]));
    await render(onPhone());
    const user = userEvent.setup();
    await add(user, 'Event');
    expect(screen.getByRole('header', { name: 'Choose an event' })).toBeOnTheScreen();
    expect(linkable).toHaveBeenLastCalledWith('c-linds', { kind: 'event' }, expect.anything());
    // The page itself can't be shown on itself.
    expect(screen.queryByRole('button', { name: /^This very page/ })).toBeNull();
    await user.type(screen.getByLabelText('Search'), 'birth');
    expect(linkable).toHaveBeenLastCalledWith('c-linds', { kind: 'event', q: 'birth' }, expect.anything());
    await user.press(screen.getByRole('button', { name: /^Mia's 10th birthday party\./ }));
    await waitFor(() => expect(sent()).toEqual([{ op: 'add', add: { clientId: 'client-1', kind: 'live', thingId: 'e-party' } }]));
  });

  it('asks the API for a password as a thing of the Vault, and says so when there is nothing to choose', async () => {
    await render(onPhone());
    await add(userEvent.setup(), 'Password');
    expect(linkable).toHaveBeenLastCalledWith('c-linds', { kind: 'vault_item' }, expect.anything());
    expect(screen.getByText('There is nothing of this kind in this circle yet that you can see.')).toBeOnTheScreen();
  });

  it('chooses a sheet straight from the table in the bar', async () => {
    await render(onPhone());
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add a sheet' }));
    expect(screen.getByRole('header', { name: 'Choose a sheet' })).toBeOnTheScreen();
    expect(linkable).toHaveBeenLastCalledWith('c-linds', { kind: 'sheet' }, expect.anything());
  });

  it('says so when nothing is found for the words typed', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    await add(user, 'Goal');
    await user.type(screen.getByLabelText('Search'), 'marathon');
    expect(screen.getByText('Nothing found for “marathon”')).toBeOnTheScreen();
  });

  it('says plainly which kinds are still to come, instead of doing nothing', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    for (const tile of ['Person', 'Countdown', 'Recipe', 'Poll', 'Sum']) {
      await add(user, tile);
      expect(screen.getByText(`${tile} blocks aren't built yet. They are on their way.`)).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'OK' }));
    }
    // A kind of thing the API doesn't keep in this build says the same, and lights up when it does.
    await add(user, 'Bill');
    expect(screen.getByText("Bill blocks aren't built yet. They are on their way.")).toBeOnTheScreen();
  });

  it('adds a place by its words', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    await add(user, 'Place');
    expect(screen.getByRole('header', { name: 'Where is it?' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add the place' })).toBeDisabled();
    await user.type(screen.getByLabelText('Place'), ' The pool on Kodeljevo ');
    await user.press(screen.getByRole('button', { name: 'Add the place' }));
    await waitFor(() => expect(sent()).toEqual([{ op: 'add', add: { clientId: 'client-1', kind: 'place', text: 'The pool on Kodeljevo' } }]));
  });

  it('sends a photo up first, then adds the block that shows it', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ uri: 'file:///router.jpg', width: 1200, height: 900 });
    jest.mocked(sendPhoto).mockResolvedValue({ ...routerPhoto, id: 'm-new', url: 'file:///router.jpg' });
    await render(onPhone());
    const user = userEvent.setup();
    await add(user, 'Photo');
    await waitFor(() => expect(sent()).toEqual([{ op: 'add', add: { clientId: 'client-1', kind: 'photo', mediaId: 'm-new', text: '' } }]));
    expect(sendPhoto).toHaveBeenCalledWith({ uri: 'file:///router.jpg', width: 1200, height: 900 });
    // Nothing is sent when the person picks nothing.
    jest.mocked(pickPhoto).mockResolvedValue(null);
    await user.press(screen.getByRole('button', { name: 'Add a photo' }));
    await waitFor(() => expect(pickPhoto).toHaveBeenCalledTimes(2));
    expect(sendPhoto).toHaveBeenCalledTimes(1);
  });

  it("says what the API says when a photo couldn't go up, and adds nothing", async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ uri: 'file:///router.jpg', width: 1200, height: 900 });
    jest.mocked(sendPhoto).mockRejectedValue(new ApiError(0, 'unreachable', "The photo couldn't be uploaded. Check your connection and try again."));
    await render(onPhone());
    await add(userEvent.setup(), 'Photo');
    expect(await screen.findByText("The photo couldn't be uploaded. Check your connection and try again.")).toBeOnTheScreen();
    expect(send).not.toHaveBeenCalled();
  });

  it('sends a file up and adds it under its name; where the phone has no file picker yet, it says so', async () => {
    jest.mocked(pickFile).mockResolvedValue({ uri: 'blob:boiler', name: 'boiler.pdf', contentType: 'application/pdf', bytes: 245760 });
    jest.mocked(sendPickedFile).mockResolvedValue({ id: 'm-file', kind: 'file', url: '', thumbUrl: null, fileUrl: null, fileName: 'boiler.pdf', contentType: 'application/pdf', width: null, height: null, durationSeconds: null, bytes: 245760 });
    await render(onPhone());
    const user = userEvent.setup();
    await add(user, 'File');
    await waitFor(() => expect(sent()).toEqual([{ op: 'add', add: { clientId: 'client-1', kind: 'file', mediaId: 'm-file', text: 'boiler.pdf' } }]));
    jest.mocked(pickFile).mockResolvedValue('unavailable');
    await add(user, 'File');
    expect(await screen.findByText('Choosing a file on a phone arrives with the Library. In the browser it works today.')).toBeOnTheScreen();
    expect(sendPickedFile).toHaveBeenCalledTimes(1);
  });
});
