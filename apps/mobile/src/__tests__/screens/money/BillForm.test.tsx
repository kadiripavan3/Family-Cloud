import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { changeBill, createBill, useGetBill } from '@/api/generated/homeport';
import ChangeBill from '@/app/(app)/money/bill';
import NewBill from '@/app/(app)/new/bill';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { bill, BILL_ID, onThe12th } from '@/test/samples/money';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { billMade: jest.fn(() => Promise.resolve()), billSaved: jest.fn(() => Promise.resolve()) };
let mockParams: { id?: string; audience?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, usePreventRemove: jest.fn(() => jest.fn()) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds] }));
jest.mock('@/api/generated/homeport', () => ({ createBill: jest.fn(), changeBill: jest.fn(), useGetBill: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => 'client-1') }));

const mockLinds = linds;
const asked = jest.mocked(useGetBill) as unknown as jest.Mock;

describe('adding a bill by hand, and changing one', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onThe12th();
    mockParams = {};
  });
  afterEach(() => jest.useRealTimers());
  const user = () => userEvent.setup();

  it('adds one in the current circle: what it is, how much in whole cents, how it comes, and who pays', async () => {
    const made = bill();
    jest.mocked(createBill).mockResolvedValue(made);
    await render(inApp(<NewBill />));
    const press = user();
    expect(screen.getByRole('header', { name: 'New bill' })).toBeOnTheScreen();
    // Nothing to add yet.
    expect(screen.getByRole('button', { name: 'Add bill' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('What is it'), 'Electricity');
    await fireEvent.changeText(screen.getByLabelText('Who to pay'), 'Elektro Ljubljana');
    await press.type(screen.getByLabelText('Amount'), '84,20');
    expect(screen.getByRole('button', { name: 'Due: Thu 12 Nov. Change' })).toBeOnTheScreen();
    await press.press(screen.getByRole('radio', { name: 'Every month' }));
    // Only the people who can pay are offered: the two adults, not the children or the dog.
    expect(screen.getByRole('checkbox', { name: 'I pay all of it', checked: true })).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'Split with Mia' })).toBeNull();
    await press.press(screen.getByRole('checkbox', { name: 'Split with Alex' }));
    await press.press(screen.getByRole('button', { name: 'Add bill' }));
    await waitFor(() =>
      expect(createBill).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'client-1',
          circleId: 'c-linds',
          title: 'Electricity',
          payee: 'Elektro Ljubljana',
          amountCents: 8420,
          dueOn: '2026-11-12',
          repeat: 'monthly',
          subscription: false,
          pays: 'by_hand',
          remindDays: 2,
          // A family's new thing is its maker's alone until it is shared.
          audience: 'me',
          shares: [
            { memberId: 'm-nora', weight: 1 },
            { memberId: 'm-alex', weight: 1 },
          ],
        }),
      ),
    );
    await waitFor(() => expect(mockCache.billMade).toHaveBeenCalledWith(made));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'bill', id: BILL_ID } });
  });

  it('leaves the shares out when the person pays all of it, and takes who sees it from the + sheet', async () => {
    mockParams = { audience: 'circle' };
    jest.mocked(createBill).mockResolvedValue(bill());
    await render(inApp(<NewBill />));
    const press = user();
    expect(screen.getByRole('button', { name: 'Seen by The Linds. Change' })).toBeOnTheScreen();
    await press.type(screen.getByLabelText('What is it'), 'Rent');
    await press.type(screen.getByLabelText('Amount'), '980');
    await press.press(screen.getByRole('radio', { name: 'Standing order' }));
    await press.press(screen.getByRole('radio', { name: 'No reminder' }));
    await press.press(screen.getByRole('switch', { name: 'A subscription' }));
    await press.press(screen.getByRole('button', { name: 'Add bill' }));
    await waitFor(() => expect(createBill).toHaveBeenCalled());
    const sent = jest.mocked(createBill).mock.calls[0]![0];
    expect(sent).toMatchObject({ title: 'Rent', amountCents: 98000, repeat: 'once', pays: 'standing_order', subscription: true, audience: 'circle' });
    expect(sent.shares).toBeUndefined();
    expect(sent.remindDays).toBeUndefined();
  });

  it('says so when the amount is not a number, and shows what the API says about a field', async () => {
    jest.mocked(createBill).mockRejectedValue(new ApiError(400, 'invalid_input', 'Some details need another look.', { title: 'Give the bill a name, or say who it is paid to.' }));
    await render(inApp(<NewBill />));
    const press = user();
    await press.type(screen.getByLabelText('What is it'), 'x');
    await press.type(screen.getByLabelText('Amount'), 'soon');
    expect(screen.getByText('Write the amount as a number, like 84.20.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add bill' })).toBeDisabled();
    await press.clear(screen.getByLabelText('Amount'));
    await press.type(screen.getByLabelText('Amount'), '12');
    await press.press(screen.getByRole('button', { name: 'Add bill' }));
    expect(await screen.findByText('Give the bill a name, or say who it is paid to.')).toBeOnTheScreen();
  });

  it('offers scanning a letter instead', async () => {
    await render(inApp(<NewBill />));
    await user().press(screen.getByRole('button', { name: 'Scan a letter instead' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/money/scan');
  });

  it('changes a bill from what it holds now, and only sends who pays when that was changed', async () => {
    mockParams = { id: BILL_ID };
    asked.mockReturnValue(loaded(bill()));
    const saved = bill({ remindDays: 7 });
    jest.mocked(changeBill).mockResolvedValue(saved);
    await render(inApp(<ChangeBill />));
    const press = user();
    expect(asked).toHaveBeenCalledWith(BILL_ID);
    expect(screen.getByRole('header', { name: 'Change the bill' })).toBeOnTheScreen();
    expect(screen.getByLabelText('What is it').props.value).toBe('Electricity');
    expect(screen.getByLabelText('Amount').props.value).toBe('84.20');
    expect(screen.getByRole('radio', { name: 'Every month', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: '2 days before', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Split with Alex', checked: true })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Scan a letter instead' })).toBeNull();
    await press.press(screen.getByRole('radio', { name: 'A week before' }));
    await press.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeBill).toHaveBeenCalledWith(BILL_ID, expect.objectContaining({ title: 'Electricity', amountCents: 8420, dueOn: '2026-11-13', remindDays: 7 })));
    expect(jest.mocked(changeBill).mock.calls[0]![1].shares).toBeUndefined();
    await waitFor(() => expect(mockCache.billSaved).toHaveBeenCalledWith(saved));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('takes the reminder off, and shares it out again when who pays was changed', async () => {
    mockParams = { id: BILL_ID };
    asked.mockReturnValue(loaded(bill()));
    jest.mocked(changeBill).mockResolvedValue(bill());
    await render(inApp(<ChangeBill />));
    const press = user();
    await press.press(screen.getByRole('radio', { name: 'No reminder' }));
    await press.press(screen.getByRole('checkbox', { name: 'Split with Alex' }));
    await press.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeBill).toHaveBeenCalledWith(BILL_ID, expect.objectContaining({ removeReminder: true, shares: [{ memberId: 'm-nora', weight: 1 }] })));
  });

  it('keeps its Close while the bill loads, and says so when it is not there', async () => {
    mockParams = { id: BILL_ID };
    asked.mockReturnValue(pending());
    const view = await render(inApp(<ChangeBill />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await view.rerender(inApp(<ChangeBill />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
  });
});
