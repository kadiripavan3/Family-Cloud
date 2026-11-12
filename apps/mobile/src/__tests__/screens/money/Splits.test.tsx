import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ApiError } from '@/api/fetcher';
import { createSplit, useGetSplitsInfinite } from '@/api/generated/homeport';
import Splits from '@/app/(app)/money/splits';
import { inApp } from '@/test/phone';
import { crewCircle, failed, loaded, pending } from '@/test/samples';
import { split, SPLIT_ID, splitBrief } from '@/test/samples/money';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { splitSaved: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockCrew }));
jest.mock('@/api/generated/homeport', () => ({ useGetSplitsInfinite: jest.fn(), createSplit: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => 'client-1') }));
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
const mockCrew = crewCircle;
const asked = jest.mocked(useGetSplitsInfinite) as unknown as jest.Mock;
const pages = <T,>(items: T[]) => ({ ...loaded({ pages: [{ items, nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });

describe("a circle's shared costs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(pages([splitBrief(), splitBrief({ id: 'split-2', title: 'Ski week', myBalanceCents: -3050 }), splitBrief({ id: 'split-3', title: 'Dinner club', myBalanceCents: 0 })]));
  });

  it('lists each split with where the person stands in it, and opens one', async () => {
    await render(inApp(<Splits />));
    expect(screen.getByRole('header', { name: 'Shared costs' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ski week. You owe €30.50' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Dinner club. You're even" })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: "Lisbon weekend. You're owed €64" }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'split', id: SPLIT_ID } });
  });

  it('starts keeping count of something new by name, and opens it', async () => {
    const made = split({ id: 'new-split', title: 'Camping', expenses: 0 });
    jest.mocked(createSplit).mockResolvedValue(made);
    await render(inApp(<Splits />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Start keeping count' }));
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('What is it for'), 'Camping');
    await user.press(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(createSplit).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-crew', title: 'Camping' }));
    await waitFor(() => expect(mockCache.splitSaved).toHaveBeenCalledWith(made));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'split', id: 'new-split' } });
  });

  it('says what it is for when there is none yet, and what went wrong when it fails', async () => {
    asked.mockReturnValue(pages([]));
    const view = await render(inApp(<Splits />));
    expect(screen.getByRole('header', { name: 'Nothing to split yet' })).toBeOnTheScreen();
    expect(screen.getByText('Add what each of you paid, and Homeport works out the fewest payments that settle it.')).toBeOnTheScreen();
    asked.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    await view.rerender(inApp(<Splits />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    asked.mockReturnValue({ ...failed(new ApiError(500, 'server_error', 'Something went wrong on our side. Try again.')), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    await view.rerender(inApp(<Splits />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
  });
});
