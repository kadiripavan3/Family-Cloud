import { addDays, formatDay, formatWeekdayLong, today } from '@/lib/dates';
import { locale, words } from '@/words';

/**
 * Money to the cent, the way a piggy bank counts it: 1200 cents is "€12.00", never "€12". A child checks the
 * jars against the coins, so the cents are always written.
 */
export function exactMoney(cents: number, currency: string = 'EUR'): string {
  const amount = Math.abs(cents) / 100;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    // A currency code the phone doesn't know: the number and the code say as much.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** What came in or went out, with its sign: "+€2.00", "−€3.50". */
export function signedMoney(cents: number, currency: string = 'EUR'): string {
  return `${cents < 0 ? '−' : '+'}${exactMoney(cents, currency)}`;
}

/** The day something happened, as a family says it within the week ("Today", "Yesterday", "Sunday"), and by its date after that. */
export function whenOf(day: string, from: string = today()): string {
  if (day === from) return words.dates.today;
  if (day === addDays(from, -1)) return words.dates.yesterday;
  return day > addDays(from, -7) && day < from ? formatWeekdayLong(day) : formatDay(day);
}
