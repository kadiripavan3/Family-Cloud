import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { getBill, markBillPaid } from '@/api/generated/homeport';
import { changeNotSent } from '@/api/online';
import { PayBillButton } from '@/features/money/PayBill';
import { inApp } from '@/test/phone';
import { bill, BILL_ID, share } from '@/test/samples/money';

const mockCache = { billSaved: jest.fn(() => Promise.resolve()) };
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/api/online', () => ({ changeNotSent: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({ getBill: jest.fn(), markBillPaid: jest.fn() }));

describe('"Pay" on a bill\'s line (Today)', () => {
  beforeEach(() => jest.clearAllMocks());

  it("reads the bill, then marks the person's share of this time as paid", async () => {
    const paid = bill({ shares: [share({ paid: true }), bill().shares[1]!] });
    jest.mocked(getBill).mockResolvedValue(bill());
    jest.mocked(markBillPaid).mockResolvedValue(paid);
    await render(inApp(<PayBillButton billId={BILL_ID} title="Electricity" />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Pay Electricity' }));
    await waitFor(() => expect(markBillPaid).toHaveBeenCalledWith(BILL_ID, { dueOn: '2026-11-13' }));
    expect(getBill).toHaveBeenCalledWith(BILL_ID);
    await waitFor(() => expect(mockCache.billSaved).toHaveBeenCalledWith(paid));
    expect(await screen.findByText('Paid')).toBeOnTheScreen();
  });

  it('marks the time the line says it is due, in the word the API sent for the button', async () => {
    jest.mocked(getBill).mockResolvedValue(bill());
    jest.mocked(markBillPaid).mockResolvedValue(bill());
    await render(inApp(<PayBillButton billId={BILL_ID} title="Electricity" label="Mark paid" dueOn="2026-10-13" />));
    expect(screen.getByText('Mark paid')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Pay Electricity' }));
    await waitFor(() => expect(markBillPaid).toHaveBeenCalledWith(BILL_ID, { dueOn: '2026-10-13' }));
  });

  it("opens the payee's own page for paying when the bill has one, and marks nothing", async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    jest.mocked(getBill).mockResolvedValue(bill({ payUrl: 'https://elektro.example/pay' }));
    await render(inApp(<PayBillButton billId={BILL_ID} title="Electricity" />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Pay Electricity' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://elektro.example/pay'));
    expect(markBillPaid).not.toHaveBeenCalled();
    expect(mockCache.billSaved).not.toHaveBeenCalled();
    expect(screen.getByText('Pay')).toBeOnTheScreen();
  });

  it("lets the strip at the top say so when it didn't go through", async () => {
    jest.mocked(getBill).mockRejectedValue(new Error('offline'));
    await render(inApp(<PayBillButton billId={BILL_ID} title="Electricity" />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Pay Electricity' }));
    await waitFor(() => expect(changeNotSent).toHaveBeenCalled());
    expect(screen.getByText('Pay')).toBeOnTheScreen();
  });
});
