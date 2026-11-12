import { formatMoney } from '@/lib/money';
import { locale, words } from '@/words';

/** "€20.00": an amount in a column of amounts, always with its cents, so the column lines up. */
export function exactMoney(cents: number, currency: string = 'EUR'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
  } catch {
    // A currency code the phone doesn't know: the number and the code say as much.
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** "€61" for 6079 cents: a share at a glance, to the nearest whole. The exact amount is one tap away. */
export function roundMoney(cents: number, currency: string = 'EUR'): string {
  return formatMoney(Math.round(cents / 100) * 100, currency);
}

/** "−€8.90" for money that went out, "+€20.00" for money that came in. */
export function signedMoney(cents: number, currency: string = 'EUR'): string {
  return cents < 0 ? words.flat.money.out(exactMoney(-cents, currency)) : words.flat.money.in(exactMoney(cents, currency));
}
