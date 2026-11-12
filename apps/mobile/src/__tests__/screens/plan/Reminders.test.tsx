import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ApiError } from '@/api/fetcher';
import { nudgeReminder, tickReminder, useGetDoneRemindersInfinite, useGetReminders } from '@/api/generated/homeport';
import Reminders from '@/app/(app)/plan/reminders';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { carService, doneTick, feedBiscuit, ids, onSampleToday, reminder, remindersAnswer } from '@/test/samples/plan';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { reminderSaved: jest.fn(() => Promise.resolve()), reminderNudged: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
// The real list draws only the rows a phone's screen has room for; in a test every row is drawn.
jest.mock('@/ui/List', () => ({
  List: ({ data, row, empty }: { data: unknown[]; row: (item: unknown, index: number) => ReactElement; empty?: ReactElement }) => {
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');
    return <View>{data.length === 0 ? empty : data.map((item, index) => <View key={index}>{row(item, index)}</View>)}</View>;
  },
}));
jest.mock('@/api/generated/homeport', () => ({ useGetReminders: jest.fn(), useGetDoneRemindersInfinite: jest.fn(), tickReminder: jest.fn(), nudgeReminder: jest.fn() }));

const mockLinds = linds;
const asked = jest.mocked(useGetReminders) as unknown as jest.Mock;
const done = jest.mocked(useGetDoneRemindersInfinite) as unknown as jest.Mock;
/** What the hook that loads page after page gives: the pages so far, and whether there are more. */
const pages = (items: unknown[], more = false) => ({ ...loaded({ pages: [{ items, nextCursor: more ? 'next' : null }], pageParams: [undefined] }), hasNextPage: more, isFetchingNextPage: false, fetchNextPage: jest.fn() });

describe('7.5 Reminders', () => {
  beforeAll(onSampleToday);
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(remindersAnswer()));
    done.mockReturnValue(pages([doneTick()]));
  });

  it('shows yours by day, what you asked of someone, and the ones that wait for a place', async () => {
    await render(inApp(<Reminders />));
    expect(asked).toHaveBeenCalledWith('c-linds', { day: '2026-11-11' });
    expect(screen.getByRole('header', { name: 'Reminders' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Yours, 3', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'You asked, 2' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Done' })).toBeOnTheScreen();
    // Yours, by day.
    expect(screen.getByText('Today')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Take the bins out, Wed 11 Nov', checked: false })).toBeOnTheScreen();
    expect(screen.getByText('19:00 · Tue and Fri · takes turns')).toBeOnTheScreen();
    expect(screen.getByText('Fri 13 Nov')).toBeOnTheScreen();
    expect(screen.getByText('Form attached · due Friday')).toBeOnTheScreen();
    // What you asked of someone: not done with a Nudge, done with a mark.
    expect(screen.getByText('You asked someone')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Nudge Alex about Book the car service' })).toBeOnTheScreen();
    expect(screen.getByText('Done at 7:40 · 1 star')).toBeOnTheScreen();
    expect(screen.getByLabelText('Done')).toBeOnTheScreen();
    // The ones that wait for a place, and what a browser can't do about them.
    expect(screen.getByText('When someone is there')).toBeOnTheScreen();
    expect(screen.getByText("When you're near the post office")).toBeOnTheScreen();
    expect(screen.getByText(/^Your phone watches for these places/)).toBeOnTheScreen();
  });

  it('ticks one of yours, and the API\'s answer goes to every list', async () => {
    const next = reminder({ dueOn: '2026-11-13', turn: null, yours: false, done: true, tickedDueOn: '2026-11-11' });
    jest.mocked(tickReminder).mockResolvedValue(next);
    await render(inApp(<Reminders />));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Take the bins out, Wed 11 Nov' }));
    expect(tickReminder).toHaveBeenCalledWith(ids.bins, { done: true, dueOn: '2026-11-11', day: '2026-11-11' });
    await waitFor(() => expect(mockCache.reminderSaved).toHaveBeenCalledWith(next));
  });

  it('opens a reminder from its row, and a new one from the +', async () => {
    await render(inApp(<Reminders />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Book the car service. Asked on Monday · not done yet' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'reminder', id: ids.carService } });
    await user.press(screen.getByRole('button', { name: 'New reminder' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/new/reminder');
  });

  it('nudges whoever has it, and says so', async () => {
    jest.mocked(nudgeReminder).mockResolvedValue(undefined);
    await render(inApp(<Reminders />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Nudge Alex about Book the car service' }));
    expect(nudgeReminder).toHaveBeenCalledWith(ids.carService);
    expect(await screen.findByText('A gentle nudge is on its way to Alex.')).toBeOnTheScreen();
    expect(mockCache.reminderNudged).toHaveBeenCalledWith(carService);
  });

  it('says what the API said when a nudge was too soon', async () => {
    jest.mocked(nudgeReminder).mockRejectedValue(new ApiError(409, 'nudged_already', 'You nudged a moment ago. Give it an hour.'));
    await render(inApp(<Reminders />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Nudge Alex about Book the car service' }));
    expect(await screen.findByText('You nudged a moment ago. Give it an hour.')).toBeOnTheScreen();
  });

  it('shows only what you asked of others under "You asked"', async () => {
    await render(inApp(<Reminders />));
    await userEvent.setup().press(screen.getByRole('tab', { name: 'You asked, 2' }));
    expect(screen.getByText('Book the car service')).toBeOnTheScreen();
    expect(screen.getByText('Feed Biscuit')).toBeOnTheScreen();
    expect(screen.queryByText('Take the bins out')).toBeNull();
    expect(screen.queryByText('When someone is there')).toBeNull();
  });

  it('lists what was ticked under "Done", and takes a tick away again', async () => {
    jest.mocked(tickReminder).mockResolvedValue(feedBiscuit);
    await render(inApp(<Reminders />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('tab', { name: 'Done' }));
    expect(done).toHaveBeenCalledWith('c-linds', undefined, expect.anything());
    expect(screen.getByText('11 Nov at 7:40 · by Nora for Leo · 1 star')).toBeOnTheScreen();
    await user.press(screen.getByRole('checkbox', { name: 'Feed Biscuit, done. Take the tick off' }));
    expect(tickReminder).toHaveBeenCalledWith(ids.feedBiscuit, { done: false, dueOn: '2026-11-11', day: '2026-11-11' });
  });

  it('says what will appear under each tab while there is nothing', async () => {
    asked.mockReturnValue(loaded(remindersAnswer({ yoursCount: 0, askedCount: 0, yours: [], asked: [], places: [] })));
    done.mockReturnValue(pages([]));
    await render(inApp(<Reminders />));
    const user = userEvent.setup();
    expect(screen.getByRole('header', { name: 'Nothing to do' })).toBeOnTheScreen();
    await user.press(screen.getByRole('tab', { name: 'You asked' }));
    expect(screen.getByRole('header', { name: 'Nothing asked' })).toBeOnTheScreen();
    await user.press(screen.getByRole('tab', { name: 'Done' }));
    expect(screen.getByRole('header', { name: 'Nothing ticked yet' })).toBeOnTheScreen();
  });

  it('keeps its bar while it loads, says when the phone is offline, and what went wrong', async () => {
    asked.mockReturnValue(pending());
    const view = await render(inApp(<Reminders />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue({ ...pending(), isPaused: true });
    await view.rerender(inApp(<Reminders />));
    expect(screen.getByText("You're offline")).toBeOnTheScreen();
    const again = failed(new ApiError(500, 'server', 'Something went wrong on our side. Try again.'));
    asked.mockReturnValue(again);
    await view.rerender(inApp(<Reminders />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(again.refetch).toHaveBeenCalled();
  });
});
