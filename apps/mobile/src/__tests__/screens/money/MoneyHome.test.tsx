import { render, screen, userEvent } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { useGetMoney, useGetSplits } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { MoneyHome } from '@/features/money/MoneyHome';
import { today } from '@/lib/dates';
import { onPhone } from '@/test/phone';
import { crewCircle, failed, linds, loaded, pending } from '@/test/samples';
import { BILL_ID, billRow, lea, moneyAnswer, onThe12th, SHEET_ID, SPLIT_ID, splitBrief } from '@/test/samples/money';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/circles/current', () => ({ useCircle: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({ useGetMoney: jest.fn(), useGetSplits: jest.fn() }));

const asked = jest.mocked(useGetMoney) as unknown as jest.Mock;
const splits = jest.mocked(useGetSplits) as unknown as jest.Mock;

describe('8.1 Money', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onThe12th();
    jest.mocked(useCircle).mockReturnValue(linds);
    asked.mockReturnValue(loaded(moneyAnswer()));
    splits.mockReturnValue(loaded({ items: [], nextCursor: null }));
  });
  afterEach(() => jest.useRealTimers());

  it("asks for the current circle's money, by the day on the phone", async () => {
    await render(onPhone(<MoneyHome />));
    expect(asked).toHaveBeenCalledWith('c-linds', { day: today() });
    expect(splits).toHaveBeenCalledWith('c-linds', { limit: 3 });
  });

  it('sums the month up in one card: what is paid of what is due, as a bar, and three numbers', async () => {
    await render(onPhone(<MoneyHome />));
    expect(screen.getByText('November bills')).toBeOnTheScreen();
    // Whole euros on the card: €2,318.19 is due this month.
    expect(screen.getByText('€1,240')).toBeOnTheScreen();
    expect(screen.getByText('of €2,318 paid')).toBeOnTheScreen();
    expect(screen.getByLabelText('November bills: €1,240 of €2,318 paid')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 53 });
    expect(screen.getByRole('button', { name: '€84 due this week' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '€86 in subscriptions' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '€42 Alex owes you' })).toBeOnTheScreen();
  });

  it('opens the list behind each number', async () => {
    await render(onPhone(<MoneyHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: '€84 due this week' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/money/bills');
    await user.press(screen.getByRole('button', { name: '€86 in subscriptions' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/money/bills', params: { show: 'subscriptions' } });
    await user.press(screen.getByRole('button', { name: '€42 Alex owes you' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/money/splits');
  });

  it('lists the three bills due soonest, each with its day, one more thing about it and its amount with cents', async () => {
    asked.mockReturnValue(loaded(moneyAnswer({ dueSoon: [...moneyAnswer().dueSoon, billRow({ id: 'bill-4', title: 'Gym' }), billRow({ id: 'bill-5', title: 'Water' })] })));
    await render(onPhone(<MoneyHome />));
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'Electricity. Tomorrow · split with Alex. €84.20' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Rent. Mon 16 Nov · standing order. €980.00' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Netflix. Fri 20 Nov · direct debit. €13.99' })).toBeOnTheScreen();
    // The card holds three; the arrow beside "Due soon" opens the rest.
    expect(screen.queryByText('Gym')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Electricity. Tomorrow · split with Alex. €84.20' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'bill', id: BILL_ID } });
    await user.press(screen.getByRole('button', { name: 'Due soon. See all' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/money/bills');
  });

  it('shows the sheets as a rail, each with one word for the kind of sheet it is', async () => {
    await render(onPhone(<MoneyHome />));
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'Budget 2026. Monthly' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Norway budget. Trip' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'sheet', id: SHEET_ID } });
    await user.press(screen.getByRole('button', { name: 'Sheets. See all' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/money/sheets');
  });

  it('is about who owes whom among friends: the largest debt on the card, and the splits under the sheets', async () => {
    jest.mocked(useCircle).mockReturnValue(crewCircle);
    asked.mockReturnValue(loaded(moneyAnswer({ monthTotalCents: 0, monthPaidCents: 0, dueThisWeekCents: 0, subscriptionsMonthCents: 0, owing: [{ person: lea, cents: 4400, currency: 'EUR' }, { person: { memberId: 'm-kai', name: 'Kai', avatarUrl: null }, cents: 2000, currency: 'EUR' }], dueSoon: [], sheets: [] })));
    splits.mockReturnValue(loaded({ items: [splitBrief()], nextCursor: null }));
    await render(onPhone(<MoneyHome />));
    const user = userEvent.setup();
    // Nothing is added up in the app: the card names the largest one, as the API ranks them.
    expect(screen.getByRole('button', { name: '€44 Lea owes you' })).toBeOnTheScreen();
    expect(screen.getByText('Nothing is due. Add a bill with the + button.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Start a sheet. New' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: "Lisbon weekend. You're owed €64" }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'split', id: SPLIT_ID } });
  });

  it('says so when the person owes someone, and when nobody owes anybody', async () => {
    asked.mockReturnValue(loaded(moneyAnswer({ owing: [{ person: lea, cents: -1250, currency: 'EUR' }] })));
    const view = await render(onPhone(<MoneyHome />));
    expect(screen.getByRole('button', { name: '€13 you owe Lea' })).toBeOnTheScreen();
    asked.mockReturnValue(loaded(moneyAnswer({ owing: [] })));
    await view.rerender(onPhone(<MoneyHome />));
    expect(screen.getByRole('button', { name: '€0 owed between you' })).toBeOnTheScreen();
  });

  it('says which bills are left out of the sums when they are kept in another currency', async () => {
    asked.mockReturnValue(loaded(moneyAnswer({ otherCurrencies: ['USD'] })));
    await render(onPhone(<MoneyHome />));
    expect(screen.getByText('Bills in USD are in the lists, not in these sums.')).toBeOnTheScreen();
  });

  it('draws grey shapes while it loads, says so offline, and offers to try again when it fails', async () => {
    asked.mockReturnValue(pending());
    const view = await render(onPhone(<MoneyHome />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    asked.mockReturnValue({ ...pending(), isPaused: true });
    await view.rerender(onPhone(<MoneyHome />));
    expect(screen.getByRole('header', { name: "You're offline" })).toBeOnTheScreen();
    const problem = failed(new ApiError(500, 'server_error', 'Something went wrong on our side. Try again.'));
    asked.mockReturnValue(problem);
    await view.rerender(onPhone(<MoneyHome />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(problem.refetch).toHaveBeenCalled();
  });
});
