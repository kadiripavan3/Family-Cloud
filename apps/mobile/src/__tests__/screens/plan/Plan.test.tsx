import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { tickReminder, useGetPlan } from '@/api/generated/homeport';
import { PlanHome } from '@/features/plan/PlanHome';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { bins, ids, onSampleToday, planAnswer, planEntry, reminder } from '@/test/samples/plan';

const mockRouter = { push: jest.fn() };
const mockCache = { reminderSaved: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/api/generated/homeport', () => ({ useGetPlan: jest.fn(), tickReminder: jest.fn() }));

const mockLinds = linds;
const asked = jest.mocked(useGetPlan) as unknown as jest.Mock;

describe('7.1 Plan: one list for the day', () => {
  beforeAll(onSampleToday);
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(planAnswer()));
  });

  it('shows the week with today filled, and each day from today on with its lines', async () => {
    await render(inApp(<PlanHome />));
    expect(asked).toHaveBeenCalledWith('c-linds', { day: '2026-11-11', days: 7 }, expect.anything());
    // The strip: seven days, today said as today.
    expect(screen.getByRole('button', { name: 'Wed 11 Nov, today', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sat 14 Nov', selected: false })).toBeOnTheScreen();
    // Today and tomorrow by their names, a later day by its date; a day with nothing on it is left out.
    expect(screen.getByRole('header', { name: 'Today. Wed 11 Nov' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Tomorrow. Thu 12 Nov' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Sat 14 Nov' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Fri 13 Nov' })).toBeNull();
    // An event with its time, when it ends, where, and whose it is.
    expect(screen.getByRole('button', { name: '15:30. Dentist · Mia. Trubarjeva 12' })).toBeOnTheScreen();
    expect(screen.getByText('16:15')).toBeOnTheScreen();
    expect(screen.getByText('Weekdays · Alex drives')).toBeOnTheScreen();
    // A job with a tick, and whose turn it is.
    expect(screen.getByRole('checkbox', { name: 'Take the bins out, Wed 11 Nov', checked: false })).toBeOnTheScreen();
    expect(screen.getByText('Tue and Fri · your turn, then Alex')).toBeOnTheScreen();
    // What another place brought: its amount in front, and a way to pay.
    expect(screen.getByRole('button', { name: '€84. Electricity is due. Split with Alex · he has paid his half' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pay' })).toBeOnTheScreen();
  });

  it('opens a line by its kind, and the month, the reminders and the goals from the chips', async () => {
    await render(inApp(<PlanHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: '15:30. Dentist · Mia. Trubarjeva 12' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'event', id: ids.dentist } });
    await user.press(screen.getByRole('button', { name: 'Pay' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'bill', id: ids.bill } });
    await user.press(screen.getByRole('button', { name: 'Month' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/plan/month');
    await user.press(screen.getByRole('button', { name: 'Reminders' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/plan/reminders');
    await user.press(screen.getByRole('button', { name: 'Goals' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/plan/goals');
  });

  it('ticks a job for the day it is on: the tick shows at once, and the answer goes to every list', async () => {
    const ticked = reminder({ dueOn: '2026-11-13', turn: null, yours: false, done: true, tickedDueOn: '2026-11-11' });
    jest.mocked(tickReminder).mockResolvedValue(ticked);
    await render(inApp(<PlanHome />));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Take the bins out, Wed 11 Nov' }));
    expect(tickReminder).toHaveBeenCalledWith(ids.bins, { done: true, dueOn: '2026-11-11', day: '2026-11-11' });
    await waitFor(() => expect(mockCache.reminderSaved).toHaveBeenCalledWith(ticked));
  });

  it('takes a tick away again, and says why when a tick did not arrive', async () => {
    asked.mockReturnValue(loaded(planAnswer({ days: [{ day: '2026-11-11', entries: [{ ...bins, done: true, canTick: false, note: 'Done at 10:41' }] }] })));
    jest.mocked(tickReminder).mockRejectedValue(new ApiError(403, 'view_only', 'You can look at this, but not change it.'));
    await render(inApp(<PlanHome />));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Take the bins out, Wed 11 Nov', checked: true }));
    expect(tickReminder).toHaveBeenCalledWith(ids.bins, { done: false, dueOn: '2026-11-11', day: '2026-11-11' });
    expect(await screen.findByText('You can look at this, but not change it.')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Take the bins out, Wed 11 Nov', checked: true })).toBeOnTheScreen();
  });

  it('does not offer a tick for a job that is someone else\'s, or for a day that has not come round', async () => {
    asked.mockReturnValue(loaded(planAnswer({ days: [{ day: '2026-11-11', entries: [{ ...bins, canTick: false }] }] })));
    await render(inApp(<PlanHome />));
    expect(screen.getByRole('checkbox', { name: 'Take the bins out, Wed 11 Nov' })).toBeDisabled();
  });

  it('puts what is still open from before on top of today, each with the day it was due', async () => {
    const late = planEntry({ thingId: ids.tripForm, kind: 'reminder', title: 'Call the plumber', day: '2026-11-09', lead: '9:00', leadEnd: null, done: false, canTick: true, note: '', noteIcon: 'none', avatarUrls: [] });
    asked.mockReturnValue(loaded(planAnswer({ overdue: [late] })));
    await render(inApp(<PlanHome />));
    expect(screen.getByRole('header', { name: 'Still to do. from earlier' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '9:00. Call the plumber. Was due Mon 9 Nov' })).toBeOnTheScreen();
    jest.mocked(tickReminder).mockResolvedValue(reminder());
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Call the plumber, Mon 9 Nov' }));
    expect(tickReminder).toHaveBeenCalledWith(ids.tripForm, { done: true, dueOn: '2026-11-09', day: '2026-11-11' });
  });

  it('shows the list from another day when it is picked in the strip', async () => {
    await render(inApp(<PlanHome />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Sat 14 Nov' }));
    expect(asked).toHaveBeenLastCalledWith('c-linds', { day: '2026-11-14', days: 7 }, expect.anything());
  });

  it('says so when nothing is planned, and when a chosen day has nothing on it', async () => {
    asked.mockReturnValue(loaded(planAnswer({ days: [{ day: '2026-11-11', entries: [] }] })));
    const view = await render(inApp(<PlanHome />));
    expect(screen.getByRole('header', { name: 'Nothing planned yet' })).toBeOnTheScreen();
    asked.mockReturnValue(loaded(planAnswer({ day: '2026-11-13', days: [{ day: '2026-11-13', entries: [] }, { day: '2026-11-14', entries: [planEntry({ day: '2026-11-14' })] }] })));
    await view.rerender(inApp(<PlanHome />));
    expect(screen.getByText('Nothing on this day.')).toBeOnTheScreen();
  });

  it('draws grey shapes while it loads, says when the phone is offline, and offers to try again when it failed', async () => {
    asked.mockReturnValue(pending());
    const view = await render(inApp(<PlanHome />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    // The doors are there from the first frame.
    expect(screen.getByRole('button', { name: 'Month' })).toBeOnTheScreen();
    asked.mockReturnValue({ ...pending(), isPaused: true });
    await view.rerender(inApp(<PlanHome />));
    expect(screen.getByText("You're offline")).toBeOnTheScreen();
    const again = failed(new ApiError(500, 'server', 'Something went wrong on our side. Try again.'));
    asked.mockReturnValue(again);
    await view.rerender(inApp(<PlanHome />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(again.refetch).toHaveBeenCalled();
  });
});
