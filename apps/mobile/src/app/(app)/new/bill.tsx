import { BillForm } from '@/features/money/BillForm';

/**
 * /new/bill, one of the ten things the + sheet opens: something to pay, added by hand in the current circle.
 * It starts as seen by whoever the + sheet said (`?audience=…`), or else by what the circle's kind says.
 * Scanning a letter instead is one tap away (`/money/scan`).
 */
export default function NewBill() {
  return <BillForm />;
}
