import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ApiError } from '@/api/fetcher';
import { removeTrip, saveTrip, startTripJourney, useGetTrip, useGetTrips } from '@/api/generated/homeport';
import { useTripOf } from '@/features/journeyLink/trip/dates';
import { TripDatesSheet } from '@/features/journeyLink/trip/TripDatesSheet';
import { TripSpace } from '@/features/journeyLink/trip/TripSpace';
import { today } from '@/lib/dates';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending } from '@/test/samples';
import { folder } from '@/test/samples/notes';
import { BOOK, id, journey, kept, trip, TRIP } from '@/test/samples/together';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false), dismissAll: jest.fn(), navigate: jest.fn() };
const mockCache = { tripSaved: jest.fn(() => Promise.resolve()), tripRemoved: jest.fn(() => Promise.resolve()) };
const mockOpenJourney = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/journeyLink/open', () => ({ useOpenJourney: () => mockOpenJourney }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({ useGetTrip: jest.fn(), useGetTrips: jest.fn(), useGetMe: jest.fn(() => mockMe), saveTrip: jest.fn(), removeTrip: jest.fn(), startTripJourney: jest.fn() }));

const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetTrip) as unknown as jest.Mock;
const trips = jest.mocked(useGetTrips) as unknown as jest.Mock;
const norway = folder({ id: TRIP, title: 'Norway 2027', space: false, parentId: 'f-trips' });
const lofoten = journey({ id: id(80), title: 'Norway 2027', status: 'active', progressLabel: 'Day 3 of 15', openUrl: `journey://journey/${id(80)}` });

