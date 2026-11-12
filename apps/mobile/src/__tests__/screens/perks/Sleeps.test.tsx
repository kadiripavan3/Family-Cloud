import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, addBoardEntry, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { formatWeekdayDay } from '@/lib/dates';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded } from '@/test/samples';
import { count, sleepsBoard, sleepsView } from '@/test/samples/perks';

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

describe('16.5 Sleeps until…', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(sleepsBoard()));
    jest.mocked(actOnBoard).mockResolvedValue(sleepsBoard());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'count-new', board: sleepsBoard() });
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined);
  });

  it('counts the nearest day in sleeps, with its chain and whose link is tonight', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Sleeps until…' })).toBeOnTheScreen();
    expect(screen.getByText('12')).toBeOnTheScreen();
    expect(screen.getByText('sleeps until Grandma Astrid comes')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: `12 sleeps until Grandma Astrid comes. ${formatWeekdayDay('2026-11-23')}` })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Tear off tonight's link" })).toBeEnabled();
    // Two of the fourteen links are gone, so tonight's is the third: the yellow one of the drawing.
    expect(screen.getByText("Leo tears one off at bedtime. Tonight's is the yellow one.")).toBeOnTheScreen();
  });

  it('lists the other days that are counted down to, nearest first', async () => {
    await render(inApp(<Board />));
    expect(screen.getByText('Also counting')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: `Mia's birthday. 23 sleeps. ${formatWeekdayDay('2026-12-04')}` })).toBeOnTheScreen();
    expect(screen.getByText(formatWeekdayDay('2026-12-25'))).toBeOnTheScreen();
    expect(screen.getByText('44')).toBeOnTheScreen();
    expect(screen.getByText(`${formatWeekdayDay('2027-04-03')} · from the trip`)).toBeOnTheScreen();
    expect(screen.getByText('143')).toBeOnTheScreen();
  });

  it("tears tonight's link off, and can put it back", async () => {
    const torn = sleepsBoard(sleepsView({ first: count({ off: 3, tornTonight: true, canTear: false }) }));
    jest.mocked(actOnBoard).mockResolvedValue(torn);
    asked.mockReturnValue(loaded(sleepsBoard()));
    const { rerender } = await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "Tear off tonight's link" }));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalledWith(torn));
    expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'tear', body: { entryId: 'count-astrid', torn: true } }, DAY);

    asked.mockReturnValue(loaded(torn));
    await rerender(inApp(<Board />));
    expect(screen.getByText("Tonight's link is off. Sleep well.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Tear off tonight's link" })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: "Put tonight's link back" }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'tear', body: { entryId: 'count-astrid', torn: false } }, DAY));
  });

  it('says one link comes off when nobody in particular tears them', async () => {
    asked.mockReturnValue(loaded(sleepsBoard(sleepsView({ first: count({ tearer: null, off: 3 }) }))));
    await render(inApp(<Board />));
    expect(screen.getByText("One link comes off at bedtime. Tonight's is the blue one.")).toBeOnTheScreen();
  });

  it('says the day has come when there are no sleeps left', async () => {
    asked.mockReturnValue(loaded(sleepsBoard(sleepsView({ first: count({ sleeps: 0, links: 14, off: 14, canTear: false }), others: [] }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Today: Grandma Astrid comes')).toBeOnTheScreen();
    expect(screen.getByText('No links left. The day has come.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Tear off tonight's link" })).toBeDisabled();
  });

  it('says the Home Screen widget needs the phone app', async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'On the Home Screen too. A widget with the chain, and a link to tear off.' }));
    expect(screen.getByText("The widget comes with the phone app's Home Screen widgets, which aren't in this build yet. Until then the chain is here, and one tap tears tonight's link off.")).toBeOnTheScreen();
  });

  it('starts a new countdown: what it is, the day, and who tears the links off', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Count down to something' }));
    const save = screen.getByRole('button', { name: 'Start the chain' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Sleeps until…'), 'the school play');
    expect(save).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'The day: Choose a day. Change' }));
    await user.press(screen.getByRole('button', { name: '20 November 2026' }));
    expect(screen.getByRole('button', { name: `The day: ${formatWeekdayDay('2026-11-20')}. Change` })).toBeOnTheScreen();
    await user.press(screen.getByRole('radio', { name: 'Party' }));
    await user.press(screen.getByRole('checkbox', { name: 'It comes round every year' }));
    await user.press(screen.getByRole('button', { name: 'Mia' }));
    await user.press(save);
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'count', fields: { title: 'the school play', day: '2026-11-20', emoji: '🎉', yearly: true, tearerMemberId: 'm-mia' } }, DAY));
  });

  it('opens a countdown, and stops counting down to it', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Mia's birthday/ }));
    expect(screen.getByRole('header', { name: "23 sleeps until Mia's birthday" })).toBeOnTheScreen();
    expect(screen.getByText(`${formatWeekdayDay('2026-12-04')} · every year`)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Stop counting down to it' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('count-birthday'));
  });

  it('lets someone who may only look tear a link, and add or remove nothing', async () => {
    asked.mockReturnValue(loaded(sleepsBoard(sleepsView(), { mine: false, canEdit: false })));
    await render(inApp(<Board />));
    expect(screen.getByRole('button', { name: "Tear off tonight's link" })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Count down to something' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: /^Christmas morning/ }));
    expect(screen.queryByRole('button', { name: 'Stop counting down to it' })).toBeNull();
  });

  it('keeps the days that have been under their own line', async () => {
    asked.mockReturnValue(loaded(sleepsBoard(sleepsView({ passed: [count({ id: 'count-fair', title: 'The school fair', emoji: null, day: '2026-11-07', sleeps: 0, links: 0, off: 0, canTear: false, tearer: null })] }))));
    await render(inApp(<Board />));
    expect(screen.getByText('The day has been')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: `The school fair. ${formatWeekdayDay('2026-11-07')}` })).toBeOnTheScreen();
  });

  it('says why a link could not be torn off', async () => {
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(409, 'no_links_left', 'There are no links left. The day has come.'));
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: "Tear off tonight's link" }));
    expect(await screen.findByText('There are no links left. The day has come.')).toBeOnTheScreen();
  });

  it('says an empty board is empty, and offers the first countdown', async () => {
    asked.mockReturnValue(loaded(sleepsBoard(sleepsView({ first: null, others: [] }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Nothing to count down to yet' })).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Count down to something' }).length).toBe(2);
  });
});
