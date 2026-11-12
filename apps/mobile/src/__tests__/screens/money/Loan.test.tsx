import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { createSheet, useGetLoanPlan } from '@/api/generated/homeport';
import LoanPlanner from '@/app/(app)/money/loan';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { loanPlan, onThe12th, sheet } from '@/test/samples/money';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { sheetMade: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/api/generated/homeport', () => ({ useGetLoanPlan: jest.fn(), createSheet: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => 'client-1') }));

const mockLinds = linds;
const asked = jest.mocked(useGetLoanPlan) as unknown as jest.Mock;
const step = (name: RegExp, action: 'increment' | 'decrement') => fireEvent(screen.getByRole('adjustable', { name }), 'accessibilityAction', { nativeEvent: { actionName: action } });

describe('8.8 The loan planner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onThe12th();
    asked.mockReturnValue(loaded(loanPlan()));
  });
  afterEach(() => jest.useRealTimers());

  it('opens on the drawn loan and asks the API for its sums, with what a bit more each month would change', async () => {
    await render(inApp(<LoanPlanner />));
    expect(asked).toHaveBeenCalledWith({ principalCents: 24000000, ratePercent: 3.4, years: 25, extraCents: 10000 }, expect.anything());
    expect(screen.getByRole('header', { name: 'Loan planner' })).toBeOnTheScreen();
  });

  it('shows the three outcomes: what is paid each month, the interest, and what paying more would do', async () => {
    await render(inApp(<LoanPlanner />));
    expect(screen.getByText("You'd pay each month")).toBeOnTheScreen();
    // Whole euros on this screen: €1,188.66 a month, €116,599.63 of interest.
    expect(screen.getByText('€1,189')).toBeOnTheScreen();
    expect(screen.getByText('€116,600 of interest over 25 years')).toBeOnTheScreen();
    expect(screen.getByText('Pay €100 more a month')).toBeOnTheScreen();
    // 35 months sooner, and a rough figure after "about".
    expect(screen.getByText('Done 2 years 11 months sooner, with about €15,000 less interest.')).toBeOnTheScreen();
  });

  it('has a slider for what is borrowed, the interest and the years, each saying its value', async () => {
    await render(inApp(<LoanPlanner />));
    expect(screen.getByRole('adjustable', { name: 'Borrowed: €240,000' })).toBeOnTheScreen();
    expect(screen.getByRole('adjustable', { name: 'Interest a year: 3.4%' })).toBeOnTheScreen();
    expect(screen.getByRole('adjustable', { name: 'Over: 25 years' })).toBeOnTheScreen();
  });

  it('asks the API again as a slider moves: the figures are never worked out on the phone', async () => {
    await render(inApp(<LoanPlanner />));
    await step(/^Borrowed/, 'increment');
    expect(screen.getByRole('adjustable', { name: 'Borrowed: €245,000' })).toBeOnTheScreen();
    await waitFor(() => expect(asked).toHaveBeenLastCalledWith({ principalCents: 24500000, ratePercent: 3.4, years: 25, extraCents: 10000 }, expect.anything()));
    await step(/^Interest a year/, 'decrement');
    await step(/^Over/, 'decrement');
    expect(screen.getByRole('adjustable', { name: 'Interest a year: 3.3%' })).toBeOnTheScreen();
    expect(screen.getByRole('adjustable', { name: 'Over: 24 years' })).toBeOnTheScreen();
    await waitFor(() => expect(asked).toHaveBeenLastCalledWith({ principalCents: 24500000, ratePercent: 3.3, years: 24, extraCents: 10000 }, expect.anything()));
  });

  it('follows the finger along a track, a step at a time, and stops at its ends', async () => {
    await render(inApp(<LoanPlanner />));
    const years = screen.getByRole('adjustable', { name: /^Over/ });
    await fireEvent(years, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 28 } } });
    await fireEvent(years, 'responderGrant', { nativeEvent: { locationX: 150 } });
    expect(screen.getByRole('adjustable', { name: 'Over: 20 years' })).toBeOnTheScreen();
    await fireEvent(years, 'responderMove', { nativeEvent: { locationX: 900 } });
    expect(screen.getByRole('adjustable', { name: 'Over: 35 years' })).toBeOnTheScreen();
    await fireEvent(years, 'responderMove', { nativeEvent: { locationX: -40 } });
    expect(screen.getByRole('adjustable', { name: 'Over: 5 years' })).toBeOnTheScreen();
  });

  it('draws what is still owed over the years, with the year the extra ends it', async () => {
    await render(inApp(<LoanPlanner />));
    const chart = screen.getByLabelText('What you still owe, falling to nothing over 25 years, or in 22 with the extra');
    await fireEvent(chart, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 350, height: 132 } } });
    expect(screen.getByText('Now')).toBeOnTheScreen();
    expect(screen.getByText('10 years')).toBeOnTheScreen();
    expect(screen.getByText('22')).toBeOnTheScreen();
    expect(screen.getByText('25')).toBeOnTheScreen();
    expect(screen.getByText('What you still owe')).toBeOnTheScreen();
    // Without the extra, the dotted line and its year go.
    await userEvent.setup().press(screen.getByRole('switch', { name: 'Count the extra in' }));
    expect(screen.queryByText('22')).toBeNull();
    expect(screen.getByLabelText('What you still owe, falling to nothing over 25 years')).toBeOnTheScreen();
  });

  it('keeps the plan as a sheet, with the extra while its switch is on', async () => {
    const kept = sheet({ id: 'loan-sheet', title: 'Loan planner' });
    jest.mocked(createSheet).mockResolvedValue(kept);
    await render(inApp(<LoanPlanner />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Keep as a sheet' }));
    await waitFor(() => expect(createSheet).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', loan: { principalCents: 24000000, ratePercent: 3.4, years: 25, extraCents: 10000 }, day: '2026-11-12' }));
    await waitFor(() => expect(mockCache.sheetMade).toHaveBeenCalledWith(kept));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'sheet', id: 'loan-sheet' } });
  });

  it('keeps it without the extra when the switch is off, and goes back to the numbers it opened with', async () => {
    jest.mocked(createSheet).mockResolvedValue(sheet());
    await render(inApp(<LoanPlanner />));
    const user = userEvent.setup();
    await step(/^Borrowed/, 'decrement');
    await user.press(screen.getByRole('switch', { name: 'Count the extra in' }));
    await user.press(screen.getByRole('button', { name: 'Keep as a sheet' }));
    await waitFor(() => expect(createSheet).toHaveBeenCalledWith(expect.objectContaining({ loan: { principalCents: 23500000, ratePercent: 3.4, years: 25, extraCents: undefined } })));
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Back to the numbers it opened with' }));
    expect(screen.getByRole('adjustable', { name: 'Borrowed: €240,000' })).toBeOnTheScreen();
  });

  it('says what went wrong: when the sums do not come, and when the sheet could not be kept', async () => {
    jest.mocked(createSheet).mockRejectedValue(new ApiError(400, 'invalid_loan', 'A loan runs for 1 to 50 years.'));
    const view = await render(inApp(<LoanPlanner />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Keep as a sheet' }));
    expect(await screen.findByText('A loan runs for 1 to 50 years.')).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(500, 'server_error', 'Something went wrong on our side. Try again.')));
    await view.rerender(inApp(<LoanPlanner />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('draws grey shapes while the first sums are on their way, with the sliders already there', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<LoanPlanner />));
    expect(screen.queryByText('€1,189')).toBeNull();
    expect(screen.getByRole('adjustable', { name: 'Borrowed: €240,000' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Keep as a sheet' })).toBeDisabled();
  });
});
