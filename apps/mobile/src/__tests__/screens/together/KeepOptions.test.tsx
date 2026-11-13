import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { keepJourney, useGetJourneyJob, useGetKeepOptions, useGetKeptJourney, useGetNotes } from '@/api/generated/homeport';
import KeepJourney from '@/app/(app)/journey/keep/[journeyId]';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending } from '@/test/samples';
import { ALBUM, BOOK, ICELAND, job, keepOptions, kept, KEPT, TRIP } from '@/test/samples/together';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
let mockParams: { journeyId: string; trip?: string } = { journeyId: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001' };
const mockCache = { journeyKept: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, useIsFocused: () => true, Stack: { Screen: () => null } }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/api/generated/homeport', () => ({
  useGetKeepOptions: jest.fn(),
  useGetKeptJourney: jest.fn(),
  useGetJourneyJob: jest.fn(),
  // A trip is only asked for when the address names one.
  useGetTrip: jest.fn((tripId: string) => (tripId ? mockTrip : mockNoTrip)),
  useGetNotes: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  keepJourney: jest.fn(),
}));

const mockLinds = linds;
const mockMe = loaded({ ...me(), id: 'a-nora' });
const mockTrip = loaded({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000006', title: 'Norway 2027' });
const mockNoTrip = { ...mockTrip, data: undefined };
const asked = jest.mocked(useGetKeepOptions) as unknown as jest.Mock;
const keptAsked = jest.mocked(useGetKeptJourney) as unknown as jest.Mock;
const jobAsked = jest.mocked(useGetJourneyJob) as unknown as jest.Mock;
const notes = jest.mocked(useGetNotes) as unknown as jest.Mock;
const keep = jest.mocked(keepJourney);

describe('10.3 What to keep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { journeyId: ICELAND };
    asked.mockReturnValue(loaded(keepOptions()));
    keptAsked.mockReturnValue(pending());
    jobAsked.mockReturnValue(pending());
    notes.mockReturnValue(loaded({ spaces: [{ id: 'f-home', title: 'Home', emoji: '', canEdit: true }, { id: 'f-trips', title: 'Trips', emoji: '', canEdit: true }, { id: 'f-alex', title: "Alex's work", emoji: '', canEdit: false }] }));
  });

  it('shows the journey, with how long it was and who else wrote it', async () => {
    await render(inApp(<KeepJourney />));
    expect(asked).toHaveBeenCalledWith(ICELAND, { circleId: 'c-linds' });
    expect(screen.getByRole('header', { name: 'Keep this journey' })).toBeOnTheScreen();
    expect(screen.getByText('Iceland ring road')).toBeOnTheScreen();
    expect(screen.getByText('14 days · 62 entries · with Alex')).toBeOnTheScreen();
  });

  it('has four switches: the book, the originals and the route on, the kind words off', async () => {
    await render(inApp(<KeepJourney />));
    expect(screen.getByText('One page in Notes, every day in order')).toBeOnTheScreen();
    expect(screen.getByText('214 photos, 9 clips · 201 already in your Library')).toBeOnTheScreen();
    expect(screen.getByText('Drawn on your Places map')).toBeOnTheScreen();
    expect(screen.getByText('The kind words, kept with each day')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'The story, as a book' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'The originals' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'The route' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Comments and likes' })).not.toBeChecked();
  });

  it('says where it is kept and who can see it, as the API would have it', async () => {
    await render(inApp(<KeepJourney />));
    expect(screen.getByRole('button', { name: 'Keep it in: Trips. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by The Linds. Change' })).toBeOnTheScreen();
  });

  it('keeps it with what was chosen, and shows how far it is', async () => {
    keep.mockResolvedValue(job({ status: 'waiting', done: 0, total: 0 }));
    jobAsked.mockReturnValue(loaded(job()));
    await render(inApp(<KeepJourney />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('switch', { name: 'Comments and likes' }));
    await user.press(screen.getByRole('switch', { name: 'The route' }));
    await user.press(screen.getByRole('button', { name: 'Seen by The Linds. Change' }));
    await user.press(screen.getByRole('button', { name: 'Keep journey' }));
    await waitFor(() => expect(keep).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', journeyId: ICELAND, book: true, originals: true, route: false, words: true, folderId: 'f-trips', audience: 'me', tripId: null }));
    expect(await screen.findByText('Bringing it home')).toBeOnTheScreen();
    expect(screen.getByText('Bringing photos home')).toBeOnTheScreen();
    expect(screen.getByText('12 of 24')).toBeOnTheScreen();
    expect(screen.getByText('You can leave this page. It goes on by itself.')).toBeOnTheScreen();
    expect(mockCache.journeyKept).not.toHaveBeenCalled();
  });

  it('chooses another space to keep it in, or none', async () => {
    keep.mockResolvedValue(job());
    await render(inApp(<KeepJourney />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Keep it in: Trips. Change' }));
    // Only the spaces things can be put in are offered.
    expect(screen.getByRole('button', { name: 'Home' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: "Alex's work" })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'No folder. It stands in Notes by itself' }));
    expect(screen.getByRole('button', { name: 'Keep it in: No folder. Change' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Keep journey' }));
    await waitFor(() => expect(keep).toHaveBeenCalledWith(expect.objectContaining({ folderId: null })));
  });

  it('says what came home, and leads to the book and the album', async () => {
    keep.mockResolvedValue(job({ status: 'done', step: 'Up to date', done: 24, total: 24 }));
    keptAsked.mockReturnValue(loaded(kept()));
    await render(inApp(<KeepJourney />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Keep journey' }));
    expect(await screen.findByRole('header', { name: "It's home" })).toBeOnTheScreen();
    expect(screen.getByText("201 were in your Library already. 13 came from Journey, at the size Journey has. 9 stayed in Journey: it couldn't hand them over.")).toBeOnTheScreen();
    expect(keptAsked).toHaveBeenLastCalledWith(KEPT, { query: { enabled: true } });
    // Once it is home, every list of the circle has something new.
    expect(mockCache.journeyKept).toHaveBeenCalledTimes(1);
    expect(mockCache.journeyKept).toHaveBeenCalledWith('c-linds');
    await user.press(screen.getByRole('button', { name: 'Open the book' }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'page', id: BOOK } });
    await user.press(screen.getByRole('button', { name: 'See the album' }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'album', id: ALBUM } });
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('says why when keeping failed, and offers the switches again', async () => {
    keep.mockResolvedValue(job({ status: 'failed', problem: "Journey didn't answer. Nothing was changed." }));
    await render(inApp(<KeepJourney />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Keep journey' }));
    expect(await screen.findByText("That didn't work")).toBeOnTheScreen();
    expect(screen.getByText("Journey didn't answer. Nothing was changed.")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('button', { name: 'Keep journey' })).toBeOnTheScreen();
  });

  it("says why keeping can't start, in the API's words", async () => {
    keep.mockRejectedValue(new ApiError(403, 'not_yours', 'Only the people who wrote a journey can keep it.'));
    await render(inApp(<KeepJourney />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Keep journey' }));
    expect(await screen.findByText('Only the people who wrote a journey can keep it.')).toBeOnTheScreen();
  });

  it('brings home what is new for a journey that was kept before', async () => {
    asked.mockReturnValue(loaded(keepOptions({ keptId: KEPT, pageId: BOOK })));
    await render(inApp(<KeepJourney />));
    expect(screen.getByText('You kept this journey before. Keeping it again brings home what was added since.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Bring home what is new' })).toBeOnTheScreen();
  });

  it("says what Journey can't hand over, in the API's words, and leaves the count out when it can't be told", async () => {
    asked.mockReturnValue(loaded(keepOptions({ inLibrary: null, originalsNote: "Journey doesn't say when a photo was taken, so it can't be matched.", clipsNote: 'Clips stay in Journey for now.' })));
    await render(inApp(<KeepJourney />));
    expect(screen.getByText('214 photos, 9 clips')).toBeOnTheScreen();
    expect(screen.getByText("Journey doesn't say when a photo was taken, so it can't be matched. Clips stay in Journey for now.")).toBeOnTheScreen();
  });

  it("keeps a trip's journey as that trip's book, in the trip's own folder", async () => {
    mockParams = { journeyId: ICELAND, trip: TRIP };
    keep.mockResolvedValue(job());
    await render(inApp(<KeepJourney />));
    expect(screen.getByRole('button', { name: 'Keep it in: Norway 2027. Change' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Keep journey' }));
    await waitFor(() => expect(keep).toHaveBeenCalledWith(expect.objectContaining({ folderId: TRIP, tripId: TRIP })));
  });

  it("can't keep nothing: with every switch off the button rests", async () => {
    await render(inApp(<KeepJourney />));
    const user = userEvent.setup();
    for (const name of ['The story, as a book', 'The originals', 'The route']) await user.press(screen.getByRole('switch', { name }));
    expect(screen.getByRole('button', { name: 'Keep journey' })).toBeDisabled();
  });

  it('keeps its way out while it loads, and closes', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<KeepJourney />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getAllByRole('button', { name: 'Close' })[0]!);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("says so when the journey isn't yours to keep, or isn't there", async () => {
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "We couldn't find that.")));
    await render(inApp(<KeepJourney />));
    expect(screen.getByText("We couldn't find that.")).toBeOnTheScreen();
  });

  it('is the "nothing at this address" page for an address that names no journey', async () => {
    mockParams = { journeyId: 'whatever' };
    await render(inApp(<KeepJourney />));
    expect(screen.getByRole('header', { name: "There's nothing at this address" })).toBeOnTheScreen();
  });
});
