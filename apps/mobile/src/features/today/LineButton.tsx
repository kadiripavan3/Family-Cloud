import type { TodayItem } from '@/api/generated/homeport';
import { PayBillButton } from '@/features/money/PayBill';

/** True for a line of Today the API gives a button this app knows how to press: today, "Pay" on a bill. */
export function hasLineButton(item: TodayItem): boolean {
  return item.action?.act === 'pay' && !!item.thingId;
}

/**
 * The button at the end of one of Today's lines, as the API sends it with the line: its word is the API's
 * (`action.label`: "Pay"), and what it does is named by `action.act`. "pay" is Money's own button, which
 * marks the person's share as paid for the time the line says it is due (`due.on`), or opens the payee's
 * page. A bill the bank pays by itself comes without a button, and so does every other line: then this
 * draws nothing (ask `hasLineButton` first where the line's shape depends on it).
 */
export function LineButton({ item }: { item: TodayItem }) {
  if (!hasLineButton(item) || !item.thingId) return null;
  return <PayBillButton billId={item.thingId} title={item.title ?? ''} label={item.action?.label} dueOn={item.due?.on} />;
}
