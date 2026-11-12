import { locale } from '@/words';

/**
 * Money as people read it: 4500 cents is "€45", 4550 is "€45.50". Amounts travel as whole cents; the sample
 * circles keep theirs in euros, which is also what a thing without a currency of its own is shown in.
 */
export function formatMoney(cents: number, currency: string = 'EUR'): string {
  const whole = cents % 100 === 0;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(cents / 100);
  } catch {
    // A currency code the phone doesn't know: the number and the code say as much.
    return `${(cents / 100).toFixed(whole ? 0 : 2)} ${currency}`;
  }
}
