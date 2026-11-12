import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ApiError } from '@/api/fetcher';
import { createSheet, useGetSheetsInfinite, useGetSheetTemplates } from '@/api/generated/homeport';
import Sheets from '@/app/(app)/money/sheets';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending } from '@/test/samples';
import { budget2026, onThe12th, sheet, SHEET_ID, sheetBrief, templates } from '@/test/samples/money';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { sheetMade: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useIsFocused: () => true }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({ useGetSheetsInfinite: jest.fn(), useGetSheetTemplates: jest.fn(), useGetMe: jest.fn(() => mockMe), createSheet: jest.fn() }));
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
const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetSheetsInfinite) as unknown as jest.Mock;
const pages = <T,>(items: T[]) => ({ ...loaded({ pages: [{ items, nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });

describe('8.4 Sheets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onThe12th();
    asked.mockReturnValue(pages([sheetBrief(), budget2026, sheetBrief({ id: 'sheet-3', title: 'Party budget', tabs: 1, tag: 'Party', template: 'party_budget', updatedAt: '2026-11-10T09:00:00Z', editedBy: { memberId: 'm-nora', name: 'Nora', avatarUrl: null }, headline: null })]));
    jest.mocked(useGetSheetTemplates).mockReturnValue(loaded(templates) as never);
  });
  afterEach(() => jest.useRealTimers());

  it("lists the circle's sheets: how many tabs, who changed each last, and its first number or who sees it", async () => {
    await render(inApp(<Sheets />));
    expect(screen.getByRole('header', { name: 'Sheets' })).toBeOnTheScreen();
    expect(screen.getByText('Yours')).toBeOnTheScreen();
    // Everyone sees it: its first tile's number stands at the end.
    expect(screen.getByRole('button', { name: 'Norway budget. 3 tabs · Alex edited it today. €7,640' })).toBeOnTheScreen();
    // Only some see it: who, in place of a number. Twelve tabs of a monthly budget are one a month.
    expect(screen.getByRole('button', { name: 'Budget 2026. 12 tabs · one a month' })).toBeOnTheScreen();
    expect(screen.getByText('Alex and you')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Party budget. 1 tab · you edited it on 10 Nov' })).toBeOnTheScreen();
  });

  it('opens a sheet, and the form that starts one by name', async () => {
    await render(inApp(<Sheets />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Norway budget\./ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'sheet', id: SHEET_ID } });
    await user.press(screen.getByRole('button', { name: 'New sheet' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/new/sheet');
  });

  it('offers the templates as the API lists them, the live ones marked', async () => {
    await render(inApp(<Sheets />));
    expect(screen.getByText('Start from a template')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Monthly budget. Money in, bills out, what's left" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Loan planner. Slide the rate, watch the payment. Has sliders to try first' })).toBeOnTheScreen();
    expect(screen.getAllByText('LIVE')).toHaveLength(2);
  });

  it('starts a sheet from a template in the current circle, and opens it', async () => {
    const made = sheet({ id: 'new-sheet', title: 'Trip budget' });
    jest.mocked(createSheet).mockResolvedValue(made);
    await render(inApp(<Sheets />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Trip budget. Costs, who paid, who owes' }));
    await waitFor(() => expect(createSheet).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', template: 'trip_budget', audience: undefined, day: '2026-11-12' }));
    await waitFor(() => expect(mockCache.sheetMade).toHaveBeenCalledWith(made));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'sheet', id: 'new-sheet' } });
  });

  it('opens the loan planner to try first, and makes nothing until it is kept', async () => {
    await render(inApp(<Sheets />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^Loan planner\./ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/money/loan');
    expect(createSheet).not.toHaveBeenCalled();
  });

  it('says what went wrong when a template could not be started', async () => {
    jest.mocked(createSheet).mockRejectedValue(new ApiError(400, 'invalid_template', "That isn't one of the templates."));
    await render(inApp(<Sheets />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^Car costs\./ }));
    expect(await screen.findByText("That isn't one of the templates.")).toBeOnTheScreen();
  });

  it('says so when there are none yet, keeps its Back while it loads, and says what went wrong', async () => {
    asked.mockReturnValue(pages([]));
    const view = await render(inApp(<Sheets />));
    expect(screen.getByText('No sheets here yet. Start one from a template below.')).toBeOnTheScreen();
    asked.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    await view.rerender(inApp(<Sheets />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue({ ...failed(new ApiError(500, 'server_error', 'Something went wrong on our side. Try again.')), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    await view.rerender(inApp(<Sheets />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
  });
});
