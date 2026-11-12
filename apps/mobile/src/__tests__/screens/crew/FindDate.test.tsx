import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { timeAgo } from '@/lib/dates';
import { BOARD_ID, mockBoardRouterState } from '@/test/boards';
import { inApp } from '@/test/phone';
import { crewCircle, loaded } from '@/test/samples';
import { datesBoard, datesView, kaiBrief, noraCrewBrief } from '@/test/samples/crew';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockCrew, useCircles: () => [mockCrew], useCircleIfAny: () => mockCrew }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11', phoneTimeZone: () => 'Europe/Ljubljana' }));
jest.mock('@/lib/share', () => ({ ...jest.requireActual('@/lib/share'), shareText: jest.fn(() => Promise.resolve('copied')) }));

const mockCrew = { ...crewCircle, myMemberId: 'm-crew-1' };
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };

describe('19.3 When can everyone?', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(datesBoard()));
    jest.mocked(actOnBoard).mockResolvedValue(datesBoard());
  });

  it('shows the days with how many can, the best day, who it waits for, and the button that sets it', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Reunion dinner' })).toBeOnTheScreen();
    expect(screen.getByText('Tap the days you can do')).toBeOnTheScreen();
    // Three whole weeks from a Monday: 21 days, each a box to tick.
    expect(screen.getAllByRole('checkbox')).toHaveLength(21);
    expect(screen.getByRole('checkbox', { name: 'Saturday 28 November. 4 people can. The best day so far' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Wednesday 18 November. 1 person can' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Monday 16 November. Nobody yet' })).not.toBeChecked();
    expect(screen.getByText('1 or 2 of you')).toBeOnTheScreen();
    expect(screen.getByText('4 of you')).toBeOnTheScreen();
    expect(screen.getByText('Sat 28 Nov works for all four who answered')).toBeOnTheScreen();
    expect(screen.getByText("Lea, Lena, Ana and you. Kai hasn't tapped anything yet.")).toBeOnTheScreen();
    expect(screen.getByText('Still to answer')).toBeOnTheScreen();
    expect(screen.getByText('Sent on Monday · opened, not answered')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Set it for Sat 28 Nov' })).toBeOnTheScreen();
    expect(screen.getByText('It goes on all five calendars. Kai can still say no.')).toBeOnTheScreen();
    // The bar is full: who sees it is on More.
    expect(screen.queryByRole('button', { name: /^Seen by/ })).toBeNull();
    // Nora has answered: there is nothing to tell the API about having looked.
    expect(actOnBoard).not.toHaveBeenCalled();
  });

  it('says "I can" for a day that is tapped, and takes it back when it is tapped again', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Monday 16 November. Nobody yet' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'tap', body: { day: '2026-11-16', free: true } }, DAY));
    await user.press(screen.getByRole('checkbox', { name: /^Saturday 28 November/ }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'tap', body: { day: '2026-11-28', free: false } }, DAY));
  });

  it("doesn't take a tap on a day that has passed", async () => {
    const days = datesView().days.map((day, index) => (index === 0 ? { ...day, past: true } : day));
    asked.mockReturnValue(loaded(datesBoard(datesView({ days }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('checkbox', { name: 'Monday 16 November. Nobody yet' })).toBeDisabled();
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Monday 16 November. Nobody yet' }));
    expect(actOnBoard).not.toHaveBeenCalled();
  });

  it('nudges whoever has not answered, and says so when the API will not nudge twice in a day', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Nudge Kai' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'nudge', body: { memberId: kaiBrief.memberId } }, DAY));
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(409, 'nudged_already', 'Kai was nudged today already. Give it a day.'));
    await user.press(screen.getByRole('button', { name: 'Nudge Kai' }));
    expect(await screen.findByText('Kai was nudged today already. Give it a day.')).toBeOnTheScreen();
  });

  it('shows when someone was nudged', async () => {
    const nudgedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    asked.mockReturnValue(loaded(datesBoard(datesView({ waitingFor: [{ person: kaiBrief, you: false, opened: false, nudgedAt }] }))));
    await render(inApp(<Board />));
    expect(screen.getByText(`Sent on Monday · not opened yet · nudged ${timeAgo(nudgedAt)}`)).toBeOnTheScreen();
  });

  it("puts the best day on everyone's calendar with one tap", async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Set it for Sat 28 Nov' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'set', body: { day: '2026-11-28', timeZone: 'Europe/Ljubljana' } }, DAY));
  });

  it('says so once it is set, and opens the event it became', async () => {
    asked.mockReturnValue(loaded(datesBoard(datesView({ setFor: '2026-11-28', eventId: '55555555-5555-4555-8555-555555555555' }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Set for Sat 28 Nov')).toBeOnTheScreen();
    expect(screen.getByText("It's set for Sat 28 Nov")).toBeOnTheScreen();
    expect(screen.getByText('It is on all five calendars.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Set it for/ })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Open it in the calendar' }));
    expect(mockBoardRouterState.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'event', id: '55555555-5555-4555-8555-555555555555' } });
  });

  it('tells the API, once, that someone it still waits for has looked', async () => {
    asked.mockReturnValue(loaded(datesBoard(datesView({ answered: 3, youAnswered: false, waitingFor: [{ person: noraCrewBrief, you: true, opened: false, nudgedAt: null }, { person: kaiBrief, you: false, opened: true, nudgedAt: null }] }))));
    const { rerender } = await render(inApp(<Board />));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'opened', body: {} }, DAY));
    await rerender(inApp(<Board />));
    expect(actOnBoard).toHaveBeenCalledTimes(1);
    // Her own row asks her, and has no nudge; the small print names only the others.
    expect(screen.getByText('You')).toBeOnTheScreen();
    expect(screen.getAllByText('Tap the days you can do')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Nudge You' })).toBeNull();
    expect(screen.getByText("Lea, Lena, Ana and you. Kai and you haven't tapped anything yet.")).toBeOnTheScreen();
    expect(screen.getByText('It goes on all five calendars. Kai can still say no.')).toBeOnTheScreen();
  });

  it('has the link for people without the app, and replaces it after asking', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Ask someone without the app' }));
    expect(screen.getByText('homeport.test/when/ejbsa-dzym2-4yg8b-gpd4n')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Share the link' }));
    expect(await screen.findByText('The link is copied.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Make a new link' }));
    expect(screen.getByText('Make a new link? The old one stops working at once. The answers that came in stay.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Yes, make a new link' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'new_link', body: {} }, DAY));
    expect(await screen.findByText('This is the new link. The old one no longer works.')).toBeOnTheScreen();
  });

  it('says why there is no link for someone who may only look, and offers them no button to set the day', async () => {
    asked.mockReturnValue(loaded(datesBoard(datesView({ link: null }), { canEdit: false })));
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Ask someone without the app' }));
    expect(screen.getByText('Only people who can change this board see its link.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Set it for/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nudge Kai' })).toBeNull();
    expect(screen.getByText('Someone who can change this board sets the day.')).toBeOnTheScreen();
  });

  it('shows who answered by link, and takes an answer out', async () => {
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
    asked.mockReturnValue(loaded(datesBoard(datesView({ asked: 6, answered: 5, byLink: [{ id: 'outsider-1', name: 'Marta', days: 3 }] }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Answered by link')).toBeOnTheScreen();
    expect(screen.getByText('Marta')).toBeOnTheScreen();
    expect(screen.getByText('Can do 3 days')).toBeOnTheScreen();
    // Marta has no calendar here: it still goes on the five of the circle.
    expect(screen.getByText('It goes on all five calendars. Kai can still say no.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: "Remove Marta's answer" }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('outsider-1'));
  });

  it('lets someone say that none of the days work, from More, and take that back', async () => {
    const { rerender } = await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'None of these days work for me. The others see that you have answered' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'cant', body: { cant: true } }, DAY));

    asked.mockReturnValue(loaded(datesBoard(datesView({ youCant: true }))));
    await rerender(inApp(<Board />));
    expect(screen.getByText('You said none of these days work for you. Tap a day if that changes.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'I can do some of these days after all' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'cant', body: { cant: false } }, DAY));
  });

  it('says so while nobody has tapped a day', async () => {
    const days = datesView().days.map((day) => ({ ...day, free: 0, you: false, best: false, who: [] }));
    asked.mockReturnValue(loaded(datesBoard(datesView({ days, answered: 0, best: null, youAnswered: false, waitingFor: [] }))));
    await render(inApp(<Board />));
    expect(screen.getByText('No day yet')).toBeOnTheScreen();
    expect(screen.getByText('Tap the days you can do. The darker a day, the more of you can make it.')).toBeOnTheScreen();
    expect(screen.queryByText(/of you$/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Set it for/ })).toBeNull();
    expect(screen.getByText("When a day works, one tap puts it on everyone's calendar.")).toBeOnTheScreen();
  });
});
