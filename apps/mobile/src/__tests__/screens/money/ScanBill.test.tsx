import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addSplitExpense, createBill, getBill, readBill, useGetBill, useGetSplit } from '@/api/generated/homeport';
import ScanBill from '@/app/(app)/money/scan';
import { keepLetter, pickPaper } from '@/features/money/pick';
import { inApp } from '@/test/phone';
import { linds, loaded, thing } from '@/test/samples';
import { bill, BILL_ID, onThe12th, reading, split, SPLIT_ID } from '@/test/samples/money';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { billMade: jest.fn(() => Promise.resolve()), billLinked: jest.fn(() => Promise.resolve()), splitChanged: jest.fn(() => Promise.resolve()) };
let mockParams: { bill?: string; split?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, useIsFocused: () => true }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds] }));
jest.mock('@/api/generated/homeport', () => ({ readBill: jest.fn(), createBill: jest.fn(), getBill: jest.fn(), addSplitExpense: jest.fn(), useGetBill: jest.fn(), useGetSplit: jest.fn() }));
jest.mock('@/features/money/pick', () => ({
  pickPaper: jest.fn(),
  keepLetter: jest.fn(() => Promise.resolve()),
  // The same lines the real one sends: what was typed, without the empty ones.
  readRequest: (typed: string) => ({ text: typed, lines: typed.split('\n').filter(Boolean), day: '2026-11-12' }),
}));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => 'client-1') }));

const mockLinds = linds;
const LINES = 'Elektro Ljubljana d.d.\n\nZa plačilo: 84,20 EUR\nRok plačila: 13.11.2026';
const photo = { uri: 'file:///letter.jpg', width: 800, height: 1000 };

