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

/** How an amount is written, by `Intl`, with this many digits after the point. */
function written(units: number, currency: string, digits: number): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(units);
  } catch {
    // A currency code the phone doesn't know: the number and the code say as much.
    return `${units.toFixed(digits)} ${currency}`;
  }
}

/**
 * Whole cents to the nearest whole unit, as a whole number: 8596 is 86, 8450 is 85. Only whole numbers are
 * touched on the way, so nothing drifts.
 */
export function toWhole(cents: number): number {
  const whole = Math.floor((Math.abs(cents) + 50) / 100);
  return cents < 0 ? -whole : whole;
}

/** Always with its cents: 8420 is "€84.20", 98000 is "€980.00". The amount of a bill, a cell, an answer. */
export function formatMoneyExact(cents: number, currency: string = 'EUR'): string {
  return written(cents / 100, currency, 2);
}

/** To the nearest whole unit: 231819 is "€2,318", 8596 is "€86". A figure on a card, where cents are noise. */
export function formatMoneyRound(cents: number, currency: string = 'EUR'): string {
  return written(toWhole(cents), currency, 0);
}

/** A rough figure, to the two digits that count: 1495567 is "€15,000". For a sentence that says "about". */
export function formatMoneyAbout(cents: number, currency: string = 'EUR'): string {
  const whole = toWhole(cents);
  const digits = String(Math.abs(whole)).length;
  if (digits <= 2) return written(whole, currency, 0);
  const step = 10 ** (digits - 2);
  return written(Math.round(whole / step) * step, currency, 0);
}

/** The bare number with its cents and no currency: 148000 is "1,480.00". A cell in a grid whose column says the currency. */
export function formatAmount(cents: number): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/**
 * What someone typed as an amount, in whole cents: "84.20", "84,2", "€1,240" and "1.240,50" all read as
 * money. Null when it isn't an amount. The digits are read as text, so no cent is lost to a fraction.
 */
export function parseMoney(typed: string): number | null {
  let text = typed.replace(/[^0-9.,-]/g, '');
  const negative = text.startsWith('-');
  text = text.replace(/-/g, '');
  if (!/[0-9]/.test(text)) return null;
  // The last comma or point is where the cents start, when one or two digits follow it; any other is there to group thousands.
  const mark = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
  const after = mark < 0 ? '' : text.slice(mark + 1);
  const hasCents = mark >= 0 && after.length >= 1 && after.length <= 2;
  const units = (hasCents ? text.slice(0, mark) : text).replace(/[.,]/g, '');
  const cents = Number(units || '0') * 100 + (hasCents ? Number(after.padEnd(2, '0')) : 0);
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** An amount as it is put into a box to be changed: 235000 is "2350.00", and nothing for no amount. */
export function moneyToType(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  const whole = Math.floor(Math.abs(cents) / 100);
  const rest = String(Math.abs(cents) % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${whole}.${rest}`;
}
