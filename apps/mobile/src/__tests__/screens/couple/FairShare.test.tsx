import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, addBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { coupleCircle, loaded, onlyMe } from '@/test/samples';
import { alex2, fairShareBoard, fairShareView, nora2 } from '@/test/samples/couple';

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
const offer = { id: 'offer-1', by: nora2, yours: true, at: '2026-11-11T09:00:00Z', line: 'Alex takes the school things; you take the car.', accepted: null };

describe('17.8 The fair share', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(fairShareBoard()));
    jest.mocked(actOnBoard).mockResolvedValue(fairShareBoard());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'job-new', board: fairShareBoard() });
  });

  it("shows the month as one bar, each side's jobs with their hours, and the one swap that would bring it close", async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Fair share' })).toBeOnTheScreen();
    expect(screen.getByText('October')).toBeOnTheScreen();
    expect(screen.getByLabelText('You 58 percent, Alex 42 percent')).toBeOnTheScreen();
    expect(screen.getByText('You · 31 hours')).toBeOnTheScreen();
    expect(screen.getByText('Alex · 22 hours')).toBeOnTheScreen();
    expect(screen.getByText('School things')).toBeOnTheScreen();
    expect(screen.getByText('11 h')).toBeOnTheScreen();
    expect(screen.getByText('Bedtimes')).toBeOnTheScreen();
    expect(screen.getByText('One swap would bring it close')).toBeOnTheScreen();
    expect(screen.getByText('Alex takes the school things; you take the car.')).toBeOnTheScreen();
    expect(screen.getByText('Hours are your own guesses for each job. Only the two of you ever see this.')).toBeOnTheScreen();
  });

  it('suggests the swap for the month shown', async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Suggest' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'suggest', body: { month: '2026-10' } }, DAY));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalled());
  });

  it('says a swap this person suggested waits for the other one', async () => {
    asked.mockReturnValue(loaded(fairShareBoard(fairShareView({ offered: offer }))));
    await render(inApp(<Board />));
    expect(screen.getByText('You suggested it. It waits for Alex.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Suggest' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yes to the swap' })).toBeNull();
  });

  it('lets the one it was suggested to say yes or no', async () => {
    asked.mockReturnValue(loaded(fairShareBoard(fairShareView({ offered: { ...offer, by: alex2, yours: false, line: 'You take the school things; Alex takes the car.' } }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Alex suggests a swap')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Yes to the swap' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'answer', body: { entryId: 'offer-1', yes: true } }, DAY));
    await user.press(screen.getByRole('button', { name: 'No to the swap' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'answer', body: { entryId: 'offer-1', yes: false } }, DAY));
  });

  it.each([
    [{ offered: { ...offer, accepted: true } }, 'The swap is agreed'],
    [{ offered: { ...offer, accepted: false } }, 'Alex said no to the swap'],
    [{ offered: { ...offer, yours: false, accepted: false } }, 'You said no to the swap'],
    [{ swap: null, close: true }, "It's close"],
    [{ swap: null, close: false }, 'No single swap would bring it close'],
  ])('says where the swap stands', async (over, title) => {
    asked.mockReturnValue(loaded(fairShareBoard(fairShareView(over))));
    await render(inApp(<Board />));
    expect(screen.getByText(title)).toBeOnTheScreen();
  });

  it('ticks a job as mine, guesses its hours up and down, and takes one off my side', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    // The column of the person looking opens the list of jobs; so does More.
    await user.press(screen.getByRole('button', { name: 'You. 31 hours. Change what you ticked' }));
    expect(screen.getByText('Your jobs in October')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Meals was mine' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'The car was mine' })).not.toBeChecked();
    await user.press(screen.getByRole('checkbox', { name: 'The car was mine' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'tick', body: { jobId: 'job-car', month: '2026-10', mine: true } }, DAY));
    await user.press(screen.getByRole('button', { name: 'One hour more for Meals' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'tick', body: { jobId: 'job-meals', month: '2026-10', hours: 12 } }, DAY));
    await user.press(screen.getByRole('button', { name: 'One hour less for School things' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'tick', body: { jobId: 'job-school', month: '2026-10', hours: 6 } }, DAY));
    await user.press(screen.getByRole('checkbox', { name: 'Meals was mine' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'tick', body: { jobId: 'job-meals', month: '2026-10', mine: false } }, DAY));
  });

  it('adds a job to the list', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: /^Tick my jobs/ }));
    await user.type(screen.getByLabelText('Another job'), 'Notices the milk');
    await user.press(screen.getByRole('button', { name: 'Add the job' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'job', fields: { name: 'Notices the milk' } }, DAY));
  });

  it('shows another month from More', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Show November' }));
    expect(asked).toHaveBeenLastCalledWith(BOARD_ID, { day: '2026-11-12', show: '2026-11' }, expect.anything());
  });

  it("says in the API's words why a tick was not taken", async () => {
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(409, 'too_late', 'Hours can be ticked for this month or the one before.'));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^You\. 31 hours/ }));
    await user.press(screen.getByRole('checkbox', { name: 'The car was mine' }));
    expect((await screen.findAllByText('Hours can be ticked for this month or the one before.')).length).toBeGreaterThan(0);
  });

  it('says so while nothing is ticked, and offers no ticking for a month that is closed or to someone it is not about', async () => {
    const empty = fairShareView({ totalHours: 0, people: fairShareView().people.map((person) => ({ ...person, hours: 0, percent: 0, jobs: [] })), swap: null, close: true });
    asked.mockReturnValue(loaded(fairShareBoard(empty)));
    const view = await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Nothing ticked for October yet' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tick my jobs' })).toBeOnTheScreen();
    asked.mockReturnValue(loaded(fairShareBoard(fairShareView({ canTick: false }), { chip: onlyMe })));
    await view.rerender(inApp(<Board />));
    expect(screen.queryByRole('button', { name: 'Suggest' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Change what you ticked$/ })).toBeNull();
    expect(screen.getByText('Hours are your own guesses for each job. Only the people it is shared with ever see this.')).toBeOnTheScreen();
  });
});