describe('8.3 Scan a bill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onThe12th();
    mockParams = {};
    jest.mocked(useGetBill).mockReturnValue(loaded(undefined) as never);
    jest.mocked(useGetSplit).mockReturnValue(loaded(undefined) as never);
    jest.mocked(readBill).mockResolvedValue(reading());
  });
  afterEach(() => jest.useRealTimers());
  const user = () => userEvent.setup();
  /** Types the lines and has them read. */
  const read = async (press: ReturnType<typeof user>) => {
    // (Pasted in one go, as lines are.)
    await fireEvent.changeText(screen.getByLabelText('The lines on the paper'), LINES);
    await press.press(screen.getByRole('button', { name: 'Read it' }));
    await screen.findByRole('header', { name: 'Is this right?' });
  };

  it('stands in for the camera: a picture is picked, and the lines are typed or pasted', async () => {
    jest.mocked(pickPaper).mockResolvedValue(photo);
    await render(inApp(<ScanBill />));
    const press = user();
    expect(screen.getByText('Pick a picture')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'What does it say?' })).toBeOnTheScreen();
    expect(screen.getByText(/^On a phone the camera reads the words off the paper\./)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Read it' })).toBeDisabled();
    await press.press(screen.getByRole('button', { name: 'Pick a picture of the paper' }));
    expect(await screen.findByText('Type what it says')).toBeOnTheScreen();
  });

  it('shows what was read, each with the line it came from', async () => {
    await render(inApp(<ScanBill />));
    await read(user());
    expect(readBill).toHaveBeenCalledWith({ text: LINES, lines: ['Elektro Ljubljana d.d.', 'Za plačilo: 84,20 EUR', 'Rok plačila: 13.11.2026'], day: '2026-11-12' });
    expect(screen.getByLabelText('Who to pay').props.value).toBe('Elektro Ljubljana');
    expect(screen.getByText('Read from “Elektro Ljubljana d.d.”')).toBeOnTheScreen();
    expect(screen.getByLabelText('Read off the paper')).toBeOnTheScreen();
    // The amount stands as money until it is tapped to be corrected.
    expect(screen.getByLabelText('Amount').props.value).toBe('€84.20');
    expect(screen.getByText('Read from “Za plačilo: 84,20 EUR”')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Due: 13 Nov. Change' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Reference').props.value).toBe('SI12 3456 7890 1184');
    expect(screen.getByLabelText('IBAN').props.value).toBe('SI56 2633 0001 2039 086');
    // A utility comes every month; whether it is split is the person's to say.
    expect(screen.getByRole('checkbox', { name: 'Comes every month', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Split with Alex', checked: false })).toBeOnTheScreen();
  });

  it('adds the bill with what was corrected and chosen', async () => {
    const made = bill();
    jest.mocked(createBill).mockResolvedValue(made);
    await render(inApp(<ScanBill />));
    const press = user();
    await read(press);
    await press.clear(screen.getByLabelText('Amount'));
    await press.type(screen.getByLabelText('Amount'), '84.90');
    await press.press(screen.getByRole('checkbox', { name: 'Split with Alex' }));
    await press.press(screen.getByRole('button', { name: 'Add bill' }));
    await waitFor(() =>
      expect(createBill).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'client-1',
          circleId: 'c-linds',
          title: 'Electricity',
          payee: 'Elektro Ljubljana',
          emoji: '⚡',
          amountCents: 8490,
          currency: 'EUR',
          dueOn: '2026-11-13',
          repeat: 'monthly',
          reference: 'SI12 3456 7890 1184',
          shares: [
            { memberId: 'm-nora', weight: 1 },
            { memberId: 'm-alex', weight: 1 },
          ],
        }),
      ),
    );
    // No picture was picked, so there is none to keep.
    expect(keepLetter).not.toHaveBeenCalled();
    await waitFor(() => expect(mockCache.billMade).toHaveBeenCalledWith(made));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'bill', id: BILL_ID } });
  });

  it('keeps the picture with the bill, as its invoice', async () => {
    const invoice = thing({ kind: 'document' as never, place: 'library', title: 'Invoice, November' });
    const withInvoice = bill({ invoice, links: [invoice] });
    jest.mocked(pickPaper).mockResolvedValue(photo);
    jest.mocked(createBill).mockResolvedValue(bill());
    jest.mocked(getBill).mockResolvedValue(withInvoice);
    await render(inApp(<ScanBill />));
    const press = user();
    await press.press(screen.getByRole('button', { name: 'Pick a picture of the paper' }));
    await screen.findByText('Type what it says');
    await read(press);
    expect(screen.getByText('Check what was read')).toBeOnTheScreen();
    await press.press(screen.getByRole('button', { name: 'Add bill' }));
    await waitFor(() => expect(keepLetter).toHaveBeenCalledWith({ photo, billId: BILL_ID, circleId: 'c-linds', title: 'Invoice, November', text: LINES, audience: 'me' }, 'client-1'));
    // The bill is shown as it is once the picture is linked to it.
    await waitFor(() => expect(mockCache.billMade).toHaveBeenCalledWith(withInvoice));
  });

  it('says what was not found on the paper, and waits for it to be typed in', async () => {
    jest.mocked(readBill).mockResolvedValue(reading({ amountCents: null, iban: null, repeat: null }));
    await render(inApp(<ScanBill />));
    const press = user();
    await read(press);
    expect(screen.getByText('Not found on the paper. Type it in.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('IBAN')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Comes every month', checked: false })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add bill' })).toBeDisabled();
    await press.type(screen.getByLabelText('Amount'), '12.50');
    expect(screen.getByRole('button', { name: 'Add bill' })).not.toBeDisabled();
    // Back to the lines, to read them again.
    await press.press(screen.getByRole('button', { name: 'Change the lines' }));
    expect(screen.getByRole('header', { name: 'What does it say?' })).toBeOnTheScreen();
  });

  it('says what went wrong when the lines could not be read', async () => {
    jest.mocked(readBill).mockRejectedValue(new ApiError(400, 'invalid_input', 'That is too much text for one bill.'));
    await render(inApp(<ScanBill />));
    const press = user();
    await fireEvent.changeText(screen.getByLabelText('The lines on the paper'), LINES);
    await press.press(screen.getByRole('button', { name: 'Read it' }));
    expect(await screen.findByText('That is too much text for one bill.')).toBeOnTheScreen();
  });

  it('reads a receipt into a split: what it was, how much, shared by everyone', async () => {
    mockParams = { split: SPLIT_ID };
    jest.mocked(useGetSplit).mockReturnValue(loaded(split()) as never);
    jest.mocked(readBill).mockResolvedValue(reading({ payee: { value: 'Pastelaria Santo António', line: 'Pastelaria Santo António', lineNumber: 0 }, amountCents: { value: 550, line: 'Total 5,50 EUR', lineNumber: 3 }, dueOn: null, iban: null, reference: null, repeat: null, title: 'Pastelaria Santo António', emoji: '🧾' }));
    jest.mocked(addSplitExpense).mockResolvedValue({} as never);
    await render(inApp(<ScanBill />));
    const press = user();
    await read(press);
    expect(screen.getByLabelText('What was it').props.value).toBe('Pastelaria Santo António');
    expect(screen.queryByLabelText('Reference')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Comes every month' })).toBeNull();
    await press.press(screen.getByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(addSplitExpense).toHaveBeenCalledWith(SPLIT_ID, { clientId: 'client-1', title: 'Pastelaria Santo António', emoji: '🧾', amountCents: 550, spentOn: '2026-11-12' }, { day: '2026-11-12' }));
    await waitFor(() => expect(mockCache.splitChanged).toHaveBeenCalled());
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('keeps the picture of a letter with a bill that is there already', async () => {
    mockParams = { bill: BILL_ID };
    jest.mocked(useGetBill).mockReturnValue(loaded(bill()) as never);
    jest.mocked(pickPaper).mockResolvedValue(photo);
    await render(inApp(<ScanBill />));
    const press = user();
    expect(screen.getByRole('header', { name: 'The letter for Electricity' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Keep with the bill' })).toBeDisabled();
    await press.press(screen.getByRole('button', { name: 'Pick a picture of the paper' }));
    await screen.findByText('Picked. It is kept in the Library, linked to this bill.');
    await press.press(screen.getByRole('button', { name: 'Keep with the bill' }));
    // The whole circle sees the bill, so it sees its letter too.
    await waitFor(() => expect(keepLetter).toHaveBeenCalledWith({ photo, billId: BILL_ID, circleId: 'c-linds', title: 'Invoice, November', audience: 'circle' }, 'client-1'));
    await waitFor(() => expect(mockCache.billLinked).toHaveBeenCalled());
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
