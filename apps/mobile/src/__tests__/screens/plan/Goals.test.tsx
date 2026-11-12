import { render, screen, userEvent } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { useGetGoal, useGetGoals } from '@/api/generated/homeport';
import Goals from '@/app/(app)/plan/goals';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { booksRow, goal, goalRow, ids, onSampleToday, tenKRow } from '@/test/samples/plan';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/api/generated/homeport', () => ({ useGetGoals: jest.fn(), useGetGoal: jest.fn() }));

const mockLinds = linds;
const asked = jest.mocked(useGetGoals) as unknown as jest.Mock;
const whole = jest.mocked(useGetGoal) as unknown as jest.Mock;

describe('7.6 Goals', () => {
  beforeAll(onSampleToday);
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded([goalRow(), booksRow, tenKRow]));
    whole.mockReturnValue(loaded(goal()));
  });

  it('draws the first goal large, with its ring, what is saved and who chips in, and the others two to a row', async () => {
    await render(inApp(<Goals />));
    expect(asked).toHaveBeenCalledWith('c-linds', { day: '2026-11-11' });
    expect(screen.getByRole('header', { name: 'Goals' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Norway 2027. 70%. €5,600 of €8,000 · on track for March' })).toBeOnTheScreen();
    expect(screen.getByText('70%')).toBeOnTheScreen();
    expect(screen.getByText('saved')).toBeOnTheScreen();
    expect(screen.getByText('All four chip in')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Read 20 books. 65%. 13 of 20 · together' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Family 10K. 40%. Day 12 of 30 in Journey' })).toBeOnTheScreen();
  });

  it('says "done" under the number of a goal that counts something else than money', async () => {
    whole.mockReturnValue(loaded(goal({ unit: 'count', how: 'number' })));
    await render(inApp(<Goals />));
    expect(screen.getByText('done')).toBeOnTheScreen();
    expect(screen.queryByText('saved')).toBeNull();
  });

  it('opens a goal, and a new one from the +', async () => {
    await render(inApp(<Goals />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Read 20 books/ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'goal', id: ids.books } });
    await user.press(screen.getByRole('button', { name: /^Norway 2027/ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'goal', id: ids.norway } });
    await user.press(screen.getByRole('button', { name: 'New goal' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/new/goal');
  });

  it('says what a goal is while there is none, and offers to start one', async () => {
    asked.mockReturnValue(loaded([]));
    whole.mockReturnValue(pending());
    await render(inApp(<Goals />));
    expect(screen.getByRole('header', { name: 'No goals yet' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Start a goal' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/new/goal');
  });

  it('keeps its bar while it loads, says when the phone is offline, and what went wrong', async () => {
    asked.mockReturnValue(pending());
    whole.mockReturnValue(pending());
    const view = await render(inApp(<Goals />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue({ ...pending(), isPaused: true });
    await view.rerender(inApp(<Goals />));
    expect(screen.getByText("You're offline")).toBeOnTheScreen();
    const again = failed(new ApiError(500, 'server', 'Something went wrong on our side. Try again.'));
    asked.mockReturnValue(again);
    await view.rerender(inApp(<Goals />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(again.refetch).toHaveBeenCalled();
  });
});
