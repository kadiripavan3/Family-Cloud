import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { uploadPhoto } from '@/api/upload';
import { addSheetRowPaper, changeSheetRow, removeSheetRowPaper, useGetSheetRow } from '@/api/generated/homeport';
import SheetRow from '@/app/(app)/money/row/[id]';
import { pickPaper } from '@/features/money/pick';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { cell, column, columns, onThe12th, rowCard, rowChanged, rows, SHEET_ID } from '@/test/samples/money';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { sheetRowSaved: jest.fn(() => Promise.resolve()), sheetChanged: jest.fn(() => Promise.resolve()) };
let mockId = '66666666-6666-4666-8666-666666666663';
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds] }));
jest.mock('@/features/money/pick', () => ({ pickPaper: jest.fn() }));
jest.mock('@/api/upload', () => ({ uploadPhoto: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({
  useGetSheetRow: jest.fn(),
  useGetThing: jest.fn(() => mockThing),
  getGetSheetRowQueryKey: (rowId: string, params: unknown) => [`/v1/sheet-rows/${rowId}`, params],
  changeSheetRow: jest.fn(),
  addSheetRowPaper: jest.fn(),
  removeSheetRowPaper: jest.fn(),
}));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => 'client-1') }));

const mockLinds = linds;
const mockThing = loaded({ id: SHEET_ID, circleId: 'c-linds' });
const asked = jest.mocked(useGetSheetRow) as unknown as jest.Mock;
const DAY = { day: '2026-11-12' };
const ROW = rows[2]!.id;
const WHERE = { id: SHEET_ID, circleId: 'c-linds' };

