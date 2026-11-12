import { render, screen, userEvent } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { useGetJourneySwitch, useGetKeptJourneysInfinite, useGetMyJourneysInfinite } from '@/api/generated/homeport';
import KeepList from '@/app/(app)/journey/keep/index';
import KeptJourneys from '@/app/(app)/journey/kept';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { ALBUM, appSwitch, BOOK, ICELAND, id, journey, kept, pages } from '@/test/samples/together';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false), dismissAll: jest.fn(), navigate: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/ui/List', () => jest.requireActual('@/test/samples/library').listForTests);
jest.mock('@/api/generated/homeport', () => ({ useGetMyJourneysInfinite: jest.fn(), useGetKeptJourneysInfinite: jest.fn(), useGetJourneySwitch: jest.fn() }));

const mockLinds = linds;
const mine = jest.mocked(useGetMyJourneysInfinite) as unknown as jest.Mock;
const keptAsked = jest.mocked(useGetKeptJourneysInfinite) as unknown as jest.Mock;
const mode = jest.mocked(useGetJourneySwitch) as unknown as jest.Mock;
const waiting = () => ({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
const java = kept({ id: id(40), journeyId: id(41), title: 'Java and Bali by train', byline: 'Nora', pageId: null, albumId: id(42), stats: { days: 30, entries: 4, photos: 4, clips: 0, places: 4, followers: 34 }, keptAt: '2024-12-01T20:00:00Z' });

describe('Kept from Journey: the journeys kept in a circle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    keptAsked.mockReturnValue(pages([kept(), java]));
  });

  it('lists them with who told them, how many photos, and when they were kept', async () => {
    await render(inApp(<KeptJourneys />));
    expect(keptAsked).toHaveBeenCalledWith('c-linds', undefined, expect.anything());
    expect(screen.getByRole('header', { name: 'Kept from Journey' })).toBeOnTheScreen();
    expect(screen.getByText('Iceland ring road')).toBeOnTheScreen();
    expect(screen.getByText('A journey by Nora and Alex')).toBeOnTheScreen();
    expect(screen.getByText('214 photos · kept 20 Apr')).toBeOnTheScreen();
    expect(screen.getByText('4 photos · kept 1 Dec 2024')).toBeOnTheScreen();
  });

  it('opens a kept journey as its book, or its album when no book was kept', async () => {
    await render(inApp(<KeptJourneys />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Iceland ring road. A journey by Nora and Alex. 214 photos · kept 20 Apr' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'page', id: BOOK } });
    await user.press(screen.getByRole('button', { name: /^Java and Bali by train\./ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'album', id: id(42) } });
    expect(ALBUM).not.toBe(id(42));
  });

  it('leads to keeping another, and to Journey at home', async () => {
    await render(inApp(<KeptJourneys />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Keep a journey' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/journey/keep');
    await user.press(screen.getByRole('button', { name: 'Journey at home' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/journey/at-home');
  });

  it('says what will land here while nothing is kept, with the way to keep one', async () => {
    keptAsked.mockReturnValue(pages([]));
    await render(inApp(<KeptJourneys />));
    expect(screen.getByRole('header', { name: 'Nothing kept yet' })).toBeOnTheScreen();
    expect(screen.getByText('Keep a finished journey and it lands here: its story as a book, its photos as an album.')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Keep a journey' })).toHaveLength(2);
  });

  it('loads more as the list ends', async () => {
    const more = pages([kept()], true);
    keptAsked.mockReturnValue(more);
    await render(inApp(<KeptJourneys />));
    await userEvent.setup().press(screen.getByLabelText('the end of the list'));
    expect(more.fetchNextPage).toHaveBeenCalled();
  });

  it('keeps its Back while it loads, and says what went wrong', async () => {
    keptAsked.mockReturnValue(waiting());
    await render(inApp(<KeptJourneys />));
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    keptAsked.mockReturnValue({ ...failed(new ApiError(500, 'server', 'Something went wrong on our side.')), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    await render(inApp(<KeptJourneys />));
    expect(screen.getByText('Something went wrong on our side.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });
});

describe('Keep a journey: your own journeys, to choose one from', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mine.mockReturnValue(pages([journey({ id: id(60), title: 'Family 10K', status: 'active', coverUrl: null, days: 12, entries: 12 }), journey()]));
    keptAsked.mockReturnValue(pages([kept()]));
    mode.mockReturnValue(loaded(appSwitch({ mode: 'http' })));
  });

  it('lists them with how long they are and how they stand, and marks the ones kept here', async () => {
    await render(inApp(<KeepList />));
    expect(screen.getByRole('header', { name: 'Keep a journey' })).toBeOnTheScreen();
    expect(screen.getByText('Your journeys in Journey. Choose one to bring home.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Family 10K. 12 days · 12 entries. Still going' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Iceland ring road. 14 days · 62 entries. Finished. Kept' })).toBeOnTheScreen();
  });

  it('leads to "What to keep" for the one that is chosen', async () => {
    await render(inApp(<KeepList />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Iceland ring road. 14 days · 62 entries. Finished. Kept' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/journey/keep/[journeyId]', params: { journeyId: ICELAND } });
  });

  it('says that these are samples when Journey is a stand-in, and only then', async () => {
    await render(inApp(<KeepList />));
    expect(screen.queryByText(/sample journeys/)).toBeNull();
    mode.mockReturnValue(loaded(appSwitch()));
    await render(inApp(<KeepList />));
    expect(screen.getByText('These are sample journeys: this Homeport runs with a stand-in for Journey.')).toBeOnTheScreen();
  });

  it('draws "Keep every journey I finish" and says it is not built', async () => {
    await render(inApp(<KeepList />));
    expect(screen.getByText('Keep every journey I finish')).toBeOnTheScreen();
    expect(screen.getByText('Not built yet. For now, keep them one by one.')).toBeOnTheScreen();
  });

  it('says so when there are none yet', async () => {
    mine.mockReturnValue(pages([]));
    await render(inApp(<KeepList />));
    expect(screen.getByRole('header', { name: 'No journeys yet' })).toBeOnTheScreen();
  });

  it('keeps its Back while it loads', async () => {
    mine.mockReturnValue(waiting());
    await render(inApp(<KeepList />));
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
  });
});
