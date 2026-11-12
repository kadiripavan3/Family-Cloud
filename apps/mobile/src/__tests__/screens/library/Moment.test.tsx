import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { createAlbum, useGetMoment, useGetWallInfinite } from '@/api/generated/homeport';
import Moment from '@/app/(app)/library/moment/[id]';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending } from '@/test/samples';
import { album, canoe, id, lakeItems, moment, pages, thursday, wallPage } from '@/test/samples/library';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
let mockParams = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001' };
const mockCache = { albumMade: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/ui/List', () => jest.requireActual('@/test/samples/library').listForTests);
jest.mock('@/api/generated/homeport', () => ({ useGetMoment: jest.fn(), useGetWallInfinite: jest.fn(), useGetMe: jest.fn(() => mockMe), createAlbum: jest.fn() }));

const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetMoment) as unknown as jest.Mock;
const wall = jest.mocked(useGetWallInfinite) as unknown as jest.Mock;

describe('6.3 A moment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: id(1) };
    asked.mockReturnValue(loaded(moment()));
    wall.mockReturnValue(pages([wallPage(lakeItems, [moment()])]));
  });

  it('says when and where, what it is called, and who was there', async () => {
    await render(inApp(<Moment />));
    expect(screen.getByText('Sat 7 Nov · Lake Bled')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Saturday at Lake Bled' })).toBeOnTheScreen();
    expect(screen.getByText('Three of you were here')).toBeOnTheScreen();
    expect(screen.getByText('48 photos and 3 videos from Nora, Alex and Mia, put together by time and place.')).toBeOnTheScreen();
    // Who sees it: all of it is shared with the family.
    expect(screen.getByLabelText('Seen by: The Linds')).toBeOnTheScreen();
    expect(wall).toHaveBeenCalledWith('c-linds', { moment: id(1), by: undefined, limit: 60 }, expect.anything());
  });

  it('shows each person as a chip with how many they added, and narrows to one of them', async () => {
    await render(inApp(<Moment />));
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'All 51' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'You, 21' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mia, 11' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Alex, 19' }));
    expect(wall).toHaveBeenLastCalledWith('c-linds', { moment: id(1), by: 'm-alex', limit: 60 }, expect.anything());
    await user.press(screen.getByRole('button', { name: 'All 51' }));
    expect(wall).toHaveBeenLastCalledWith('c-linds', { moment: id(1), by: undefined, limit: 60 }, expect.anything());
  });

  it('opens a photo inside the moment', async () => {
    await render(inApp(<Moment />));
    await userEvent.setup().press(screen.getByRole('button', { name: "Mia's first time steering. Photo added by Alex" }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'photo', id: canoe.id, moment: id(1) } });
  });

  it('turns it into an album of everything in it, and opens the album', async () => {
    const made = album({ id: id(77), title: 'Saturday at Lake Bled' });
    jest.mocked(createAlbum).mockResolvedValue(made);
    await render(inApp(<Moment />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Album' }));
    await waitFor(() => expect(mockCache.albumMade).toHaveBeenCalledWith(made));
    expect(createAlbum).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: 'Saturday at Lake Bled', momentOf: id(1) });
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'album', id: id(77) } });
  });

  it('tells it as a journey: the draft is made from this moment', async () => {
    await render(inApp(<Moment />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Journey' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/journey/tell/new', params: { moment: id(1), circle: 'c-linds' } });
  });

  it('starts selecting from the three dots', async () => {
    await render(inApp(<Moment />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Select photos' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/library/select', params: { moment: id(1) } });
  });

  it("shows a day that is one person's without the note or the chips for people", async () => {
    asked.mockReturnValue(loaded(thursday));
    await render(inApp(<Moment />));
    expect(screen.getByRole('header', { name: 'Thursday' })).toBeOnTheScreen();
    expect(screen.queryByText(/were here$/)).toBeNull();
    expect(screen.getByRole('button', { name: 'All 9' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'You, 9' })).toBeNull();
    expect(screen.getByLabelText('Seen by: Only you')).toBeOnTheScreen();
  });

  it('says "partly shared" when only some of it is', async () => {
    asked.mockReturnValue(loaded(moment({ audience: 'some' })));
    await render(inApp(<Moment />));
    expect(screen.getByLabelText('Seen by: Partly shared')).toBeOnTheScreen();
  });

  it('keeps its Back while it loads', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<Moment />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('says so when the moment is not there, or not shared with this person', async () => {
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await render(inApp(<Moment />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('is the "nothing at this address" page for an address that is no photo', async () => {
    mockParams = { id: 'whatever' };
    asked.mockReturnValue(pending());
    await render(inApp(<Moment />));
    expect(screen.getByRole('header', { name: "There's nothing at this address" })).toBeOnTheScreen();
  });
});
