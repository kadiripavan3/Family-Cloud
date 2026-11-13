import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addBoardEntry, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { formatWeekdayPast } from '@/lib/dates';
import { BOARD_ID, mockBoardRouterState } from '@/test/boards';
import { inApp } from '@/test/phone';
import { crewCircle, loaded } from '@/test/samples';
import { walkBoard, walkView } from '@/test/samples/crew';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockCrew, useCircles: () => [mockCrew], useCircleIfAny: () => mockCrew }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: (props: { visible: boolean }) => mockSheet(props) }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const mockCrew = { ...crewCircle, myMemberId: 'm-crew-1' };
function mockSheet({ visible }: { visible: boolean }) {
  const { Text } = jest.requireActual('react-native');
  return visible ? <Text>the audience sheet</Text> : null;
}
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };

describe('19.9 A goal you walk together', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(walkBoard()));
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'walk-new', board: walkBoard() });
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
  });

  it('draws the walk as a line with how far the crew has come, the places on the way, and this week for each person', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Walk to Lisbon' })).toBeOnTheScreen();
    expect(screen.getByText('Lisbon crew · 2,100 km together')).toBeOnTheScreen();
    expect(screen.getByLabelText('The walk from Ljubljana to Lisbon: 1,240 km of 2,100 km, 59% of the way')).toBeOnTheScreen();
    expect(screen.getByText('Start')).toBeOnTheScreen();
    expect(screen.getByText('1,240 km')).toBeOnTheScreen();
    expect(screen.getByText('Ljubljana')).toBeOnTheScreen();
    // The end is named twice, as in the drawing: on its pin and on the map under it.
    expect(screen.getAllByText('Lisbon')).toHaveLength(2);
    for (const place of ['Milan', 'Lyon', 'Madrid']) expect(screen.getByText(place)).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'This week: 152 km' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Lea: 44 km this week, 324 km in all')).toBeOnTheScreen();
    expect(screen.getByLabelText('You: 31 km this week, 261 km in all')).toBeOnTheScreen();
    expect(screen.getByLabelText('Kai: 12 km this week, 140 km in all')).toBeOnTheScreen();
    expect(screen.getByText('44 km')).toBeOnTheScreen();
    expect(screen.getByText('12 km')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add what you walked' })).toBeOnTheScreen();
  });

  it('adds what was walked today, as whole metres', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add what you walked' }));
    expect(screen.getByText('Only a number. Nothing is read from the phone, and no route is kept.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Which day: Today. Change' })).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Kilometres'), 'far');
    await user.press(screen.getByRole('button', { name: 'Add it' }));
    expect(screen.getByText('Write the kilometres as a number, like 4.5. One walk can be up to 500.')).toBeOnTheScreen();
    expect(addBoardEntry).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Kilometres'));
    await user.type(screen.getByLabelText('Kilometres'), '4,5');
    await user.press(screen.getByRole('button', { name: 'Add it' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'walk', fields: { amount: 4500, day: '2026-11-11' } }, DAY));
  });

  it('adds a walk for one of the last days', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add what you walked' }));
    await user.press(screen.getByRole('button', { name: 'Which day: Today. Change' }));
    await user.press(screen.getByRole('button', { name: '9 November 2026' }));
    await user.type(screen.getByLabelText('Kilometres'), '12');
    await user.press(screen.getByRole('button', { name: 'Add it' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'walk', fields: { amount: 12000, day: '2026-11-09' } }, DAY));
  });

  it("lists this person's own walks of the last month, and takes one out when a number was wrong", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add what you walked' }));
    expect(screen.getByText('Your walks of the last month')).toBeOnTheScreen();
    expect(screen.getByText('28.8 km')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: `Take out 31 km on ${formatWeekdayPast('2026-11-09')}` }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('walk-monday'));
  });

  it('says why when the API refuses a walk', async () => {
    jest.mocked(addBoardEntry).mockRejectedValue(new ApiError(400, 'invalid_day', 'Choose today or one of the last 31 days.'));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add what you walked' }));
    await user.type(screen.getByLabelText('Kilometres'), '3');
    await user.press(screen.getByRole('button', { name: 'Add it' }));
    expect(await screen.findByText('Choose today or one of the last 31 days.')).toBeOnTheScreen();
  });

  it('adds a place along the way from More, refuses one past the end, and takes one off', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Places along the way' }));
    expect(screen.getByText('490 km · reached')).toBeOnTheScreen();
    expect(screen.getByText('1,580 km')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('The place'), 'Porto');
    await user.type(screen.getByLabelText('How many kilometres from the start'), '2500');
    await user.press(screen.getByRole('button', { name: 'Add the place' }));
    expect(screen.getByText('That is past the end. The whole way is 2,100 km.')).toBeOnTheScreen();
    expect(addBoardEntry).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('How many kilometres from the start'));
    await user.type(screen.getByLabelText('How many kilometres from the start'), '1,900');
    await user.press(screen.getByRole('button', { name: 'Add the place' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'stop', fields: { name: 'Porto', at: 1_900_000 } }, DAY));
    await user.press(screen.getByRole('button', { name: 'Take Madrid off the way' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('stop-madrid'));
  });

  it('keeps who can see it and the way back in its own bar', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Who can see this' }));
    expect(screen.getByText('the audience sheet')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockBoardRouterState.back).toHaveBeenCalled();
  });

  it('says "You made it" once the crew has walked all the way', async () => {
    asked.mockReturnValue(loaded(walkBoard(walkView({ total: 2_104_000, percent: 100, reached: true, stops: walkView().stops.map((stop) => ({ ...stop, reached: true })) }))));
    await render(inApp(<Board />));
    expect(screen.getByText('You made it')).toBeOnTheScreen();
    expect(screen.queryByText('2,104 km')).toBeNull();
    expect(screen.getByLabelText('The walk from Ljubljana to Lisbon: 2,104 km of 2,100 km, 100% of the way')).toBeOnTheScreen();
  });

  it('counts steps on a board that counts steps', async () => {
    const steps = walkView({ unit: 'steps', goal: 1_000_000, total: 412_500, percent: 41, thisWeek: 96_400, from: null, to: null, stops: [], people: walkView().people.map((one, index) => ({ ...one, thisWeek: 30_000 - index * 4_000, total: 100_000 })), yours: [] });
    asked.mockReturnValue(loaded(walkBoard(steps, { title: 'A million steps' })));
    await render(inApp(<Board />));
    expect(screen.getByText('Lisbon crew · 1,000,000 steps together')).toBeOnTheScreen();
    expect(screen.getByText('412,500 steps')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'This week: 96,400 steps' })).toBeOnTheScreen();
    expect(screen.getByText('The end')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add what you walked' }));
    await user.type(screen.getByLabelText('Steps'), '8,400');
    await user.press(screen.getByRole('button', { name: 'Add it' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'walk', fields: { amount: 8400, day: '2026-11-11' } }, DAY));
  });

  it('offers the places along the way only to someone who may change the board', async () => {
    asked.mockReturnValue(loaded(walkBoard(walkView(), { canEdit: false })));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: 'Places along the way' })).toBeNull();
    // Their own walks are theirs to add, whoever they are.
    expect(screen.getByRole('button', { name: 'Your walks of the last month' })).toBeOnTheScreen();
  });
});
