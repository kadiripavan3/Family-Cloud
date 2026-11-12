import { render, screen, userEvent } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { useGetLenses, useGetTimeline, useGetWallInfinite } from '@/api/generated/homeport';
import { LibraryHome } from '@/features/library/LibraryHome';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { canoe, id, lenses, moment, pages, photo, timeline, wallPage } from '@/test/samples/library';

const mockRouter = { push: jest.fn(), setParams: jest.fn() };
let mockParams: { until?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/ui/List', () => jest.requireActual('@/test/samples/library').listForTests);
jest.mock('@/api/generated/homeport', () => ({ useGetWallInfinite: jest.fn(), useGetLenses: jest.fn(), useGetTimeline: jest.fn() }));

const mockLinds = linds;
const wall = jest.mocked(useGetWallInfinite) as unknown as jest.Mock;
const months = jest.mocked(useGetTimeline) as unknown as jest.Mock;

describe('6.1 The wall', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    wall.mockReturnValue(pages([wallPage()]));
    (jest.mocked(useGetLenses) as unknown as jest.Mock).mockReturnValue(loaded(lenses));
    months.mockReturnValue(loaded(timeline()));
  });

  it('asks for the newest photos of the circle, a page at a time', async () => {
    await render(inApp(<LibraryHome />));
    expect(wall).toHaveBeenCalledWith('c-linds', { until: undefined, limit: 60 }, expect.anything());
  });

  it('shows the lenses, and each day under its own line', async () => {
    await render(inApp(<LibraryHome />));
    for (const lens of ['Wall', 'Albums', 'People', 'Places', 'Files']) expect(screen.getByRole('button', { name: lens })).toBeOnTheScreen();
    // A day several people photographed is a moment, named by its place.
    expect(screen.getByText('Saturday at Lake Bled')).toBeOnTheScreen();
    expect(screen.getByText('7 Nov · Lake Bled · 51 from 3 people')).toBeOnTheScreen();
    // A day that is one person's says how many.
    expect(screen.getByText('Thursday')).toBeOnTheScreen();
    expect(screen.getByText('5 Nov · Home · 9 photos')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Mia's first time steering. Photo added by Alex" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Video, 0:42, added by Alex' })).toBeOnTheScreen();
  });

  it('opens a photo inside its moment, and a moment from its line', async () => {
    await render(inApp(<LibraryHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "Mia's first time steering. Photo added by Alex" }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'photo', id: canoe.id, moment: canoe.id } });
    await user.press(screen.getByRole('button', { name: /^Saturday at Lake Bled\./ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/library/moment/[id]', params: { id: canoe.id } });
  });

  it('starts selecting when a photo is pressed and held', async () => {
    await render(inApp(<LibraryHome />));
    await userEvent.setup().longPress(screen.getByRole('button', { name: 'Video, 0:42, added by Alex' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/library/select', params: { first: id(5) } });
  });

  it('leads to the other ways of looking from its chips', async () => {
    await render(inApp(<LibraryHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Albums' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/library/albums');
    await user.press(screen.getByRole('button', { name: 'Places' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/library/places');
    await user.press(screen.getByRole('button', { name: 'Files' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/library/files');
  });

  it('narrows to the photos one person is in, from who was tagged', async () => {
    await render(inApp(<LibraryHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'People' }));
    expect(screen.getByRole('header', { name: 'People in your photos' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Mia. 8 photos' }));
    expect(wall).toHaveBeenLastCalledWith('c-linds', { about: 'm-mia', until: undefined, limit: 60 }, expect.anything());
    // The chip now carries her name; Wall goes back to everything.
    expect(screen.getByRole('button', { name: 'Mia' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Wall' }));
    expect(wall).toHaveBeenLastCalledWith('c-linds', { until: undefined, limit: 60 }, expect.anything());
  });

  it('jumps to a year from the strip at the side, and back to the newest', async () => {
    await render(inApp(<LibraryHome />));
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'November 2026. Jump to a month' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Jump to 2025' }));
    expect(mockRouter.setParams).toHaveBeenLastCalledWith({ until: '2025-12-31' });
    await user.press(screen.getByRole('button', { name: 'Jump to 2026' }));
    expect(mockRouter.setParams).toHaveBeenLastCalledWith({ until: undefined });
  });

  it('starts where the address says', async () => {
    mockParams = { until: '2025-12-31' };
    await render(inApp(<LibraryHome />));
    expect(wall).toHaveBeenCalledWith('c-linds', { until: '2025-12-31', limit: 60 }, expect.anything());
  });

  it('jumps to a month from the bubble, or opens the whole year', async () => {
    await render(inApp(<LibraryHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'November 2026. Jump to a month' }));
    expect(screen.getByRole('header', { name: 'Jump to a month of 2026' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'October. 268 photos' }));
    expect(mockRouter.setParams).toHaveBeenLastCalledWith({ until: '2026-10-31' });
    await user.press(screen.getByRole('button', { name: 'November 2026. Jump to a month' }));
    await user.press(screen.getByRole('button', { name: 'See all of 2026' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/library/years', params: { year: '2026' } });
  });

  it('asks for more as the end comes near', async () => {
    const more = pages([wallPage(undefined, undefined, 'next')], true);
    wall.mockReturnValue(more);
    await render(inApp(<LibraryHome />));
    expect(more.fetchNextPage).not.toHaveBeenCalled();
    await userEvent.setup().press(screen.getByLabelText('the end of the list'));
    expect(more.fetchNextPage).toHaveBeenCalled();
  });

  it('follows the wall: the bubble says the month at the top of the screen', async () => {
    const old = photo({ id: id(90), momentId: id(90), takenLocal: '2025-08-03T10:00:00', takenAt: '2025-08-03T08:00:00Z', placeName: null });
    wall.mockReturnValue(pages([wallPage([canoe, old], [moment()])]));
    await render(inApp(<LibraryHome />));
    // The rows are: the lake's line, its photo, the older day's line, its photo.
    await userEvent.setup().press(screen.getByLabelText('row 3 at the top'));
    expect(screen.getByRole('button', { name: 'August 2025. Jump to a month' })).toBeOnTheScreen();
  });

  it('draws grey tiles while the wall is on its way, and keeps the chips', async () => {
    wall.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    await render(inApp(<LibraryHome />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Albums' })).toBeOnTheScreen();
  });

  it('says so offline, when nothing was loaded on this phone yet', async () => {
    wall.mockReturnValue({ ...pending(), isPaused: true, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    await render(inApp(<LibraryHome />));
    expect(screen.getByRole('header', { name: "You're offline" })).toBeOnTheScreen();
  });

  it('says what went wrong and asks again', async () => {
    const broken = { ...failed(new ApiError(500, 'oops', 'Something went wrong on our side. Try again.')), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() };
    wall.mockReturnValue(broken);
    await render(inApp(<LibraryHome />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(broken.refetch).toHaveBeenCalled();
  });

  it('invites the first photos into an empty Library', async () => {
    wall.mockReturnValue(pages([wallPage([], [])]));
    months.mockReturnValue(loaded(timeline({ years: [], year: null, months: [] })));
    await render(inApp(<LibraryHome />));
    expect(screen.getByRole('header', { name: 'Your photos live here' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add photos' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/new/photos');
  });
});
