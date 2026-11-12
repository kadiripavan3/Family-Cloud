import { useMutation } from '@tanstack/react-query';
import { Linking } from 'react-native';

import { useCache } from '@/api/cache';
import { getBill, markBillPaid } from '@/api/generated/homeport';
import { changeNotSent } from '@/api/online';
import { Button } from '@/ui/Button';
import { words } from '@/words';

/**
 * "Pay" on a bill's line, wherever one stands (Today's list): it reads the bill first, then opens the
 * payee's own page for paying when the bill has one, and otherwise marks the person's share of this time as
 * paid (the whole bill when they pay no share of it). Nothing here moves money.
 */
export function PayBillButton({ billId, title }: { billId: string; title: string }) {
  const cache = useCache();
  const pay = useMutation({
    mutationFn: async () => {
      const bill = await getBill(billId);
      if (bill.payUrl) {
        await Linking.openURL(bill.payUrl);
        return { bill, marked: false };
      }
      return { bill: await markBillPaid(billId, { dueOn: bill.dueOn }), marked: true };
    },
    onSuccess: ({ bill, marked }) => (marked ? cache.billSaved(bill) : undefined),
    // The strip across the top says that it didn't go through.
    onError: () => changeNotSent(),
  });
  const done = pay.data?.marked === true;
  return <Button label={done ? words.money.pay.paid : words.money.pay.label} spoken={done ? undefined : words.money.pay.spoken(title)} variant="soft" size="sm" inline disabled={done} loading={pay.isPending} onPress={() => pay.mutate()} />;
}
