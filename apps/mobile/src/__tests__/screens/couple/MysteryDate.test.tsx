import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, addBoardEntry, changeBoardEntry, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { coupleCircle, loaded } from '@/test/samples';
import { alex2, comingDate, dateBoard, dateForOther, dateView } from '@/test/samples/couple';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockCircle, useCircles: () => [mockCircle], useCircleIfAny: () => mockCircle }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-12' }));

const mockCircle = coupleCircle;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-12' };

describe('17.6 Mystery date, for whoever plans it', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(dateBoard()));
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'new', board: dateBoard() });
    jest.mocked(changeBoardEntry).mockResolvedValue(dateBoard());
  });

  it('says what the other one can see, and shows the plan, the clues and the dates there have been', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Date night' })).toBeOnTheScreen();
    expect(screen.getByText('Fri 13 Nov · your turn to plan')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'All Alex can see: “20:00. Wear something warm.”' })).toBeOnTheScreen();
    expect(screen.getByText('The rest is hidden from Alex until the date begins.')).toBeOnTheScreen();
    expect(screen.getByText('Your plan')).toBeOnTheScreen();
    // The first line says who the plan is hidden from; a line that is sorted has its tick.
    expect(screen.getByRole('button', { name: 'Night sledging on Krvavec. Two tickets booked. Not Alex' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ines has the children until 23:30. Her guest pass is ready. Sorted' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Bring the thick gloves.. Opens Fri 13 Nov, 15:00' })).toBeOnTheScreen();
    expect(screen.getByText('Turns · 9 dates this year')).toBeOnTheScreen();
    expect(screen.getByLabelText('A cooking class. Alex planned · October')).toBeOnTheScreen();
    expect(screen.getByLabelText('Open-air cinema. You planned · September')).toBeOnTheScreen();
  });

  it('changes the hint: the day, the time and what it is stay as they are', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Change the hint' }));
    expect(screen.getByLabelText('What it is')).toHaveDisplayValue('Night sledging on Krvavec');
    await user.clear(screen.getByLabelText('The hint'));
    await user.type(screen.getByLabelText('The hint'), 'Bring a hat.');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalled());
    const [entryId, sent] = jest.mocked(changeBoardEntry).mock.calls[0]! as unknown as [string, { fields: Record<string, unknown> }];
    expect(entryId).toBe('date-friday');
    expect(sent.fields).toMatchObject({ day: '2026-11-13', time: '20:00', hint: 'Bring a hat.', title: 'Night sledging on Krvavec' });
    // The moment it starts is 20:00 on this phone's clock.
    expect(new Date(String(sent.fields.at)).getTime()).toBe(new Date(2026, 10, 13, 20, 0).getTime());
  });

  it('shakes the jar, and makes what it gave the plan', async () => {
    const shaken = dateBoard(dateView({ next: comingDate({ suggestion: 'A night walk with a thermos' }) }));
    jest.mocked(actOnBoard).mockImplementation(async () => {
      asked.mockReturnValue(loaded(shaken));
      return shaken;
    });
    const view = await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Shake the jar' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'shake', body: {} }, DAY));
    await view.rerender(inApp(<Board />));
    expect(await screen.findByText('A night walk with a thermos')).toBeOnTheScreen();
    expect(screen.getByText('One of the 12 ideas in the jar.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Make it the plan' }));
    await waitFor(() => expect(changeBoardEntry).toHaveBeenCalledWith('date-friday', { fields: { title: 'A night walk with a thermos' } }, DAY));
    expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'line', fields: { dateId: 'date-friday', title: 'A night walk with a thermos', icon: 'pin' } }, DAY);
  });

  it("says in the API's words that the jar is empty", async () => {
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(409, 'jar_empty', 'The jar is empty. Put an idea in first.'));
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Shake the jar' }));
    expect(await screen.findByText('The jar is empty. Put an idea in first.')).toBeOnTheScreen();
  });

  it('adds a line to the plan, a clue, or an idea for the jar', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add to the date' }));
    expect(screen.getByRole('radio', { name: 'The plan' })).toBeChecked();
    await user.type(screen.getByLabelText('What it is'), 'A flask of tea');
    await user.press(screen.getByRole('radio', { name: 'Money' }));
    await user.press(screen.getByRole('button', { name: 'Add it to the plan' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenLastCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'line', fields: { dateId: 'date-friday', title: 'A flask of tea', note: undefined, icon: 'euro' } }, DAY));

    await user.press(screen.getByRole('button', { name: 'Add to the date' }));
    await user.press(screen.getByRole('radio', { name: 'A clue' }));
    await user.type(screen.getByLabelText('The clue'), 'It is uphill.');
    await user.press(screen.getByRole('button', { name: 'Add the clue' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenLastCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'clue', fields: { dateId: 'date-friday', text: 'It is uphill.', opensAt: undefined } }, DAY));

    await user.press(screen.getByRole('button', { name: 'Add to the date' }));
    await user.press(screen.getByRole('radio', { name: 'The jar' }));
    await user.type(screen.getByLabelText('An idea for a date'), 'Stargazing');
    await user.press(screen.getByRole('button', { name: 'Put it in the jar' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenLastCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'idea', fields: { text: 'Stargazing' } }, DAY));
  });

  it('marks a line of the plan as sorted, and takes one off', async () => {
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Night sledging on Krvavec/ }));
    await user.press(screen.getByRole('switch', { name: 'Sorted' }));
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeBoardEntry).toHaveBeenCalledWith('line-sledging', { fields: { title: 'Night sledging on Krvavec', note: 'Two tickets booked', icon: 'pin', ready: true } }, DAY));
    await user.press(screen.getByRole('button', { name: /^€46, from the fun pot/ }));
    await user.press(screen.getByRole('button', { name: 'Take it off the plan' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('line-money'));
  });

  it('reveals the whole date from More, after asking', async () => {
    jest.mocked(actOnBoard).mockResolvedValue(dateBoard());
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: /^Reveal it now/ }));
    expect(screen.getByText("Alex sees what it is and the whole plan at once. It can't be hidden again.")).toBeOnTheScreen();
    expect(actOnBoard).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Yes, reveal it' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'reveal', body: { entryId: 'date-friday' } }, DAY));
  });
});