describe('10.7 A trip, start to finish', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(trip()));
  });

  it('says what it is, who sees it, and where it stands among its three stages', async () => {
    await render(inApp(<TripSpace folder={norway} />));
    expect(asked).toHaveBeenCalledWith(TRIP, { day: today() });
    expect(screen.getByRole('header', { name: 'Norway 2027' })).toBeOnTheScreen();
    expect(screen.getByText('A trip in Trips')).toBeOnTheScreen();
    expect(screen.getByLabelText('Seen by: The Linds. Change who can see this')).toBeOnTheScreen();
    expect(screen.getByLabelText('Plan: now')).toBeOnTheScreen();
    expect(screen.getByLabelText('Go: 3 to 17 Apr')).toBeOnTheScreen();
    expect(screen.getByLabelText('Keep: after')).toBeOnTheScreen();
  });

  it("lists what is filed in it, each with where it stands, and opens each by its kind", async () => {
    await render(inApp(<TripSpace folder={norway} />));
    expect(screen.getByText('Getting ready')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Packing, per person. 22 of 61 done' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Norway budget. €2,500 of €7,640' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Day by day. 14 days sketched · Bergen to Tromsø' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'page', id: id(301) } });
  });

  it('says when it becomes a journey and what is set up, and what comes afterwards', async () => {
    await render(inApp(<TripSpace folder={norway} />));
    expect(screen.getByText('On 3 April this becomes a journey')).toBeOnTheScreen();
    expect(screen.getByText('Title, dates, route and Alex as co-author are set up for you. Post from the road; the originals come back here.')).toBeOnTheScreen();
    expect(screen.getByText('Afterwards: the trip book')).toBeOnTheScreen();
    expect(screen.getByText('The journey, the map and what it really cost, on one page.')).toBeOnTheScreen();
  });

  it('shows the draft: what Journey is told, and what stays here', async () => {
    await render(inApp(<TripSpace folder={norway} />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'See the draft' }));
    expect(screen.getByRole('header', { name: 'The draft' })).toBeOnTheScreen();
    expect(screen.getByText('What Journey is told when this starts. Everything else in the trip stays here.')).toBeOnTheScreen();
    // Its dates stand under "Go" on the page and in the draft.
    expect(screen.getAllByText('3 to 17 Apr')).toHaveLength(2);
    expect(screen.getByText('Bergen, Flåm, Tromsø · Stays here: Journey is told the title and the dates')).toBeOnTheScreen();
    expect(screen.getByText('Alex')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Private' })).toBeChecked();
    // Before day one it can start early; the main way is to come back that day.
    expect(screen.getByText("The trip starts on 3 April 2027. Start the journey that day, or now if you're on your way already. A trip becomes a journey once.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Start it now' })).toBeOnTheScreen();
  });

  it('starts the journey on day one, as what was chosen, and shows it as being told', async () => {
    asked.mockReturnValue(loaded(trip({ stage: 'go', startsOn: today(), becomes: { ...trip().becomes, on: today() } })));
    jest.mocked(startTripJourney).mockResolvedValue(trip({ stage: 'go', becomes: null, journey: { journeyId: id(80), openUrl: `journey://journey/${id(80)}`, journey: lofoten } }));
    await render(inApp(<TripSpace folder={norway} />));
    expect(screen.getByText('Today this can become a journey')).toBeOnTheScreen();
    expect(screen.getByLabelText('Go: now')).toBeOnTheScreen();
    expect(screen.getByText('For the road')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'See the draft' }));
    await user.press(screen.getByRole('radio', { name: 'Unlisted' }));
    await user.press(screen.getByRole('button', { name: 'Start the journey' }));
    await waitFor(() => expect(startTripJourney).toHaveBeenCalledWith(TRIP, { clientId: 'client-1', visibility: 'unlisted' }, { day: today() }));
    await waitFor(() => expect(mockCache.tripSaved).toHaveBeenCalledWith(expect.objectContaining({ id: TRIP, circleId: 'c-linds' })));
  });

  it("says why it can't become a journey, in the API's words", async () => {
    asked.mockReturnValue(loaded(trip({ becomes: { ...trip().becomes, canBecome: false, note: "You don't have a Journey profile yet." } })));
    await render(inApp(<TripSpace folder={norway} />));
    expect(screen.getByText("You don't have a Journey profile yet.")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'See the draft' }));
    expect(screen.getByRole('button', { name: 'Start it now' })).toBeDisabled();
  });

  it('shows the journey it became, how far along it is, and the way to it', async () => {
    asked.mockReturnValue(loaded(trip({ stage: 'go', becomes: null, journey: { journeyId: id(80), openUrl: `journey://journey/${id(80)}`, journey: lofoten } })));
    await render(inApp(<TripSpace folder={norway} />));
    expect(screen.getByText('Being told in Journey')).toBeOnTheScreen();
    expect(screen.getByText('Norway 2027 · Day 3 of 15')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'See the draft' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Open in Journey' }));
    expect(mockOpenJourney).toHaveBeenCalledWith(`journey://journey/${id(80)}`);
  });

  it('offers to bring it home once it is over', async () => {
    asked.mockReturnValue(loaded(trip({ stage: 'keep', becomes: null, journey: { journeyId: id(80), openUrl: null, journey: { ...lofoten, status: 'completed' } } })));
    await render(inApp(<TripSpace folder={norway} />));
    expect(screen.getByLabelText('Keep: now')).toBeOnTheScreen();
    expect(screen.getByText('Told in Journey')).toBeOnTheScreen();
    expect(screen.getByText("It's over. Bring it home")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Keep the journey' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/journey/keep/[journeyId]', params: { journeyId: id(80), trip: TRIP } });
  });

  it('shows the trip book, and what it cost next to what was planned', async () => {
    asked.mockReturnValue(loaded(trip({ stage: 'keep', becomes: null, journey: { journeyId: id(80), openUrl: null, journey: { ...lofoten, status: 'completed' } }, book: kept({ title: 'Norway 2027' }) })));
    await render(inApp(<TripSpace folder={norway} />));
    expect(screen.getByText('What you planned')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'What it cost. €2,500 paid · €7,640 planned' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'The trip book. A journey by Nora and Alex' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'page', id: BOOK } });
  });

  it('opens as the folder it is, changes its dates, and stops being a trip after asking', async () => {
    jest.mocked(removeTrip).mockResolvedValue(undefined);
    await render(inApp(<TripSpace folder={norway} />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Open as a folder. To add, move and rename what is in it' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/folder/[id]', params: { id: TRIP, as: 'folder' } });
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Change the dates' }));
    expect(screen.getByRole('header', { name: 'When is the trip?' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'First day: Sat 3 Apr 2027. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save the dates' })).toBeOnTheScreen();
  });

  it('stops being a trip after asking: the folder stays', async () => {
    jest.mocked(removeTrip).mockResolvedValue(undefined);
    await render(inApp(<TripSpace folder={norway} />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Stop being a trip' }));
    expect(screen.getByRole('header', { name: 'Stop “Norway 2027” being a trip?' })).toBeOnTheScreen();
    expect(screen.getByText('The folder and everything in it stay. Only its dates and its three stages go.')).toBeOnTheScreen();
    expect(removeTrip).not.toHaveBeenCalled();
    await user.press(screen.getAllByRole('button', { name: 'Stop being a trip' }).at(-1)!);
    await waitFor(() => expect(mockCache.tripRemoved).toHaveBeenCalledWith(expect.objectContaining({ id: TRIP })));
    expect(removeTrip).toHaveBeenCalledWith(TRIP);
  });

  it("offers someone who can't change it only the folder", async () => {
    asked.mockReturnValue(loaded(trip({ canEdit: false, mine: false })));
    await render(inApp(<TripSpace folder={norway} />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: 'Change the dates' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stop being a trip' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Open as a folder/ })).toBeOnTheScreen();
  });

  it('keeps its Back while it loads, and says so when it is not there', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<TripSpace folder={norway} />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await render(inApp(<TripSpace folder={norway} />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
  });
});

describe('making a folder a trip', () => {
  beforeEach(() => jest.clearAllMocks());

  it('gives it two days, from today for a week unless changed, and it is a trip from then on', async () => {
    jest.mocked(saveTrip).mockResolvedValue(trip());
    const onClose = jest.fn();
    await render(inApp(<TripDatesSheet visible onClose={onClose} folder={{ id: TRIP, circleId: 'c-linds' }} />));
    expect(screen.getByText('A folder with dates is a trip: planned here, told in Journey, and kept as a book afterwards.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Make it a trip' }));
    await waitFor(() => expect(saveTrip).toHaveBeenCalledWith(TRIP, { startsOn: today(), endsOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }, { day: today() }));
    await waitFor(() => expect(mockCache.tripSaved).toHaveBeenCalledWith(expect.objectContaining({ id: TRIP })));
    expect(onClose).toHaveBeenCalled();
  });

  it("says why the dates couldn't be saved", async () => {
    jest.mocked(saveTrip).mockRejectedValue(new ApiError(400, 'invalid', 'A trip ends on or after the day it starts.'));
    await render(inApp(<TripDatesSheet visible onClose={jest.fn()} folder={{ id: TRIP, circleId: 'c-linds' }} startsOn="2027-04-03" endsOn="2027-04-17" />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Save the dates' }));
    expect(await screen.findByText('A trip ends on or after the day it starts.')).toBeOnTheScreen();
  });
});

function Probe({ plain }: { plain?: boolean }) {
  return <Text>{useTripOf({ id: TRIP, circleId: 'c-linds' }, plain)}</Text>;
}

describe('a folder that is a trip, and one that is not', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is a trip when the trips of its circle name it', async () => {
    trips.mockReturnValue(loaded([{ id: TRIP, title: 'Norway 2027', startsOn: '2027-04-03', endsOn: '2027-04-17', stage: 'plan' }]));
    await render(inApp(<Probe />));
    expect(screen.getByText('trip')).toBeOnTheScreen();
    expect(trips).toHaveBeenCalledWith('c-linds', { day: today() }, { query: { enabled: true } });
  });

  it('stays a folder when they do not, when they can not be asked, and when it was opened "as a folder"', async () => {
    trips.mockReturnValue(loaded([]));
    expect((await render(inApp(<Probe />))).getByText('folder')).toBeOnTheScreen();
    trips.mockReturnValue(failed(new ApiError(0, 'unreachable', 'Nothing answered.')));
    expect((await render(inApp(<Probe />))).getByText('folder')).toBeOnTheScreen();
    trips.mockReturnValue(loaded([{ id: TRIP }]));
    expect((await render(inApp(<Probe plain />))).getByText('folder')).toBeOnTheScreen();
    expect(trips).toHaveBeenLastCalledWith('c-linds', { day: today() }, { query: { enabled: false } });
  });

  it('is not known yet while the trips are on their way', async () => {
    trips.mockReturnValue(pending());
    await render(inApp(<Probe />));
    expect(screen.getByText('asking')).toBeOnTheScreen();
  });
});
