import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ApiError } from '@/api/fetcher';
import { useGetBillsInfinite, useGetMoney } from '@/api/generated/homeport';
import Bills from '@/app/(app)/money/bills';
import { onPhone } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { BILL_ID, billRow, moneyAnswer, netflix, onThe12th, rent } from '@/test/samples/money';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
let mockParams: { show?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, useIsFocused: () => true }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/api/generated/homeport', () => ({ useGetBillsInfinite: jest.fn(), useGetMoney: jest.fn() }));
// The real list draws only the rows a phone's screen has room for; in a test every row is drawn.
jest.mock('@/ui/List', () => ({ List: (props: MockList) => mockList(props) }));

type MockList = { data: unknown[]; row: (item: unknown, index: number) => ReactElement; header?: ReactElement | null; footer?: ReactElement | null; empty?: ReactElement | null };
function mockList({ data, row, header, footer, empty }: MockList) {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return (
    <View>
      {header}
      {data.length ? data.map((item, index) => <View key={index}>{row(item, index)}</View>) : empty}
      {footer}
    </View>
  );
}

const mockLinds = linds;
const asked = jest.mocked(useGetBillsInfinite) as unknown as jest.Mock;
const sums = jest.mocked(useGetMoney) as unknown as jest.Mock;
/** What a paged list gives a screen: its pages so far, and whether there is another. */
const pages = <T,>(items: T[], more = false) => ({ ...loaded({ pages: [{ items, nextCursor: more ? 'next' : null }], pageParams: [undefined] }), hasNextPage: more, isFetchingNextPage: false, fetchNextPage: jest.fn() });

describe('the lists of bills', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onThe12th();
    mockParams = {};
    asked.mockReturnValue(pages([billRow(), rent, netflix]));
    sums.mockReturnValue(loaded(moneyAnswer()));
  });
  afterEach(() => jest.useRealTimers());

  it('opens on what is still to pay, the soonest first, a page at a time', async () => {
    await render(onPhone(<Bills />));
    expect(asked).toHaveBeenCalledWith('c-linds', { show: 'due' }, expect.objectContaining({ query: expect.objectContaining({ initialPageParam: undefined }) }));
    expect(screen.getByRole('header', { name: 'Bills' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'To pay', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Electricity. Tomorrow · split with Alex. €84.20' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Rent. Mon 16 Nov · standing order. €980.00' })).toBeOnTheScreen();
  });

  it('opens a bill, and the form that adds one', async () => {
    await render(onPhone(<Bills />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Electricity. Tomorrow · split with Alex. €84.20' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'bill', id: BILL_ID } });
    await user.press(screen.getByRole('button', { name: 'Add a bill' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/new/bill');
  });

  it('shows the paid ones with the day each was paid: the same bill once for each time', async () => {
    await render(onPhone(<Bills />));
    asked.mockReturnValue(pages([billRow({ paid: true, paidAt: '2026-10-13T09:00:00Z', dueOn: '2026-10-13', amountCents: 7800 }), billRow({ paid: true, paidAt: '2026-09-13T09:00:00Z', dueOn: '2026-09-13', amountCents: 6080 })]));
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Paid' }));
    expect(asked).toHaveBeenLastCalledWith('c-linds', { show: 'paid' }, expect.anything());
    expect(screen.getByRole('button', { name: 'Electricity. Paid 13 Oct · split with Alex. €78.00' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Electricity. Paid 13 Sep · split with Alex. €60.80' })).toBeOnTheScreen();
  });

  it('opens on the subscriptions when the address says so, with what they come to in a month and a year', async () => {
    mockParams = { show: 'subscriptions' };
    asked.mockReturnValue(pages([netflix]));
    await render(onPhone(<Bills />));
    expect(asked).toHaveBeenCalledWith('c-linds', { show: 'subscriptions' }, expect.anything());
    expect(screen.getByRole('radio', { name: 'Subscriptions', checked: true })).toBeOnTheScreen();
    expect(screen.getByText('€86 a month · €1,032 a year')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Netflix. Fri 20 Nov · €168 a year. €13.99' })).toBeOnTheScreen();
  });

  it('says what belongs in a list that is empty', async () => {
    asked.mockReturnValue(pages([]));
    await render(onPhone(<Bills />));
    expect(screen.getByRole('header', { name: 'Nothing to pay' })).toBeOnTheScreen();
    expect(screen.getByText('A bill you add stays here until it is paid.')).toBeOnTheScreen();
  });

  it('keeps its Back while it loads, and says what went wrong when it fails', async () => {
    asked.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    const view = await render(onPhone(<Bills />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue({ ...failed(new ApiError(500, 'server_error', 'Something went wrong on our side. Try again.')), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    await view.rerender(onPhone(<Bills />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });
});
