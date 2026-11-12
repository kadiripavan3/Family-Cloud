import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, addBoardEntry, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded } from '@/test/samples';
import { cells, chart, chartsBoard, chartsView } from '@/test/samples/perks';

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

describe('16.7 Habit charts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(chartsBoard()));
    jest.mocked(actOnBoard).mockResolvedValue(chartsBoard());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'chart-new', board: chartsBoard() });
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined);
  });

  it("draws a child's chart as a card: whose it is, the API's line, the stars, and the week in cells", async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Habit charts' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Bed made, bag packed. Leo · 5 of 6 so far this week. 21 stars' })).toBeOnTheScreen();
    expect(screen.getByText('Leo · 5 of 6 so far this week')).toBeOnTheScreen();
    expect(screen.getByText('21')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Reading, 20 minutes. Mia · 9 days in a row. 34 stars' })).toBeOnTheScreen();
    expect(screen.getByText('34')).toBeOnTheScreen();
    // A cell for each day of each row: ticked, open for today, or still to come.
    expect(screen.getByRole('checkbox', { name: 'Bed made, Monday' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Bed made, Wednesday' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Bag packed, Wednesday' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Bag packed, Wednesday' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Bed made, Thursday' })).toBeDisabled();
    // A chart with one row is called by its own name in every cell.
    expect(screen.getByRole('checkbox', { name: 'Reading, 20 minutes, Tuesday' })).toBeChecked();
  });

  it("lists the grown-ups' own with one tick for today, and says a missed day is a gap", async () => {
    await render(inApp(<Board />));
    expect(screen.getByText('The grown-ups')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Phones off the table at dinner. Everyone · 4 dinners running' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Phones off the table at dinner, today' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'One evening a week with no screens. You and Alex · Wednesdays' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'One evening a week with no screens, today' })).not.toBeChecked();
    expect(screen.getByText('A missed day is a gap, not a failure')).toBeOnTheScreen();
    expect(screen.getByText('Nothing resets. The chart just carries on.')).toBeOnTheScreen();
  });

  it('ticks a cell for its row and its day, and keeps the charts that come back', async () => {
    const after = chartsBoard(chartsView({ charts: [chart({ stars: 22, doneToday: true })] }));
    jest.mocked(actOnBoard).mockResolvedValue(after);
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Bag packed, Wednesday' }));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalledWith(after));
    expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'tick', body: { chartId: 'chart-leo', row: 1, day: '2026-11-11', done: true } }, DAY);
  });

  it('takes a tick back, for a day gone by too', async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Bed made, Monday' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'tick', body: { chartId: 'chart-leo', row: 0, day: '2026-11-09', done: false } }, DAY));
  });

  it("gives and takes back a grown-up's tick for today", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'One evening a week with no screens, today' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'tick', body: { chartId: 'chart-screens', row: 0, day: '2026-11-11', done: true } }, DAY));
    await user.press(screen.getByRole('checkbox', { name: 'Phones off the table at dinner, today' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'tick', body: { chartId: 'chart-phones', row: 0, day: '2026-11-11', done: false } }, DAY));
  });

  it("leaves a chart's tick alone on a day it isn't on", async () => {
    asked.mockReturnValue(loaded(chartsBoard(chartsView({ charts: [chart({ id: 'chart-screens', title: 'One evening a week with no screens', emoji: '📺', people: [], who: 'Everyone', earnsStars: false, stars: null, days: ['thu'], rows: [{ row: 0, label: null, icon: null, cells: cells([], [3]) }], dueToday: false, line: 'Thursdays' })] }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('checkbox', { name: 'One evening a week with no screens, today' })).toBeDisabled();
  });

  it('opens a chart: its week to tick in, and taking it down', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Phones off the table at dinner\. Everyone/ }));
    expect(screen.getByRole('header', { name: 'Phones off the table at dinner' })).toBeOnTheScreen();
    // A grown-up's row has only today's tick on the page; the sheet has the week.
    await user.press(screen.getByRole('checkbox', { name: 'Phones off the table at dinner, Tuesday' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'tick', body: { chartId: 'chart-phones', row: 0, day: '2026-11-10', done: false } }, DAY));
    expect(screen.getByText('The stars earned on it stay earned.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Take the chart down' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('chart-phones'));
  });

  it('looks at last week, where a tick can still be given for the last seven days', async () => {
    const lastWeek = (done: number[]) => Array.from({ length: 7 }, (_, index) => ({ day: `2026-11-0${2 + index}`, due: true, done: done.includes(index), today: false }));
    const before = chartsBoard(chartsView({ weekStart: '2026-11-02', weekEnd: '2026-11-08', charts: [chart({ rows: [{ row: 0, label: 'Bed made', icon: 'sun', cells: lastWeek([0, 1, 2, 3, 4]) }] })] }));
    asked.mockImplementation((_id: string, params: { show?: string }) => loaded(params.show ? before : chartsBoard()));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Last week' }));
    expect(asked).toHaveBeenCalledWith(BOARD_ID, { day: '2026-11-11', show: '2026-11-02' }, expect.anything());
    expect(screen.getByText('2 to 8 November')).toBeOnTheScreen();
    // Sunday the 8th was three days ago; Monday the 2nd is too long ago for a tick.
    expect(screen.getByRole('checkbox', { name: 'Bed made, Sunday' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Bed made, Monday' })).toBeDisabled();
    await user.press(screen.getByRole('checkbox', { name: 'Bed made, Sunday' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'tick', body: { chartId: 'chart-leo', row: 0, day: '2026-11-08', done: true } }, DAY));
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Back to this week' }));
    expect(screen.queryByText('2 to 8 November')).toBeNull();
  });

  it('adds a chart: its name, who it is for, morning and evening, and on which days', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add a chart' }));
    const save = screen.getByRole('button', { name: 'Start the chart' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('What it is called'), 'Teeth, two minutes');
    await user.press(screen.getByRole('radio', { name: 'Bath' }));
    expect(screen.getByRole('checkbox', { name: 'Everyone' })).toBeChecked();
    await user.press(screen.getByRole('checkbox', { name: 'Mia' }));
    await user.press(screen.getByRole('radio', { name: 'Morning and evening' }));
    await user.press(screen.getByRole('checkbox', { name: 'Saturday' }));
    await user.press(screen.getByRole('checkbox', { name: 'Sunday' }));
    await user.press(save);
    await waitFor(() =>
      expect(addBoardEntry).toHaveBeenCalledWith(
        BOARD_ID,
        { clientId: 'client-1', kind: 'chart', fields: { title: 'Teeth, two minutes', emoji: '🛁', people: ['m-mia'], rows: [{ label: 'Morning', icon: 'sun' }, { label: 'Evening', icon: 'moon' }], days: ['mon', 'tue', 'wed', 'thu', 'fri'] } },
        DAY,
      ),
    );
  });

  it('sends nothing for the days of a chart that is on every day, or for its one row', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add a chart' }));
    await user.type(screen.getByLabelText('What it is called'), 'A walk after dinner');
    await user.press(screen.getByRole('button', { name: 'Start the chart' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'chart', fields: { title: 'A walk after dinner', emoji: '✅', people: [] } }, DAY));
  });

  it('says why a tick could not be given', async () => {
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(400, 'invalid_day', 'A tick is for today or one of the last seven days.'));
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Bag packed, Wednesday' }));
    expect(await screen.findByText('A tick is for today or one of the last seven days.')).toBeOnTheScreen();
  });

  it('says a board without charts is empty, and offers the first', async () => {
    asked.mockReturnValue(loaded(chartsBoard(chartsView({ charts: [] }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'No charts yet' })).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Add a chart' }).length).toBe(2);
  });
});
