import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addSheetColumn, addSheetRow, addSheetTab, changeSheet, changeSheetColumn, changeSheetRow, changeSheetTab, deleteThing, removeSheetColumn, removeSheetRow, removeSheetTab, useGetSheet, useGetSheetRowsInfinite } from '@/api/generated/homeport';
import Sheet from '@/app/(app)/sheet/[id]';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending } from '@/test/samples';
import { alexBrief, cell, column, columns, onThe12th, rowChanged, rows, sheet, SHEET_ID, sheetRow } from '@/test/samples/money';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { sheetRowSaved: jest.fn(() => Promise.resolve()), sheetChanged: jest.fn(() => Promise.resolve()), sheetTabRemoved: jest.fn(() => Promise.resolve()), thingDeleted: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({
  useGetSheet: jest.fn(),
  useGetSheetRowsInfinite: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  changeSheetRow: jest.fn(),
  addSheetRow: jest.fn(),
  removeSheetRow: jest.fn(),
  changeSheet: jest.fn(),
  addSheetTab: jest.fn(),
  changeSheetTab: jest.fn(),
  removeSheetTab: jest.fn(),
  addSheetColumn: jest.fn(),
  changeSheetColumn: jest.fn(),
  removeSheetColumn: jest.fn(),
  deleteThing: jest.fn(),
}));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => 'client-1') }));

const mockId = '44444444-4444-4444-8444-444444444444';
const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetSheet) as unknown as jest.Mock;
const further = jest.mocked(useGetSheetRowsInfinite) as unknown as jest.Mock;
const DAY = { day: '2026-11-12' };

