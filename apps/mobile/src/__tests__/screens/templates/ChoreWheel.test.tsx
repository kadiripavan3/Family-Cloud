import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { actOnBoard, addBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { formatDay } from '@/lib/dates';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded } from '@/test/samples';
import { wheelBoard, wheelView } from '@/test/samples/templates';

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

describe('5.8 The chore wheel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(wheelBoard()));
    jest.mocked(actOnBoard).mockResolvedValue(wheelBoard());
  });

  it("shows the wheel's week, whose job is whose and where each stands, and what stars turn into", async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Chore wheel' })).toBeOnTheScreen();
    expect(screen.getByText('Turns every Monday')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Week 46. Turn the wheel to next week' })).toBeOnTheScreen();
    expect(screen.getByText('46')).toBeOnTheScreen();
    expect(screen.getByText('Nora · Tuesday and Friday evening')).toBeOnTheScreen();
    expect(screen.getByText('Alex · all 2 done')).toBeOnTheScreen();
    expect(screen.getByText('Mia · 5 of 7 days')).toBeOnTheScreen();
    expect(screen.getByText('Leo · done this morning')).toBeOnTheScreen();
    // A grown-up's job has a tick; a child's shows their stars.
    expect(screen.getByRole('checkbox', { name: 'Bins and recycling. Nora · Tuesday and Friday evening' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Laundry. Alex · all 2 done' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Set the table. Mia · 5 of 7 days. 34 stars' })).toBeOnTheScreen();
    expect(screen.getByText('21')).toBeOnTheScreen();
    expect(screen.getByText('Stars turn into pocket money')).toBeOnTheScreen();
    expect(screen.getByText("10 stars pay €2 into “Mia's skates fund”.")).toBeOnTheScreen();
  });

  it('ticks a job for today, and the board that comes back is kept', async () => {
    const after = wheelBoard(wheelView({ done: 2 }));
    jest.mocked(actOnBoard).mockResolvedValue(after);
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: /^Bins and recycling/ }));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalledWith(after));
    expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'tick', body: { jobId: 'job-bins', done: true, day: '2026-11-11' } }, DAY);
  });

  it("takes today's tick back, and the last tick of a job that is done for the week", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: /^Feed Biscuit/ }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'tick', body: { jobId: 'job-biscuit', done: false } }, DAY));
    await user.press(screen.getByRole('checkbox', { name: /^Laundry/ }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'tick', body: { jobId: 'job-laundry', done: false, day: '2026-11-10' } }, DAY));
  });

  it('turns to next week: who gets what, and nothing to tick yet', async () => {
    const next = wheelBoard(wheelView({ week: 47, weekStart: '2026-11-16', weekEnd: '2026-11-22', jobs: wheelView().jobs.map((job) => ({ ...job, who: job.next, doneThisWeek: 0, doneOn: [], doneToday: false, complete: false, lastDoneAt: null })) }));
    asked.mockImplementation((_id: string, params: { show?: string }) => loaded(params.show ? next : wheelBoard()));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Week 46. Turn the wheel to next week' }));
    expect(asked).toHaveBeenCalledWith(BOARD_ID, { day: '2026-11-11', show: '2026-11-16' }, expect.anything());
    expect(screen.getByText(`Next week, from ${formatDay('2026-11-16')}`)).toBeOnTheScreen();
    expect(screen.getByText('Alex · Tuesday and Friday evening')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: /^Bins and recycling/ })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Week 47, next week. Turn the wheel back' }));
    expect(screen.getByText('Turns every Monday')).toBeOnTheScreen();
  });

  it('adds a job from More', async () => {
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'job-new', board: wheelBoard() });
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Add a job' }));
    expect(screen.getByRole('button', { name: 'Put it on the wheel' })).toBeDisabled();
    await user.type(screen.getByLabelText('The job'), 'Water the plants');
    await user.type(screen.getByLabelText('When it is done'), 'Sunday');
    await user.clear(screen.getByLabelText('Times a week'));
    await user.type(screen.getByLabelText('Times a week'), '3');
    await user.press(screen.getByRole('button', { name: 'Put it on the wheel' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'job', fields: { name: 'Water the plants', when: 'Sunday', timesAWeek: 3 } }, DAY));
  });

  it('says a wheel without jobs is empty, and offers the first one', async () => {
    asked.mockReturnValue(loaded(wheelBoard(wheelView({ jobs: [], done: 0 }))));
    await render(inApp(<Board />));
    expect(screen.getByText('No jobs on the wheel yet')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add a job' }));
    expect(screen.getByLabelText('The job')).toBeOnTheScreen();
  });

  it('lets someone who may only look see it all and tick nothing', async () => {
    asked.mockReturnValue(loaded(wheelBoard(wheelView({ stars: null }), { canEdit: false, mine: false })));
    await render(inApp(<Board />));
    expect(screen.getByRole('checkbox', { name: /^Bins and recycling/ })).toBeDisabled();
    expect(screen.queryByText('Stars turn into pocket money')).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: 'Add a job' })).toBeNull();
  });
});
