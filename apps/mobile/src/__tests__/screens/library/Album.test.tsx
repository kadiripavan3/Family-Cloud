import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { changeAlbum, deleteThing, useGetAlbum, useGetFilesInfinite, useGetWallInfinite } from '@/api/generated/homeport';
import Album from '@/app/(app)/album/[id]';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending } from '@/test/samples';
import { album, canoe, id, lakeItems, miasAlbum, pages, passport, taxFolder, wallPage } from '@/test/samples/library';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
let mockParams = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000041' };
const mockCache = { albumChanged: jest.fn(() => Promise.resolve()), thingDeleted: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/ui/List', () => jest.requireActual('@/test/samples/library').listForTests);
jest.mock('@/api/generated/homeport', () => ({
  useGetAlbum: jest.fn(),
  useGetWallInfinite: jest.fn(),
  useGetFilesInfinite: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  changeAlbum: jest.fn(),
  deleteThing: jest.fn(),
}));

const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetAlbum) as unknown as jest.Mock;
const wall = jest.mocked(useGetWallInfinite) as unknown as jest.Mock;
const files = jest.mocked(useGetFilesInfinite) as unknown as jest.Mock;
const idle = { ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() };

describe("an album's own page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: id(41) };
    asked.mockReturnValue(loaded(album({ count: 8 })));
    wall.mockReturnValue(pages([wallPage(lakeItems, [])]));
    files.mockReturnValue(idle);
  });

  it('says what it is and who sees it, and shows what is in it', async () => {
    await render(inApp(<Album />));
    expect(screen.getByRole('header', { name: 'Summer 2026' })).toBeOnTheScreen();
    expect(screen.getByText('8 photos and videos · everyone adds to it')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: The Linds. Change who can see this' })).toBeOnTheScreen();
    expect(wall).toHaveBeenCalledWith('c-linds', { album: id(41), limit: 60 }, expect.objectContaining({ query: expect.objectContaining({ enabled: true }) }));
    expect(screen.getByRole('button', { name: 'Video, 0:42, added by Alex' })).toBeOnTheScreen();
  });

  it('opens a photo inside the album, so stepping stays in it', async () => {
    await render(inApp(<Album />));
    await userEvent.setup().press(screen.getByRole('button', { name: "Mia's first time steering. Photo added by Alex" }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'photo', id: canoe.id, album: id(41) } });
  });

  it('adds photos and selects in it from the three dots', async () => {
    await render(inApp(<Album />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Add photos' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/library/select', params: { into: id(41) } });
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Select photos' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/library/select', params: { album: id(41) } });
  });

  it('tells it as a journey from the three dots: the draft is made from this album', async () => {
    await render(inApp(<Album />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Tell it as a journey' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/journey/tell/new', params: { album: id(41), circle: 'c-linds' } });
  });

  it('renames it', async () => {
    const renamed = album({ title: 'Summer by the sea' });
    jest.mocked(changeAlbum).mockResolvedValue(renamed);
    await render(inApp(<Album />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Rename' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Summer by the sea');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockCache.albumChanged).toHaveBeenCalledWith(renamed));
    expect(changeAlbum).toHaveBeenCalledWith(id(41), { title: 'Summer by the sea' });
  });

  it('deletes it after asking, and says the photos stay', async () => {
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(inApp(<Album />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Delete album' }));
    expect(screen.getByRole('header', { name: 'Delete this album?' })).toBeOnTheScreen();
    expect(screen.getByText('What is in it stays in the Library.')).toBeOnTheScreen();
    await user.press(screen.getAllByRole('button', { name: 'Delete album' }).pop()!);
    await waitFor(() => expect(mockCache.thingDeleted).toHaveBeenCalledWith({ id: id(41), circleId: 'c-linds' }));
    expect(deleteThing).toHaveBeenCalledWith(id(41));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('says how an album that fills itself fills, and takes nothing by hand', async () => {
    mockParams = { id: miasAlbum.id };
    asked.mockReturnValue(loaded(miasAlbum));
    await render(inApp(<Album />));
    expect(screen.getByText('1,204 photos and videos · every photo Mia is in')).toBeOnTheScreen();
    expect(screen.getByText('Fills itself')).toBeOnTheScreen();
    expect(screen.getByText('It fills itself with every photo and video Mia is in. Say who is in a photo, and it shows up here.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: 'Add photos' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Select photos' })).toBeOnTheScreen();
  });

  it('invites the first photos into an empty album', async () => {
    asked.mockReturnValue(loaded(album({ count: 0, fresh: 0 })));
    wall.mockReturnValue(pages([wallPage([], [])]));
    await render(inApp(<Album />));
    expect(screen.getByRole('header', { name: 'Nothing in it yet' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add photos' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/library/select', params: { into: id(41) } });
  });

  it('shows a folder of files as rows, each opening its document', async () => {
    mockParams = { id: taxFolder.id };
    asked.mockReturnValue(loaded({ ...taxFolder, count: 1 }));
    wall.mockReturnValue(idle);
    files.mockReturnValue(pages([{ items: [passport], nextCursor: null }]));
    await render(inApp(<Album />));
    expect(screen.getByRole('header', { name: 'Tax 2025' })).toBeOnTheScreen();
    expect(screen.getByText('1 file')).toBeOnTheScreen();
    expect(files).toHaveBeenCalledWith('c-linds', { folder: taxFolder.id, day: expect.any(String) }, expect.objectContaining({ query: expect.objectContaining({ enabled: true }) }));
    await userEvent.setup().press(screen.getByRole('button', { name: /^Mia's passport\. ID\./ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'document', id: passport.id } });
  });

  it('keeps its Back while it loads', async () => {
    asked.mockReturnValue(pending());
    wall.mockReturnValue(idle);
    await render(inApp(<Album />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('says so when the album is not there, or not shared with this person', async () => {
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    wall.mockReturnValue(idle);
    await render(inApp(<Album />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
  });

  it('is the "nothing at this address" page for an address that is no album', async () => {
    mockParams = { id: 'whatever' };
    asked.mockReturnValue(pending());
    wall.mockReturnValue(idle);
    await render(inApp(<Album />));
    expect(screen.getByRole('header', { name: "There's nothing at this address" })).toBeOnTheScreen();
  });
});