describe('8.6 A row, as a card', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onThe12th();
    mockId = ROW;
    asked.mockReturnValue(loaded(rowCard()));
    jest.mocked(changeSheetRow).mockResolvedValue(rowChanged(rows[2]!));
  });
  afterEach(() => jest.useRealTimers());

  it('says which row of how many, and shows every column as a box of its own kind', async () => {
    await render(inApp(<SheetRow />));
    expect(asked).toHaveBeenCalledWith(ROW, DAY);
    expect(screen.getByRole('header', { name: 'Row 3 of 6' })).toBeOnTheScreen();
    expect(screen.getByText('Norway budget')).toBeOnTheScreen();
    expect(screen.getByLabelText('Item').props.value).toBe('Cabins, 9 nights');
    // Money reads as money until its box is tapped.
    expect(screen.getByLabelText('Cost').props.value).toBe('€2,350.00');
    expect(screen.getByRole('button', { name: 'Who: Alex. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Due: 15 Jan 2027. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Paid', checked: false })).toBeOnTheScreen();
    expect(screen.getByText('Not yet')).toBeOnTheScreen();
    expect(screen.getByLabelText('Note').props.value).toBe('€470 deposit paid on 2 Nov. The rest is due six weeks before we go.');
    expect(screen.getByText('Receipts and papers')).toBeOnTheScreen();
  });

  it('saves a box when it is left, with only that cell: money as whole cents', async () => {
    await render(inApp(<SheetRow />));
    const cost = screen.getByLabelText('Cost');
    await fireEvent(cost, 'focus');
    // Tapped, the box holds plain digits to type over.
    expect(screen.getByLabelText('Cost').props.value).toBe('2350.00');
    await fireEvent.changeText(cost, '2400,5');
    await fireEvent(cost, 'blur');
    await waitFor(() => expect(changeSheetRow).toHaveBeenCalledWith(ROW, { cells: { 'col-cost': 240050 } }, DAY));
    expect(changeSheetRow).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockCache.sheetRowSaved).toHaveBeenCalledWith(WHERE, 'tab-budget', expect.objectContaining({ rowCount: 6 })));
  });

  it("doesn't save a box that was left as it was, says so when money isn't a number, and empties a cell that is cleared", async () => {
    await render(inApp(<SheetRow />));
    const cost = screen.getByLabelText('Cost');
    await fireEvent(cost, 'focus');
    await fireEvent(cost, 'blur');
    expect(changeSheetRow).not.toHaveBeenCalled();
    await fireEvent(cost, 'focus');
    await fireEvent.changeText(cost, 'lots');
    await fireEvent(cost, 'blur');
    expect(screen.getByText('Write the amount as a number, like 84.20.')).toBeOnTheScreen();
    expect(changeSheetRow).not.toHaveBeenCalled();
    await fireEvent(cost, 'focus');
    await fireEvent.changeText(cost, '');
    await fireEvent(cost, 'blur');
    await waitFor(() => expect(changeSheetRow).toHaveBeenCalledWith(ROW, { cells: { 'col-cost': null } }, DAY));
  });

  it('changes words, the note, and a tick with its switch', async () => {
    await render(inApp(<SheetRow />));
    const user = userEvent.setup();
    await fireEvent.changeText(screen.getByLabelText('Item'), 'Cabins, 10 nights ');
    await fireEvent(screen.getByLabelText('Item'), 'blur');
    await waitFor(() => expect(changeSheetRow).toHaveBeenCalledWith(ROW, { cells: { 'col-item': 'Cabins, 10 nights' } }, DAY));
    await fireEvent.changeText(screen.getByLabelText('Note'), 'All paid.');
    await fireEvent(screen.getByLabelText('Note'), 'blur');
    await waitFor(() => expect(changeSheetRow).toHaveBeenCalledWith(ROW, { note: 'All paid.' }, DAY));
    await user.press(screen.getByRole('switch', { name: 'Paid' }));
    await waitFor(() => expect(changeSheetRow).toHaveBeenCalledWith(ROW, { cells: { 'col-paid': true } }, DAY));
  });

  it('picks a day from the calendar and people from the circle', async () => {
    await render(inApp(<SheetRow />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Due: 15 Jan 2027. Change' }));
    expect(screen.getByText('January 2027')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '20 January 2027' }));
    await waitFor(() => expect(changeSheetRow).toHaveBeenCalledWith(ROW, { cells: { 'col-due': '2027-01-20' } }, DAY));
    await user.press(screen.getByRole('button', { name: 'Who: Alex. Change' }));
    expect(screen.getByRole('checkbox', { name: 'Alex', checked: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('checkbox', { name: 'Nora', checked: false }));
    // (The sheet's own Done, not the one in the bar that leaves the card.)
    await user.press(screen.getAllByRole('button', { name: 'Done' }).pop()!);
    await waitFor(() => expect(changeSheetRow).toHaveBeenCalledWith(ROW, { cells: { 'col-who': ['m-alex', 'm-nora'] } }, DAY));
  });

  it('picks one of a few for a choice, types a number, and shows a formula as its answer or as why it has none', async () => {
    const extra = [column({ id: 'col-state', name: 'State', kind: 'choice', options: ['Booked', 'To book'] }), column({ id: 'col-nights', name: 'Nights', kind: 'number' }), column({ id: 'col-each', name: 'Each night', kind: 'formula', formula: '[Cost] / [Nights]', says: 'Cost divided by Nights.' })];
    const row = { ...rows[2]!, cells: { ...rows[2]!.cells, 'col-state': cell.text('To book'), 'col-nights': cell.empty(), 'col-each': cell.problem('Nights is empty') } };
    asked.mockReturnValue(loaded(rowCard({ columns: [...columns, ...extra], row })));
    await render(inApp(<SheetRow />));
    const user = userEvent.setup();
    // A cell that can't be worked out says why, in the API's words; and what its formula does stands under it.
    expect(screen.getByText('Nights is empty')).toBeOnTheScreen();
    expect(screen.getByText('Cost divided by Nights.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'State: To book. Change' }));
    await user.press(screen.getByRole('button', { name: 'Booked' }));
    await waitFor(() => expect(changeSheetRow).toHaveBeenCalledWith(ROW, { cells: { 'col-state': 'Booked' } }, DAY));
    const nights = screen.getByLabelText('Nights');
    await fireEvent.changeText(nights, 'nine');
    await fireEvent(nights, 'blur');
    expect(screen.getByText('That takes a number.')).toBeOnTheScreen();
    await fireEvent.changeText(nights, '9');
    await fireEvent(nights, 'blur');
    await waitFor(() => expect(changeSheetRow).toHaveBeenCalledWith(ROW, { cells: { 'col-nights': '9' } }, DAY));
  });

  it('keeps receipts and papers with the row: one goes up through the upload, one comes off after asking', async () => {
    jest.mocked(pickPaper).mockResolvedValue({ uri: 'file:///receipt.jpg', width: 600, height: 800 });
    jest.mocked(uploadPhoto).mockResolvedValue('media-2');
    jest.mocked(addSheetRowPaper).mockResolvedValue(rowCard());
    jest.mocked(removeSheetRowPaper).mockResolvedValue(undefined);
    await render(inApp(<SheetRow />));
    const user = userEvent.setup();
    expect(screen.getByLabelText('Paper 1')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Add a receipt or a paper' }));
    await waitFor(() => expect(addSheetRowPaper).toHaveBeenCalledWith(ROW, { clientId: 'client-1', mediaId: 'media-2' }));
    expect(uploadPhoto).toHaveBeenCalledWith({ uri: 'file:///receipt.jpg', width: 600, height: 800 });
    await user.press(screen.getByRole('button', { name: 'Remove paper 1' }));
    expect(screen.getByRole('header', { name: 'Remove this paper?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remove it' }));
    await waitFor(() => expect(removeSheetRowPaper).toHaveBeenCalledWith(ROW, 'media-1'));
    await waitFor(() => expect(mockCache.sheetChanged).toHaveBeenCalledWith(WHERE));
  });

  it('goes to the row before and the row after, and Done leaves', async () => {
    await render(inApp(<SheetRow />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Previous row: Rail passes' }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith({ pathname: '/money/row/[id]', params: { id: rows[1]!.id } });
    await user.press(screen.getByRole('button', { name: 'Next row: Ferries' }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith({ pathname: '/money/row/[id]', params: { id: rows[3]!.id } });
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('only shows the row to someone who may not change it', async () => {
    asked.mockReturnValue(loaded(rowCard({ canEdit: false, previous: null })));
    await render(inApp(<SheetRow />));
    expect(screen.getByText('You can read this row, but not change it.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Cost')).toBeNull();
    expect(screen.getByText('€2,350.00')).toBeOnTheScreen();
    expect(screen.queryByRole('switch', { name: 'Paid' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a receipt or a paper' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove paper 1' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Previous row/ })).toBeNull();
  });

  it('says what the API says when a cell is refused', async () => {
    jest.mocked(changeSheetRow).mockRejectedValue(new ApiError(400, 'wrong_kind', "Cost can't hold an amount that large."));
    await render(inApp(<SheetRow />));
    await userEvent.setup().press(screen.getByRole('switch', { name: 'Paid' }));
    expect(await screen.findByText("Cost can't hold an amount that large.")).toBeOnTheScreen();
  });

  it('keeps its Back while it loads, and says so when the row is not there', async () => {
    asked.mockReturnValue(pending());
    const view = await render(inApp(<SheetRow />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await view.rerender(inApp(<SheetRow />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
  });
});
