import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { createAlbum, useGetAlbumsInfinite, useGetLenses } from '@/api/generated/homeport';
import Albums from '@/app/(app)/library/albums';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { album, biscuitsAlbum, fromJourney, id, lenses, miasAlbum, pages } from '@/test/samples/library';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { albumMade: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/ui/List', () => jest.requireActual('@/test/samples/library').listForTests);
jest.mock('@/api/generated/homeport', () => ({ useGetAlbumsInfinite: jest.fn(), useGetLenses: jest.fn(), createAlbum: jest.fn() }));

const mockLinds = linds;
const asked = jest.mocked(useGetAlbumsInfinite) as unknown as jest.Mock;
const onePage = (...albums: ReturnType<typeof album>[]) => pages([{ items: albums, nextCursor: null }]);

describe('6.5 Albums', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(onePage(album(), miasAlbum, biscuitsAlbum));
    (jest.mocked(useGetLenses) as unknown as jest.Mock).mockReturnValue(loaded({ ...lenses, albums: { shared: 14, onlyYou: 6, fromJourney: 3 } }));
  });

  it('opens on the shared ones, with the three tabs and their counts', async () => {
    await render(inApp(<Albums />));
    expect(screen.getByRole('header', { name: 'Albums' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Shared, 14', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Only you, 6' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'From Journey, 3' })).toBeOnTheScreen();
    expect(asked).toHaveBeenCalledWith('c-linds', { tab: 'shared' }, expect.anything());
  });

  it('says what each album is: how many are new, that it fills itself, a few words under its name', async () => {
    await render(inApp(<Albums />));
    expect(screen.getByRole('button', { name: 'Summer 2026. 544 · everyone adds to it' })).toBeOnTheScreen();
    expect(screen.getByText('12 new')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mia. 1,204 · every photo Mia is in' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Biscuit. 388 · mostly asleep' })).toBeOnTheScreen();
    expect(screen.getAllByText('Fills itself')).toHaveLength(2);
  });

  it('changes tab, and opens an album', async () => {
    await render(inApp(<Albums />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('tab', { name: 'Only you, 6' }));
    expect(asked).toHaveBeenLastCalledWith('c-linds', { tab: 'mine' }, expect.anything());
    await user.press(screen.getByRole('button', { name: /^Summer 2026\./ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'album', id: id(41) } });
  });

  it('shows what came home from Journey as originals', async () => {
    asked.mockReturnValue(onePage(fromJourney));
    await render(inApp(<Albums />));
    await userEvent.setup().press(screen.getByRole('tab', { name: 'From Journey, 3' }));
    expect(screen.getByRole('button', { name: 'Iceland ring road. 214 originals' })).toBeOnTheScreen();
    expect(screen.getByText('Journey')).toBeOnTheScreen();
  });

  it('makes an album by hand: a name, who sees it, and it opens', async () => {
    const made = album({ id: id(78), title: 'Garden', count: 0, fresh: 0 });
    jest.mocked(createAlbum).mockResolvedValue(made);
    await render(inApp(<Albums />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'New album' }));
    expect(screen.getByRole('header', { name: 'New album' })).toBeOnTheScreen();
    // Without a name it says so and makes nothing.
    await user.press(screen.getByRole('button', { name: 'Create album' }));
    expect(screen.getByText('Give it a name.')).toBeOnTheScreen();
    expect(createAlbum).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Name'), 'Garden');
    // In a family a new thing is only yours, until this says otherwise.
    await user.press(screen.getByRole('button', { name: 'Seen by Only you. Change' }));
    await user.press(screen.getByRole('button', { name: 'Create album' }));
    await waitFor(() => expect(mockCache.albumMade).toHaveBeenCalledWith(made));
    expect(createAlbum).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: 'Garden', audience: 'circle', personId: undefined });
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'album', id: id(78) } });
  });

  it('makes one that fills itself for a person, a pet too, named after them', async () => {
    jest.mocked(createAlbum).mockResolvedValue(album({ id: id(79), title: 'Leo', origin: 'person' }));
    await render(inApp(<Albums />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'New album' }));
    await user.press(screen.getByRole('radio', { name: 'Fills itself' }));
    expect(screen.getByText('Every photo and video one person is in, from who is tagged by hand.')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Biscuit' })).toBeOnTheScreen();
    // Nobody chosen yet.
    await user.type(screen.getByLabelText('Name'), 'x');
    await user.press(screen.getByRole('button', { name: 'Create album' }));
    expect(screen.getByText('Choose whose photos it gathers.')).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('Name'));
    await user.press(screen.getByRole('radio', { name: 'Leo' }));
    await user.press(screen.getByRole('button', { name: 'Create album' }));
    await waitFor(() => expect(createAlbum).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: 'Leo', audience: 'me', personId: 'm-leo' }));
  });

  it('says what belongs on a tab that is empty', async () => {
    asked.mockReturnValue(onePage());
    await render(inApp(<Albums />));
    expect(screen.getByRole('header', { name: 'No shared albums yet' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('tab', { name: 'From Journey, 3' }));
    expect(screen.getByRole('header', { name: 'Nothing from Journey yet' })).toBeOnTheScreen();
    expect(screen.getByText('When Homeport and Journey are linked, what you keep from Journey lands here as an album of its originals.')).toBeOnTheScreen();
  });

  it('asks for more as the end comes near', async () => {
    const more = pages([{ items: [album()], nextCursor: 'next' }], true);
    asked.mockReturnValue(more);
    await render(inApp(<Albums />));
    await userEvent.setup().press(screen.getByLabelText('the end of the list'));
    expect(more.fetchNextPage).toHaveBeenCalled();
  });

  it('keeps its bar and its tabs while it loads', async () => {
    asked.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    await render(inApp(<Albums />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Shared, 14' })).toBeOnTheScreen();
  });

  it('says what went wrong and asks again', async () => {
    const broken = { ...failed(new ApiError(500, 'oops', 'Something went wrong on our side. Try again.')), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() };
    asked.mockReturnValue(broken);
    await render(inApp(<Albums />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(broken.refetch).toHaveBeenCalled();
  });
});