describe('17.6 Mystery date, for the other one', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(dateBoard(dateForOther, { mine: false })));
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'new', board: dateBoard(dateForOther) });
  });

  it('gets the time and the hint and not a word of the plan: the API sends none of it', async () => {
    await render(inApp(<Board />));
    expect(screen.getByText('Fri 13 Nov · Nora is planning')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: '“20:00. Wear something warm.”' })).toBeOnTheScreen();
    expect(screen.getByText("That is all you get until you're there.")).toBeOnTheScreen();
    expect(screen.queryByText('Your plan')).toBeNull();
    expect(screen.queryByText(/sledging/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change the hint' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Shake the jar' })).toBeNull();
    // A clue that hasn't opened is only counted.
    expect(screen.getByText('One more clue to come')).toBeOnTheScreen();
    expect(screen.queryByText('Bring the thick gloves.')).toBeNull();
    expect(screen.getByLabelText('A cooking class. You planned · October')).toBeOnTheScreen();
  });

  it('reads a clue once its moment has come', async () => {
    const withClue = dateView({ ...dateForOther, next: comingDate({ yours: false, title: null, plan: [], clues: [{ id: 'clue-gloves', text: 'Bring the thick gloves.', opensAt: '2026-11-13T15:00:00', open: true }], cluesToCome: 0 }) });
    asked.mockReturnValue(loaded(dateBoard(withClue, { mine: false })));
    await render(inApp(<Board />));
    expect(screen.getByText('Clues')).toBeOnTheScreen();
    expect(screen.getByText('Bring the thick gloves.')).toBeOnTheScreen();
    expect(screen.queryByText(/more clues? to come/)).toBeNull();
  });

  it('can put an idea in the jar, and nothing on the plan', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add an idea to the jar' }));
    expect(screen.queryByRole('radio', { name: 'The plan' })).toBeNull();
    await user.type(screen.getByLabelText('An idea for a date'), 'The sauna boat');
    await user.press(screen.getByRole('button', { name: 'Put it in the jar' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'idea', fields: { text: 'The sauna boat' } }, DAY));
  });

  it('sees the plan once the date is revealed', async () => {
    const revealed = dateView({ ...dateForOther, next: comingDate({ yours: false, revealed: true }) });
    asked.mockReturnValue(loaded(dateBoard(revealed, { mine: false })));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Night sledging on Krvavec' })).toBeOnTheScreen();
    expect(screen.getByText('It is out: the whole plan shows for everyone now.')).toBeOnTheScreen();
    expect(screen.getByText('The plan')).toBeOnTheScreen();
    expect(screen.getByText('Two tickets booked')).toBeOnTheScreen();
  });
});

describe('17.6 Mystery date, with nothing planned', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'date-new', board: dateBoard() });
  });

  it('says whose turn it is, and plans a date with its day, time and hint', async () => {
    asked.mockReturnValue(loaded(dateBoard(dateView({ next: null, turn: alex2, yourTurn: false, thisYear: 0, past: [] }))));
    await render(inApp(<Board />));
    expect(screen.getByText("Alex's turn to plan")).toBeOnTheScreen();
    expect(screen.getByText('No dates yet. The first one is the hardest to plan.')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getAllByRole('button', { name: 'Plan a date' })[0]!);
    await user.type(screen.getByLabelText('The time'), '8pm');
    await user.type(screen.getByLabelText('The hint'), 'Wear boots.');
    await user.press(screen.getByRole('button', { name: 'Start planning' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalled());
    const sent = jest.mocked(addBoardEntry).mock.calls[0]![1] as unknown as { kind: string; fields: Record<string, unknown> };
    expect(sent.kind).toBe('date');
    expect(sent.fields).toMatchObject({ day: '2026-11-19', time: '20:00', hint: 'Wear boots.', title: '' });
  });

  it('refuses a time that is not one before anything is sent', async () => {
    asked.mockReturnValue(loaded(dateBoard(dateView({ next: null, yourTurn: true }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Your turn to plan')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getAllByRole('button', { name: 'Plan a date' })[0]!);
    await user.type(screen.getByLabelText('The time'), 'late');
    expect(screen.getByText('Write the time like 20:00.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Start planning' })).toBeDisabled();
  });
});