describe('8.5 A sheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onThe12th();
    asked.mockReturnValue(loaded(sheet()));
    further.mockReturnValue({ ...loaded(undefined), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
  });
  afterEach(() => jest.useRealTimers());

  it('asks for its first tab with the day on the phone, and again every few seconds while it is open', async () => {
    await render(inApp(<Sheet />));
    expect(asked).toHaveBeenCalledWith(SHEET_ID, { tab: undefined, limit: 100, day: '2026-11-12' }, { query: expect.objectContaining({ refetchInterval: 4000 }) });
  });

  it('shows its name, who sees it, and who else has it open right now', async () => {
    const view = await render(inApp(<Sheet />));
    expect(screen.getByRole('header', { name: 'Norway budget' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: The Linds. Change who can see this' })).toBeOnTheScreen();
    expect(screen.queryByText(/here too$/)).toBeNull();
    asked.mockReturnValue(loaded(sheet({ here: [alexBrief] })));
    await view.rerender(inApp(<Sheet />));
    expect(screen.getByText('Alex is here too')).toBeOnTheScreen();
    asked.mockReturnValue(loaded(sheet({ here: [alexBrief, { memberId: 'm-mia', name: 'Mia', avatarUrl: null }] })));
    await view.rerender(inApp(<Sheet />));
    expect(screen.getByText('Alex and Mia are here too')).toBeOnTheScreen();
  });

  it('puts the tiles on top, each opening its formula', async () => {
    await render(inApp(<Sheet />));
    expect(screen.getByRole('button', { name: 'Planned: €7,640. Change this tile' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Paid: €2,500. Change this tile' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Still to pay: €5,140. Change this tile' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/money/formula', params: { sheet: SHEET_ID, tab: 'tab-budget', tile: 'tile-left' } });
  });

  it('draws the grid: typed columns, the rows with each cell by its kind, and the row of totals', async () => {
    await render(inApp(<Sheet />));
    for (const header of ['Item, Text', 'Who, Person', 'Cost, Money', 'Paid, Tick', 'Due, Date']) expect(screen.getByRole('button', { name: `${header}. Change this column` })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Row 3: Cabins, 9 nights. Open as a card' })).toBeOnTheScreen();
    // Money stands as a bare figure under a column that says the currency; people as faces; a day as a day.
    expect(screen.getByText('2,350.00')).toBeOnTheScreen();
    expect(screen.getByLabelText('Mia and Leo')).toBeOnTheScreen();
    expect(screen.getByText('15 Jan 2027')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Paid, row 1', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Paid, row 3', checked: false })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Total of Cost: 7,640.00' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Total of Paid: 2 of 6' })).toBeOnTheScreen();
  });

  it('says in words what the chosen total does, and follows when another is chosen', async () => {
    await render(inApp(<Sheet />));
    expect(screen.getByText('Adds up every row in Cost. Tap a row to open it as a card.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Adds up every row in Cost: 7,640.00')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Total of Paid: 2 of 6' }));
    expect(screen.getByText('Counts the rows where Paid is ticked. Tap a row to open it as a card.')).toBeOnTheScreen();
    expect(screen.getByText('COUNT IF')).toBeOnTheScreen();
  });

  it('ticks a cell where it stands: only that cell is sent, and what comes back moves the totals', async () => {
    const changed = rowChanged(sheetRow(3, 'Cabins, 9 nights', [alexBrief], 235000, true));
    jest.mocked(changeSheetRow).mockResolvedValue(changed);
    await render(inApp(<Sheet />));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Paid, row 3' }));
    await waitFor(() => expect(changeSheetRow).toHaveBeenCalledWith(rows[2]!.id, { cells: { 'col-paid': true } }, DAY));
    await waitFor(() => expect(mockCache.sheetRowSaved).toHaveBeenCalledWith(expect.objectContaining({ id: SHEET_ID }), 'tab-budget', changed));
  });

  it('opens a row as a card, and a new row as its card too', async () => {
    const added = rowChanged(sheetRow(7, '', [], 0, false), { rowCount: 7 });
    jest.mocked(addSheetRow).mockResolvedValue(added);
    await render(inApp(<Sheet />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Row 1: Flights. Open as a card' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/money/row/[id]', params: { id: rows[0]!.id } });
    await user.press(screen.getByRole('button', { name: 'Add a row' }));
    await waitFor(() => expect(addSheetRow).toHaveBeenCalledWith('tab-budget', { clientId: 'client-1' }, DAY));
    await waitFor(() => expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/money/row/[id]', params: { id: added.row.id } }));
    expect(mockCache.sheetRowSaved).toHaveBeenCalledWith(expect.objectContaining({ id: SHEET_ID }), 'tab-budget', added);
  });

  it('removes a row from its own small menu, after asking', async () => {
    jest.mocked(removeSheetRow).mockResolvedValue(undefined);
    await render(inApp(<Sheet />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Row 4. More' }));
    await user.press(screen.getByRole('button', { name: 'Remove this row' }));
    expect(screen.getByRole('header', { name: 'Remove this row?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remove the row' }));
    await waitFor(() => expect(removeSheetRow).toHaveBeenCalledWith(rows[3]!.id));
    await waitFor(() => expect(mockCache.sheetChanged).toHaveBeenCalled());
  });

  it('changes a column from its header: its name and what stands under it', async () => {
    jest.mocked(changeSheetColumn).mockResolvedValue(columns[2]!);
    await render(inApp(<Sheet />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Cost, Money. Change this column' }));
    expect(screen.getByLabelText('Name of the column').props.value).toBe('Cost');
    // A column that holds values keeps its kind: money stays money.
    expect(screen.getByRole('radio', { name: 'Money. An amount', checked: true })).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Text. Words' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Total', checked: true })).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'How many ticked' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Name of the column'), 'Price');
    await user.press(screen.getByRole('radio', { name: 'Average' }));
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeSheetColumn).toHaveBeenCalledWith('col-cost', { name: 'Price', kind: undefined, options: undefined, summary: 'avg' }, DAY));
    await waitFor(() => expect(mockCache.sheetChanged).toHaveBeenCalled());
  });

  it('adds a column with its kind: money with a total, or a choice with what can be chosen', async () => {
    jest.mocked(addSheetColumn).mockResolvedValue(column({ id: 'col-new', name: 'Deposit', kind: 'money' }));
    await render(inApp(<Sheet />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add a column' }));
    expect(screen.getByRole('header', { name: 'New column' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Name of the column'), 'Deposit');
    await user.press(screen.getByRole('radio', { name: 'Money. An amount' }));
    await user.press(screen.getByRole('radio', { name: 'Total' }));
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addSheetColumn).toHaveBeenCalledWith('tab-budget', { clientId: 'client-1', name: 'Deposit', kind: 'money', options: undefined, summary: 'sum' }, DAY));
    // A choice needs something to choose from.
    await user.press(screen.getByRole('button', { name: 'Add a column' }));
    await fireEvent.changeText(screen.getByLabelText('Name of the column'), 'Booked');
    await user.press(screen.getByRole('radio', { name: 'Choice. One of a few' }));
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('What can be chosen'), 'Yes\n\nNot yet');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addSheetColumn).toHaveBeenLastCalledWith('tab-budget', expect.objectContaining({ name: 'Booked', kind: 'choice', options: ['Yes', 'Not yet'] }), DAY));
  });

  it('hands a formula column over to the builder, with the name typed here', async () => {
    await render(inApp(<Sheet />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add a column' }));
    await fireEvent.changeText(screen.getByLabelText('Name of the column'), 'Left');
    await user.press(screen.getByRole('radio', { name: 'Formula. Worked out' }));
    await user.press(screen.getByRole('button', { name: 'Next: build its formula' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/money/formula', params: { sheet: SHEET_ID, tab: 'tab-budget', as: 'column', name: 'Left' } });
    expect(addSheetColumn).not.toHaveBeenCalled();
  });

  it('removes a column after asking, and says why when a formula still uses it', async () => {
    jest.mocked(removeSheetColumn).mockRejectedValue(new ApiError(409, 'in_use', 'Left uses Cost. Change that formula first.'));
    await render(inApp(<Sheet />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Cost, Money. Change this column' }));
    await user.press(screen.getByRole('button', { name: 'Remove this column' }));
    expect(screen.getByRole('header', { name: 'Remove this column?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remove the column' }));
    await waitFor(() => expect(removeSheetColumn).toHaveBeenCalledWith('col-cost'));
    expect(await screen.findByText('Left uses Cost. Change that formula first.')).toBeOnTheScreen();
  });

  it('changes tabs along the bottom, and adds one with the same columns', async () => {
    const saved = sheet({ tabs: [...sheet().tabs, { id: 'tab-new', name: 'December', rows: 0 }] });
    jest.mocked(addSheetTab).mockResolvedValue(saved);
    await render(inApp(<Sheet />));
    const user = userEvent.setup();
    expect(screen.getByRole('tab', { name: 'Budget', selected: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('tab', { name: 'Savings' }));
    expect(asked).toHaveBeenLastCalledWith(SHEET_ID, { tab: 'tab-savings', limit: 100, day: '2026-11-12' }, expect.anything());
    await user.press(screen.getByRole('button', { name: 'Add a tab' }));
    await fireEvent.changeText(screen.getByLabelText('Name of the tab'), 'December');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addSheetTab).toHaveBeenCalledWith(SHEET_ID, { clientId: 'client-1', name: 'December', copyColumnsOf: 'tab-budget' }));
    // The new tab is the one to look at now.
    await waitFor(() => expect(asked).toHaveBeenLastCalledWith(SHEET_ID, { tab: 'tab-new', limit: 100, day: '2026-11-12' }, expect.anything()));
  });

  it('renames and removes the tab that is showing', async () => {
    jest.mocked(changeSheetTab).mockResolvedValue(sheet());
    jest.mocked(removeSheetTab).mockResolvedValue(undefined);
    await render(inApp(<Sheet />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('tab', { name: 'Budget' }));
    await user.press(screen.getByRole('button', { name: 'Rename this tab' }));
    await fireEvent.changeText(screen.getByLabelText('Name of the tab'), 'Costs');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeSheetTab).toHaveBeenCalledWith('tab-budget', { name: 'Costs' }));
    await user.press(screen.getByRole('tab', { name: 'Budget' }));
    await user.press(screen.getByRole('button', { name: 'Remove this tab' }));
    await user.press(screen.getByRole('button', { name: 'Remove the tab' }));
    await waitFor(() => expect(removeSheetTab).toHaveBeenCalledWith('tab-budget'));
    // It goes on to another tab, and doesn't ask for the one that is gone.
    await waitFor(() => expect(mockCache.sheetTabRemoved).toHaveBeenCalledWith(expect.objectContaining({ id: SHEET_ID }), 'tab-budget'));
    expect(asked).toHaveBeenLastCalledWith(SHEET_ID, { tab: 'tab-days', limit: 100, day: '2026-11-12' }, expect.anything());
  });

  it('keeps the rest behind the three dots: its name, a new tile, deleting it', async () => {
    jest.mocked(changeSheet).mockResolvedValue(sheet({ title: 'Norway 2027' }));
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(inApp(<Sheet />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Rename the sheet' }));
    await fireEvent.changeText(screen.getByLabelText('Name of the sheet'), 'Norway 2027');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeSheet).toHaveBeenCalledWith(SHEET_ID, { title: 'Norway 2027' }));
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Add a tile on top' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/money/formula', params: { sheet: SHEET_ID, tab: 'tab-budget', as: 'tile' } });
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Delete the sheet' }));
    expect(screen.getByRole('header', { name: 'Delete this sheet?' })).toBeOnTheScreen();
    await user.press(screen.getAllByRole('button', { name: 'Delete the sheet' }).pop()!);
    await waitFor(() => expect(deleteThing).toHaveBeenCalledWith(SHEET_ID));
    await waitFor(() => expect(mockCache.thingDeleted).toHaveBeenCalled());
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('shows a cell that cannot be worked out as a warning that says why, and a tile too', async () => {
    const broken = column({ id: 'col-each', name: 'Each', kind: 'formula', formula: '[Cost] / [Item]', says: 'Cost divided by Item.' });
    const withProblem = rows.map((row) => ({ ...row, cells: { ...row.cells, 'col-each': cell.problem('Item holds words, not a number') } }));
    asked.mockReturnValue(loaded(sheet({ tab: { ...sheet().tab, columns: [...columns, broken], rows: withProblem, tiles: [{ ...sheet().tab.tiles[0]!, cell: cell.problem('Cost is empty') }] } })));
    await render(inApp(<Sheet />));
    expect(screen.getAllByLabelText('Item holds words, not a number')).toHaveLength(6);
    expect(screen.getByRole('button', { name: "Planned: Can't be worked out. Change this tile" })).toBeOnTheScreen();
  });

  it('brings the rows after the first hundred a page at a time', async () => {
    asked.mockReturnValue(loaded(sheet({ tab: { ...sheet().tab, rowCount: 101, nextRows: 'cursor-100' } })));
    const view = await render(inApp(<Sheet />));
    expect(further).toHaveBeenLastCalledWith(SHEET_ID, { tab: 'tab-budget', limit: 100, day: '2026-11-12' }, { query: expect.objectContaining({ initialPageParam: 'cursor-100', enabled: false }) });
    further.mockReturnValue({ ...loaded({ pages: [{ items: [sheetRow(7, 'Souvenirs', [], 9000, false)], nextCursor: null }], pageParams: ['cursor-100'] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    await userEvent.setup().press(screen.getByRole('button', { name: 'Show more rows' }));
    await view.rerender(inApp(<Sheet />));
    expect(further).toHaveBeenLastCalledWith(SHEET_ID, expect.anything(), { query: expect.objectContaining({ enabled: true }) });
    expect(screen.getByRole('button', { name: 'Row 7: Souvenirs. Open as a card' })).toBeOnTheScreen();
  });

  it('only shows a sheet to someone who may not change it', async () => {
    asked.mockReturnValue(loaded(sheet({ canEdit: false, mine: false })));
    await render(inApp(<Sheet />));
    expect(screen.getByText('You can read this sheet, but not change it.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add a row' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a column' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Paid, row 1' })).toBeNull();
    expect(screen.getByLabelText('Planned: €7,640')).toBeOnTheScreen();
    // A row still opens as a card, to read.
    expect(screen.getByRole('button', { name: 'Row 1: Flights. Open as a card' })).toBeOnTheScreen();
  });

  it('keeps its Back while it loads, and says so when the sheet is not there', async () => {
    asked.mockReturnValue(pending());
    const view = await render(inApp(<Sheet />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await view.rerender(inApp(<Sheet />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
  });
});
