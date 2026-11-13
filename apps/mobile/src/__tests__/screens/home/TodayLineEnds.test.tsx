import { render, screen } from '@testing-library/react-native';

import type { TodayItem } from '@/api/generated/homeport';
import { hasLineButton, LineButton } from '@/features/today/LineButton';
import { RepeatMark } from '@/features/today/RepeatMark';
import { onPhone } from '@/test/phone';

// Money's own "Pay" button has its own test; here only what it is handed matters.
jest.mock('@/features/money/PayBill', () => ({ PayBillButton: (props: { billId: string; title: string; label?: string; dueOn?: string }) => mockPay(props) }));
function mockPay({ billId, title, label, dueOn }: { billId: string; title: string; label?: string; dueOn?: string }) {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return <Text>{`${label} | ${title} | ${billId} | ${dueOn}`}</Text>;
}
// The repeat mark is an icon: here it says what it is.
jest.mock('lucide-react-native', () => ({ Repeat: () => mockMark() }));
function mockMark() {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return <Text>the repeat mark</Text>;
}

const BILL = 'cccccccc-1111-4111-8111-111111111111';
const bill: TodayItem = { thingId: BILL, kind: 'bill', title: 'Electricity', note: 'Due tomorrow · split with Alex', lead: '€84', done: null, minute: 1440, avatarUrls: [], action: { label: 'Pay', act: 'pay' }, repeats: true, due: { on: '2026-11-12', amount: '€84.20', note: 'Your half is €42.10' } };
const bins: TodayItem = { thingId: 'bbbbbbbb-1111-4111-8111-111111111111', kind: 'reminder', title: 'Take the bins out', note: 'Tonight · your turn', lead: null, done: false, minute: 1140, avatarUrls: [], repeats: true, due: { on: '2026-11-11', amount: null, note: null } };

describe("how one of Today's lines ends, as the API says", () => {
  it("gives a line its button in the API's own word, for the day the line says it is due", async () => {
    expect(hasLineButton(bill)).toBe(true);
    await render(onPhone(<LineButton item={bill} />));
    expect(screen.getByText(`Pay | Electricity | ${BILL} | 2026-11-12`)).toBeOnTheScreen();
  });

  it('takes whatever word the API sends for the button', async () => {
    await render(onPhone(<LineButton item={{ ...bill, action: { label: 'Mark paid', act: 'pay' } }} />));
    expect(screen.getByText(/^Mark paid \| Electricity/)).toBeOnTheScreen();
  });

  it('draws no button for a line that comes without one, or with one this app does not know', async () => {
    // A bill the bank pays by itself has nothing to tap.
    for (const item of [{ ...bill, action: undefined }, { ...bill, action: { label: 'Dance', act: 'dance' } }, { ...bill, thingId: undefined }, bins]) {
      expect(hasLineButton(item)).toBe(false);
      const view = await render(onPhone(<LineButton item={item} />));
      expect(screen.queryByText(/\|/)).toBeNull();
      await view.unmount();
    }
  });

  it('marks something that comes round again, and nothing else', async () => {
    const view = await render(onPhone(<RepeatMark item={bins} />));
    expect(screen.getByText('the repeat mark')).toBeOnTheScreen();
    await view.rerender(onPhone(<RepeatMark item={{ ...bins, repeats: false }} />));
    expect(screen.queryByText('the repeat mark')).toBeNull();
    await view.rerender(onPhone(<RepeatMark item={{ ...bins, repeats: undefined }} />));
    expect(screen.queryByText('the repeat mark')).toBeNull();
  });
});
