import { render, screen, userEvent } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { tickReminder, useGetMonth, useGetPlan } from '@/api/generated/homeport';
import Month from '@/app/(app)/plan/month';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { haircut, ids, monthAnswer, onSampleToday, planAnswer } from '@/test/samples/plan';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
let mockParams: { day?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ reminderSaved: jest.fn(() => Promise.resolve()) }) }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/api/generated/homeport', () => ({ useGetMonth: jest.fn(), useGetPlan: jest.fn(), tickReminder: jest.fn() }));

const mockLinds = linds;
const grid = jest.mocked(useGetMonth) as unknown as jest.Mock;
const list = jest.mocked(useGetPlan) as unknown as jest.Mock;
/** The list of one day, as the API answers for it. */
const dayOf = (day: string, entries = [haircut]) => loaded(planAnswer({ day, days: [{ day, entries }] }));

describe('7.2 Month', () => {
  beforeAll(onSampleToday);
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    grid.mockReturnValue(loaded(monthAnswer()));
    list.mockImplementation((_circle: string, params: { day: string }) => dayOf(params.day, params.day === '2026-11-14' ? [haircut] : []));
  });

  it('shows the month with today, and the list of today under it', async () => {
    await render(inApp(<Month />));
    expect(screen.getByRole('header', { name: 'November 2026' })).toBeOnTheScreen();
    expect(grid).toHaveBeenCalledWith('c-linds', { month: '2026-11' }, expect.anything());
    expect(list).toHaveBeenCalledWith('c-linds', { day: '2026-11-11', days: 1 }, expect.anything());
    // Forty-two days: whole weeks, with the pale ones of October and December.
    expect(screen.getAllByRole('button', { name: /^\d+ (October|November|December) 2026/ })).toHaveLength(42);
    expect(screen.getByRole('button', { name: '11 November 2026, today', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Wed 11 Nov' })).toBeOnTheScreen();
    expect(screen.getByText('Nothing on this day.')).toBeOnTheScreen();
  });

  it('shows the list of the day that is picked, and opens what is on it', async () => {
    await render(inApp(<Month />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: '14 November 2026' }));
    expect(screen.getByRole('button', { name: '14 November 2026', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Sat 14 Nov' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '10:00. Haircut · Leo. Reminds you an hour before' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'event', id: ids.haircut } });
  });

  it('opens on the day the address names', async () => {
    mockParams = { day: '2026-11-14' };
    await render(inApp(<Month />));
    expect(screen.getByRole('button', { name: '14 November 2026', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '10:00. Haircut · Leo. Reminds you an hour before' })).toBeOnTheScreen();
  });

  it('goes to the months before and after, and follows a pale day into its own month', async () => {
    await render(inApp(<Month />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('header', { name: 'December 2026' })).toBeOnTheScreen();
    expect(grid).toHaveBeenLastCalledWith('c-linds', { month: '2026-12' }, expect.anything());
    await user.press(screen.getByRole('button', { name: 'Previous month' }));
    await user.press(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('header', { name: 'October 2026' })).toBeOnTheScreen();
    // The grid the sample answers with still holds 5 December: picking it takes the month along.
    await user.press(screen.getByRole('button', { name: '5 December 2026' }));
    expect(screen.getByRole('header', { name: 'December 2026' })).toBeOnTheScreen();
    expect(list).toHaveBeenLastCalledWith('c-linds', { day: '2026-12-05', days: 1 }, expect.anything());
  });

  it('shows only one person\'s days when their face is picked, and everyone\'s again', async () => {
    await render(inApp(<Month />));
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'Everyone', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'You' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Mia' }));
    expect(screen.getByRole('button', { name: 'Mia', selected: true })).toBeOnTheScreen();
    expect(grid).toHaveBeenLastCalledWith('c-linds', { month: '2026-11', member: 'm-mia' }, expect.anything());
    expect(list).toHaveBeenLastCalledWith('c-linds', { day: '2026-11-11', days: 1, member: 'm-mia' }, expect.anything());
    await user.press(screen.getByRole('button', { name: 'Everyone' }));
    expect(grid).toHaveBeenLastCalledWith('c-linds', { month: '2026-11' }, expect.anything());
  });

  it('adds an event on the chosen day from the +', async () => {
    mockParams = { day: '2026-11-14' };
    await render(inApp(<Month />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'New event' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/new/event', params: { day: '2026-11-14' } });
  });

  it('ticks a job on the chosen day', async () => {
    const job = { ...haircut, thingId: ids.bins, kind: 'reminder' as const, title: 'Take the bins out', done: false, canTick: true };
    list.mockImplementation((_circle: string, params: { day: string }) => dayOf(params.day, [job]));
    mockParams = { day: '2026-11-14' };
    jest.mocked(tickReminder).mockReturnValue(new Promise(() => undefined));
    await render(inApp(<Month />));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Take the bins out, Sat 14 Nov' }));
    expect(tickReminder).toHaveBeenCalledWith(ids.bins, { done: true, dueOn: '2026-11-14', day: '2026-11-11' });
    expect(screen.getByRole('checkbox', { name: 'Take the bins out, Sat 14 Nov', checked: true })).toBeOnTheScreen();
  });

  it('keeps its Back while it loads, and says what went wrong when it did not load', async () => {
    grid.mockReturnValue(pending());
    list.mockReturnValue(pending());
    const view = await render(inApp(<Month />));
    expect(screen.getAllByLabelText('Loading').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    const again = failed(new ApiError(500, 'server', 'Something went wrong on our side. Try again.'));
    grid.mockReturnValue(again);
    await view.rerender(inApp(<Month />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(again.refetch).toHaveBeenCalled();
  });
});
