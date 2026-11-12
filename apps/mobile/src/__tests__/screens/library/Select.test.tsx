import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addToAlbum, createAlbum, deleteSelected, hideSelected, shareSelected, useGetAlbum, useGetAlbumsInfinite, useGetWallInfinite } from '@/api/generated/homeport';
import Select from '@/app/(app)/library/select';
import { saveFiles } from '@/features/library/save';
import { takeOnly } from '@/features/journeyLink/tell/start';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { album, canoe, clip, id, lakeItems, pages, photoBook, wallPage } from '@/test/samples/library';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
let mockParams: Record<string, string> = {};
const mockCache = { selectionChanged: jest.fn(() => Promise.resolve()), selectionDeleted: jest.fn(() => Promise.resolve()), albumChanged: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/features/library/save', () => ({ saveFiles: jest.fn(), openFile: jest.fn() }));
jest.mock('@/ui/List', () => jest.requireActual('@/test/samples/library').listForTests);
jest.mock('@/api/generated/homeport', () => ({
  useGetWallInfinite: jest.fn(),
  useGetAlbum: jest.fn(),
  useGetAlbumsInfinite: jest.fn(),
  shareSelected: jest.fn(),
  hideSelected: jest.fn(),
  deleteSelected: jest.fn(),
  addToAlbum: jest.fn(),
  createAlbum: jest.fn(),
}));

const mockLinds = linds;
const wall = jest.mocked(useGetWallInfinite) as unknown as jest.Mock;
const tile = (index: number) => screen.getAllByRole('button', { name: /(Not selected|Selected, number \d+)$/ })[index]!;
const both = [canoe.id, clip.id];

describe('6.9 Select and share', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { moment: canoe.id, first: canoe.id };
    wall.mockReturnValue(pages([wallPage(lakeItems, [])]));
    (jest.mocked(useGetAlbum) as unknown as jest.Mock).mockReturnValue(pending());
    (jest.mocked(useGetAlbumsInfinite) as unknown as jest.Mock).mockReturnValue(pages([{ items: [photoBook], nextCursor: null }]));
  });

  /** Opens the screen with the canoe picked already, and picks the clip as well. */
  const withTwo = async () => {
    await render(inApp(<Select />));
    const user = userEvent.setup();
    await user.press(tile(4));
    expect(screen.getByRole('header', { name: '2 selected' })).toBeOnTheScreen();
    return user;
  };

  it('shows the same photos as where the person came from, with the one they held picked already', async () => {
    await render(inApp(<Select />));
    expect(wall).toHaveBeenCalledWith('c-linds', { moment: canoe.id, limit: 90 }, expect.anything());
    expect(screen.getByRole('header', { name: '1 selected' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Mia's first time steering. Photo added by Alex. Selected, number 1" })).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: /Not selected$/ })).toHaveLength(6);
    for (const action of ['Share', 'Album', 'Journey', 'Hide', 'Save', 'Delete']) expect(screen.getByRole('button', { name: action })).toBeOnTheScreen();
  });

  it('numbers what is picked in the order it was picked, and unpicks', async () => {
    const user = await withTwo();
    expect(screen.getByRole('button', { name: 'Video, 0:42, added by Alex. Selected, number 2' })).toBeOnTheScreen();
    await user.press(tile(0));
    expect(screen.getByRole('header', { name: '1 selected' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Video, 0:42, added by Alex. Selected, number 1' })).toBeOnTheScreen();
  });

  it('selects all, and clears', async () => {
    await render(inApp(<Select />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByRole('header', { name: '7 selected' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('header', { name: 'Select' })).toBeOnTheScreen();
  });

  it('asks for something to be picked before it does anything', async () => {
    mockParams = { moment: canoe.id };
    await render(inApp(<Select />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getByText('Pick at least one first.')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: /^Who can see/ })).toBeNull();
  });

  it('shares with everyone, and says how many it was done to', async () => {
    jest.mocked(shareSelected).mockResolvedValue({ applied: 1, skipped: 1 });
    const user = await withTwo();
    await user.press(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getByRole('header', { name: 'Who can see these 2?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Everyone in The Linds' }));
    await waitFor(() => expect(mockCache.selectionChanged).toHaveBeenCalledWith('c-linds'));
    expect(shareSelected).toHaveBeenCalledWith({ ids: both, audience: 'circle', people: undefined });
    expect(screen.getByText('1 now seen by everyone in The Linds. 1 was left as it is: not yours to share.')).toBeOnTheScreen();
  });

  it('makes them only yours again', async () => {
    jest.mocked(shareSelected).mockResolvedValue({ applied: 2, skipped: 0 });
    const user = await withTwo();
    await user.press(screen.getByRole('button', { name: 'Share' }));
    await user.press(screen.getByRole('button', { name: /^Only you\./ }));
    await waitFor(() => expect(shareSelected).toHaveBeenCalledWith({ ids: both, audience: 'me', people: undefined }));
    await waitFor(() => expect(screen.getByText('2 now seen by only you.')).toBeOnTheScreen());
  });

  it('shares with some people, picked by name, to look', async () => {
    jest.mocked(shareSelected).mockResolvedValue({ applied: 2, skipped: 0 });
    const user = await withTwo();
    await user.press(screen.getByRole('button', { name: 'Share' }));
    await user.press(screen.getByRole('button', { name: /^Some people\./ }));
    // The dog isn't asked.
    expect(screen.queryByRole('checkbox', { name: 'Biscuit' })).toBeNull();
    await user.press(screen.getByRole('checkbox', { name: 'Alex Strand' }));
    await user.press(screen.getByRole('checkbox', { name: 'Mia' }));
    await user.press(screen.getByRole('button', { name: 'Share with them' }));
    await waitFor(() =>
      expect(shareSelected).toHaveBeenCalledWith({
        ids: both,
        audience: 'some',
        people: [
          { memberId: 'm-alex', access: 'view' },
          { memberId: 'm-mia', access: 'view' },
        ],
      }),
    );
    await waitFor(() => expect(screen.getByText('2 now seen by Alex and Mia.')).toBeOnTheScreen());
  });

  it('hides them from one person', async () => {
    jest.mocked(hideSelected).mockResolvedValue({ applied: 1, skipped: 1 });
    const user = await withTwo();
    await user.press(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.getByRole('header', { name: 'Hide these 2 from…' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Mia' }));
    await waitFor(() => expect(mockCache.selectionChanged).toHaveBeenCalledWith('c-linds'));
    expect(hideSelected).toHaveBeenCalledWith({ ids: both, memberId: 'm-mia' });
    expect(screen.getByText('Hidden 1 from Mia. 1 was left as it is: not yours, or not shared.')).toBeOnTheScreen();
  });

  it('adds them to an album that is there, or to a new one', async () => {
    jest.mocked(addToAlbum).mockResolvedValue({ applied: 2, skipped: 0 });
    const user = await withTwo();
    await user.press(screen.getByRole('button', { name: 'Album' }));
    await user.press(screen.getByRole('button', { name: /^For the photo book/ }));
    await waitFor(() => expect(mockCache.albumChanged).toHaveBeenCalledWith({ id: photoBook.id, circleId: 'c-linds' }));
    expect(addToAlbum).toHaveBeenCalledWith(photoBook.id, { itemIds: both });
    expect(screen.getByText('Added 2 to For the photo book.')).toBeOnTheScreen();

    jest.mocked(createAlbum).mockResolvedValue(album({ id: id(80), title: 'Lake days', count: 2 }));
    await user.press(screen.getByRole('button', { name: 'Album' }));
    await user.press(screen.getByRole('button', { name: 'New album' }));
    await user.type(screen.getByLabelText('Name'), 'Lake days');
    await user.press(screen.getByRole('button', { name: 'Create and add' }));
    await waitFor(() => expect(createAlbum).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: 'Lake days', itemIds: both }));
    await waitFor(() => expect(screen.getByText('Added 2 to Lake days.')).toBeOnTheScreen());
  });

  it('saves copies of the files', async () => {
    jest.mocked(saveFiles).mockResolvedValue('saved');
    const user = await withTwo();
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Saved 2 to your downloads.')).toBeOnTheScreen());
    expect(saveFiles).toHaveBeenCalledWith([{ url: 'https://img.test/canoe.jpg' }, { url: 'https://img.test/clip.mp4' }]);
  });

  it('deletes after asking, says how many, and picks nothing any more', async () => {
    jest.mocked(deleteSelected).mockResolvedValue({ applied: 1, skipped: 1 });
    const user = await withTwo();
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('header', { name: 'Delete these 2 for good?' })).toBeOnTheScreen();
    expect(screen.getByText("Only the ones that are yours are deleted. They can't be brought back.")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Delete 2' }));
    await waitFor(() => expect(mockCache.selectionDeleted).toHaveBeenCalledWith('c-linds', both));
    expect(deleteSelected).toHaveBeenCalledWith({ ids: both });
    expect(screen.getByText('Deleted 1. 1 was left as it is: not yours to delete.')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Select' })).toBeOnTheScreen();
  });

  it('tells what is picked as a journey: the draft is made from the moment they are in, with only these in it', async () => {
    const user = await withTwo();
    await user.press(screen.getByRole('button', { name: 'Journey' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/journey/tell/new', params: { moment: canoe.id, circle: 'c-linds' } });
    expect([...(takeOnly() ?? [])]).toEqual(both);
  });

  it('asks for something to be picked first', async () => {
    mockParams = {};
    await render(inApp(<Select />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Journey' }));
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(takeOnly()).toBeNull();
  });

  it("puts photos into an album from the album's own page, and goes back to it", async () => {
    mockParams = { into: photoBook.id };
    (jest.mocked(useGetAlbum) as unknown as jest.Mock).mockReturnValue(loaded(photoBook));
    jest.mocked(addToAlbum).mockResolvedValue({ applied: 2, skipped: 0 });
    await render(inApp(<Select />));
    const user = userEvent.setup();
    // The whole wall to choose from, and one button instead of the bar.
    expect(wall).toHaveBeenCalledWith('c-linds', { limit: 90 }, expect.anything());
    expect(screen.getByRole('header', { name: 'Add to For the photo book' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    await user.press(tile(0));
    await user.press(tile(4));
    await user.press(screen.getByRole('button', { name: 'Add 2' }));
    await waitFor(() => expect(mockCache.albumChanged).toHaveBeenCalledWith({ id: photoBook.id, circleId: 'c-linds' }));
    expect(addToAlbum).toHaveBeenCalledWith(photoBook.id, { itemIds: both });
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('leaves by Cancel', async () => {
    await render(inApp(<Select />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('says what went wrong and asks again', async () => {
    const broken = { ...failed(new ApiError(500, 'oops', 'Something went wrong on our side. Try again.')), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() };
    wall.mockReturnValue(broken);
    await render(inApp(<Select />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(broken.refetch).toHaveBeenCalled();
  });
});
