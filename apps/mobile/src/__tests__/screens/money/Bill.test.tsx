import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { deleteThing, markBillPaid, useGetBill } from '@/api/generated/homeport';
import Bill from '@/app/(app)/bill/[id]';
import { copyText } from '@/lib/share';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending, thing } from '@/test/samples';
import { alexBrief, bill, BILL_ID, onThe12th, share } from '@/test/samples/money';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { billSaved: jest.fn(() => Promise.resolve()), thingDeleted: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: ({ visible }: { visible: boolean }) => mockSheet(visible) }));
jest.mock('@/lib/share', () => ({ copyText: jest.fn(() => Promise.resolve(true)) }));
jest.mock('@/api/generated/homeport', () => ({ useGetBill: jest.fn(), useGetMe: jest.fn(() => mockMe), markBillPaid: jest.fn(), deleteThing: jest.fn() }));

const mockId = '33333333-3333-4333-8333-333333333333';
const mockLinds = linds;
const mockMe = loaded(me());
function mockSheet(visible: boolean) {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return visible ? <Text>the audience sheet</Text> : null;
}
const asked = jest.mocked(useGetBill) as unknown as jest.Mock;
const mark = jest.mocked(markBillPaid);

describe('8.2 A bill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onThe12th();
    asked.mockReturnValue(loaded(bill()));
  });
  afterEach(() => jest.useRealTimers());
  const user = () => userEvent.setup();

  it('shows what is due and when, and whether the person\'s own half is paid', async () => {
    await render(inApp(<Bill />));
    expect(asked).toHaveBeenCalledWith(BILL_ID);
    expect(screen.getByRole('header', { name: 'Electricity' })).toBeOnTheScreen();
    expect(screen.getByText('Elektro Ljubljana')).toBeOnTheScreen();
    expect(screen.getByText('€84.20')).toBeOnTheScreen();
    expect(screen.getByText('Due tomorrow, Fri 13 Nov')).toBeOnTheScreen();
    expect(screen.getByText("Your half isn't paid yet")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mark my half as paid' })).toBeOnTheScreen();
  });

  it('draws the last six as bars, with what it usually comes to, and says when this one is more', async () => {
    const view = await render(inApp(<Bill />));
    expect(screen.getByText('The last six')).toBeOnTheScreen();
    expect(screen.getByText('usually about €63')).toBeOnTheScreen();
    expect(screen.getByLabelText('Jun: €52.30')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nov: €84.20')).toBeOnTheScreen();
    expect(screen.getByText('52')).toBeOnTheScreen();
    expect(screen.getByText('84')).toBeOnTheScreen();
    expect(screen.getByText('More than usual this time')).toBeOnTheScreen();
    // One that is about what it usually is says nothing of the kind, and one with no past has no bars.
    asked.mockReturnValue(loaded(bill({ amountCents: 6400 })));
    await view.rerender(inApp(<Bill />));
    expect(screen.queryByText('More than usual this time')).toBeNull();
    asked.mockReturnValue(loaded(bill({ history: [bill().history[5]!], usualCents: null })));
    await view.rerender(inApp(<Bill />));
    expect(screen.queryByText('The last one')).toBeNull();
    expect(screen.queryByText(/^usually about/)).toBeNull();
  });

  it('says who pays what and how it comes round', async () => {
    await render(inApp(<Bill />));
    expect(screen.getByRole('button', { name: 'Split 50/50 with Alex. €42.10 each · Alex has paid' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Every month, around the 13th. Reminds you 2 days before' })).toBeOnTheScreen();
  });

  it("marks the person's half as paid with the day it was due, so a second tap pays nothing twice", async () => {
    const saved = bill({ shares: [share({ paid: true }), bill().shares[1]!] });
    mark.mockResolvedValue(saved);
    await render(inApp(<Bill />));
    await user().press(screen.getByRole('button', { name: 'Mark my half as paid' }));
    await waitFor(() => expect(mark).toHaveBeenCalledWith(BILL_ID, { dueOn: '2026-11-13' }));
    await waitFor(() => expect(mockCache.billSaved).toHaveBeenCalledWith(saved));
  });

  it('takes it back when the half is paid and the others are not', async () => {
    const open = share({ person: alexBrief, you: false });
    asked.mockReturnValue(loaded(bill({ shares: [share({ paid: true }), open] })));
    mark.mockResolvedValue(bill({ shares: [share(), open] }));
    await render(inApp(<Bill />));
    expect(screen.getByText('Your half is paid')).toBeOnTheScreen();
    expect(screen.getByText("€42.10 each · Alex hasn't paid yet")).toBeOnTheScreen();
    await user().press(screen.getByRole('button', { name: 'Not paid after all' }));
    await waitFor(() => expect(mark).toHaveBeenCalledWith(BILL_ID, { dueOn: '2026-11-13', paid: false }));
  });

  it('says that a bill that comes round is due again once the last half is paid, and takes that back for the day that was paid', async () => {
    const next = bill({ dueOn: '2026-12-13', shares: [share(), share({ person: alexBrief, you: false })] });
    mark.mockResolvedValue(next);
    const view = await render(inApp(<Bill />));
    await user().press(screen.getByRole('button', { name: 'Mark my half as paid' }));
    await waitFor(() => expect(mockCache.billSaved).toHaveBeenCalledWith(next));
    asked.mockReturnValue(loaded(next));
    await view.rerender(inApp(<Bill />));
    expect(screen.getByText('Paid. It is due again on Sun 13 Dec.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Mark my half as paid' })).toBeNull();
    await user().press(screen.getByRole('button', { name: 'Take it back' }));
    await waitFor(() => expect(mark).toHaveBeenLastCalledWith(BILL_ID, { dueOn: '2026-11-13', paid: false }));
  });

  it("marks one person's part, or all of it, on the sheet that says who pays what", async () => {
    asked.mockReturnValue(loaded(bill({ shares: [share(), share({ person: alexBrief, you: false })] })));
    mark.mockResolvedValue(bill());
    await render(inApp(<Bill />));
    const press = user();
    await press.press(screen.getByRole('button', { name: /^Split 50\/50 with Alex/ }));
    expect(screen.getByRole('header', { name: 'Who pays what' })).toBeOnTheScreen();
    expect(screen.getAllByText('€42.10 · Not paid yet')).toHaveLength(2);
    await press.press(screen.getByRole('button', { name: "Mark Alex's part as paid" }));
    await waitFor(() => expect(mark).toHaveBeenCalledWith(BILL_ID, { dueOn: '2026-11-13', memberId: 'm-alex', paid: true }));
    await press.press(screen.getByRole('button', { name: 'Mark all of it as paid' }));
    await waitFor(() => expect(mark).toHaveBeenLastCalledWith(BILL_ID, { dueOn: '2026-11-13', everyone: true }));
  });

  it('opens its login and its invoice when it has them', async () => {
    const login = thing({ id: 'aaaaaaaa-1111-4111-8111-111111111111', kind: 'vault_item' as never, place: 'vault', title: 'Elektro' });
    const invoice = thing({ id: 'bbbbbbbb-1111-4111-8111-111111111111', kind: 'document' as never, place: 'library', title: 'Invoice, November' });
    asked.mockReturnValue(loaded(bill({ login, invoice, links: [login, invoice] })));
    await render(inApp(<Bill />));
    const press = user();
    await press.press(screen.getByRole('button', { name: 'Log in to Elektro. From the Vault · opens signed in' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'vault-item', id: login.id } });
    await press.press(screen.getByRole('button', { name: 'Invoice, November. Scanned from the letter · in Files' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'document', id: invoice.id } });
  });

  it('says so when it has neither, and offers to scan the letter', async () => {
    await render(inApp(<Bill />));
    const press = user();
    await press.press(screen.getByRole('button', { name: 'No login kept with it. Nothing from the Vault is linked yet' }));
    expect(screen.getByRole('header', { name: 'No login yet' })).toBeOnTheScreen();
    await press.press(screen.getByRole('button', { name: 'OK' }));
    await press.press(screen.getByRole('button', { name: 'No invoice kept with it. Scan the letter to keep it with the bill' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/money/scan', params: { bill: BILL_ID } });
  });

  it('keeps the rest behind the three dots: changing it, who sees it, its reference to copy, deleting it', async () => {
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(inApp(<Bill />));
    const press = user();
    await press.press(screen.getByRole('button', { name: 'More' }));
    await press.press(screen.getByRole('button', { name: 'Copy the reference. SI12 3456 7890 1184' }));
    expect(copyText).toHaveBeenCalledWith('SI12 3456 7890 1184');
    expect(await screen.findByRole('button', { name: 'Copy the reference. Copied' })).toBeOnTheScreen();
    await press.press(screen.getByRole('button', { name: 'Who can see it' }));
    expect(screen.getByText('the audience sheet')).toBeOnTheScreen();
    await press.press(screen.getByRole('button', { name: 'More' }));
    await press.press(screen.getByRole('button', { name: 'Change the bill' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/money/bill', params: { id: BILL_ID } });
    await press.press(screen.getByRole('button', { name: 'More' }));
    await press.press(screen.getByRole('button', { name: 'Delete the bill' }));
    expect(screen.getByRole('header', { name: 'Delete this bill?' })).toBeOnTheScreen();
    await press.press(screen.getAllByRole('button', { name: 'Delete the bill' }).pop()!);
    await waitFor(() => expect(deleteThing).toHaveBeenCalledWith(BILL_ID));
    await waitFor(() => expect(mockCache.thingDeleted).toHaveBeenCalled());
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('only shows a bill to someone who may not change it', async () => {
    asked.mockReturnValue(loaded(bill({ canEdit: false, mine: false })));
    await render(inApp(<Bill />));
    expect(screen.getByText('You can see this bill, but not change it.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Mark my half as paid' })).toBeNull();
    await user().press(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: 'Change the bill' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete the bill' })).toBeNull();
  });

  it('says what went wrong when marking it paid fails', async () => {
    mark.mockRejectedValue(new ApiError(409, 'next_one_started', 'The next one is already being paid. Take that back first.'));
    await render(inApp(<Bill />));
    await user().press(screen.getByRole('button', { name: 'Mark my half as paid' }));
    expect(await screen.findByText('The next one is already being paid. Take that back first.')).toBeOnTheScreen();
  });

  it('keeps its Back while it loads, and says so when the bill is not there', async () => {
    asked.mockReturnValue(pending());
    const view = await render(inApp(<Bill />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await view.rerender(inApp(<Bill />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
