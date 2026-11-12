import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addBoardEntry, changeBoardEntry, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { formatWeekdayDay } from '@/lib/dates';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded } from '@/test/samples';
import { turnsBoard, turnsView } from '@/test/samples/perks';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const mockLinds = linds;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };

describe('16.1 Whose turn?', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(turnsBoard()));
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'turn-new', board: turnsBoard() });
    jest.mocked(changeBoardEntry).mockResolvedValue(turnsBoard());
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined);
  });

  it('shows what is on tonight and whose turn it is, then the rest that keep count, and the proof', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Whose turn?' })).toBeOnTheScreen();
    expect(screen.getByText('Tonight is Film night')).toBeOnTheScreen();
    expect(screen.getByText('Leo chooses the film')).toBeOnTheScreen();
    expect(screen.getByText('Mia chose last Friday. Frozen, again.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Done, pass it on' })).toBeOnTheScreen();
    expect(screen.getByText('Also keeping count')).toBeOnTheScreen();
    // Each row says whose turn it is at its end, and the API's own line about last time under its name.
    expect(screen.getByRole('button', { name: "The front seat. Mia's turn. Leo had it on the way to school" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Pizza toppings. Leo's turn. Mia went for olives last time" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "First in the bath. Mia's turn. Every evening" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "The early walk with Biscuit. Alex's turn. You did Monday and Tuesday" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Proof, for arguments. 61 turns kept since March, each with its date.' })).toBeOnTheScreen();
  });

  it('passes tonight on with one press, and keeps the list that comes back', async () => {
    const after = turnsBoard(turnsView({ turns: 62 }));
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'turn-new', board: after });
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Done, pass it on' }));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalledWith(after));
    expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'turn', fields: { thingId: 'thing-film' } }, DAY);
  });

  it('writes a turn down for someone who took it instead, with a few words', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^The front seat/ }));
    expect(screen.getByRole('header', { name: 'The front seat' })).toBeOnTheScreen();
    expect(screen.getByText('Who took the turn?')).toBeOnTheScreen();
    // It was Mia's turn, but Leo took it again.
    await user.press(screen.getByRole('button', { name: 'Leo' }));
    await user.type(screen.getByLabelText('A few words, if you like'), 'Mia was at swimming');
    await user.press(screen.getAllByRole('button', { name: 'Done, pass it on' }).at(-1)!);
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'turn', fields: { thingId: 'thing-seat', memberId: 'm-leo', note: 'Mia was at swimming' } }, DAY));
  });

  it('takes the last turn back, and says something is on tonight', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^The front seat/ }));
    await user.press(screen.getByRole('button', { name: `Take back Leo's turn of ${formatWeekdayDay('2026-11-11')}` }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('turn-seat-leo'));
    await waitFor(() => expect(mockBoardCache.boardTouched).toHaveBeenCalled());

    await user.press(screen.getByRole('button', { name: /^Pizza toppings/ }));
    await user.press(screen.getByRole('button', { name: "It's on tonight" }));
    await waitFor(() => expect(changeBoardEntry).toHaveBeenCalledWith('thing-pizza', { fields: { onDay: '2026-11-11' } }, DAY));
  });

  it('stops keeping count of a thing, after asking', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^First in the bath/ }));
    await user.press(screen.getByRole('button', { name: 'Stop keeping count of it' }));
    expect(screen.getByRole('header', { name: 'Stop keeping count of “First in the bath”?' })).toBeOnTheScreen();
    expect(removeBoardEntry).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Stop keeping count of it' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('thing-bath'));
  });

  it('adds something new to take turns at: what it is, what its person does, who takes turns', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add something to take turns at' }));
    const save = screen.getByRole('button', { name: 'Start keeping count' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('What you take turns at'), 'The last biscuit');
    await user.type(screen.getByLabelText('What the one whose turn it is does'), 'gets the last biscuit');
    await user.press(screen.getByRole('radio', { name: 'Trophy' }));
    // One person can't take turns: it needs a second, or everyone.
    await user.press(screen.getByRole('checkbox', { name: 'Mia' }));
    expect(save).toBeDisabled();
    expect(screen.getByText('Taking turns needs two people. Choose one more, or everyone.')).toBeOnTheScreen();
    await user.press(screen.getByRole('checkbox', { name: 'Leo' }));
    await user.press(screen.getByRole('switch', { name: "It's on tonight" }));
    await user.press(save);
    await waitFor(() =>
      expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'thing', fields: { name: 'The last biscuit', emoji: '🏆', does: 'gets the last biscuit', people: ['m-mia', 'm-leo'], onDay: '2026-11-11' } }, DAY),
    );
  });

  it('opens the proof: the turns of a month with their dates, and the months before', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Proof, for arguments/ }));
    expect(screen.getByRole('header', { name: 'November 2026' })).toBeOnTheScreen();
    expect(asked).toHaveBeenCalledWith(BOARD_ID, { day: '2026-11-11', show: '2026-11' }, expect.anything());
    expect(screen.getByText('Leo · The front seat')).toBeOnTheScreen();
    expect(screen.getByText(`${formatWeekdayDay('2026-11-11')} · had it on the way to school`)).toBeOnTheScreen();
    expect(screen.getByText(`${formatWeekdayDay('2026-11-06')} · Frozen, again`)).toBeOnTheScreen();
    // This month is as far forward as it goes.
    expect(screen.getByRole('button', { name: 'A month on' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'A month back' }));
    expect(screen.getByRole('header', { name: 'October 2026' })).toBeOnTheScreen();
    expect(asked).toHaveBeenCalledWith(BOARD_ID, { day: '2026-11-11', show: '2026-10' }, expect.anything());
  });

  it('lets someone who is not a grown-up read the list, and change nothing', async () => {
    asked.mockReturnValue(loaded(turnsBoard(turnsView({ canChange: false }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Leo chooses the film')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Done, pass it on' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add something to take turns at' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: /^The front seat/ }));
    expect(screen.getByText('Only the grown-ups can change what happened.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Done, pass it on' })).toBeNull();
  });

  it('says why a turn could not be written down', async () => {
    jest.mocked(addBoardEntry).mockRejectedValue(new ApiError(403, 'grown_ups_only', 'Only the grown-ups can change what happened.'));
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Done, pass it on' }));
    expect(await screen.findByText('Only the grown-ups can change what happened.')).toBeOnTheScreen();
    expect(mockBoardCache.boardSaved).not.toHaveBeenCalled();
  });

  it('says a list with nothing on it is empty, and offers the first thing', async () => {
    asked.mockReturnValue(loaded(turnsBoard(turnsView({ things: [], turns: 0, history: [] }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Nothing to take turns at yet' })).toBeOnTheScreen();
    expect(screen.getByText('Add what gets argued about: who chooses the film, who has the front seat. The list remembers who had the last turn.')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Add something to take turns at' }).length).toBe(2);
  });
});
