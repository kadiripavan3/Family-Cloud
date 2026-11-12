/**
 * What a walk is counted in. On a board that counts kilometres every amount travels as whole metres; on a
 * board that counts steps, as steps. These read what a person types and say how a number is shown; the
 * words around a number ("km", "steps") are the catalog's.
 */
export type Unit = 'km' | 'steps';

export const unitOf = (unit: string): Unit => (unit === 'steps' ? 'steps' : 'km');

/** The most one walk takes, as the API has it: 500 kilometres, or as many steps as that is in metres. */
const MOST = 500_000;

/**
 * Reads what was typed ("4.5", "4,5", "12 km", "8,400", "8400 steps") as the amount the API takes: metres
 * on a board in kilometres, steps on a board in steps. Null when it isn't a number above nothing, or is more
 * than one walk can be.
 */
export function readAmount(typed: string, unit: Unit): number | null {
  const text = typed.trim().toLowerCase().replace(/\s*(km|kilometres?|kilometers?|steps?)$/, '').replace(/\s/g, '');
  if (unit === 'steps') {
    if (!/^\d[\d.,]*$/.test(text)) return null;
    const steps = Number(text.replace(/[.,]/g, ''));
    return Number.isSafeInteger(steps) && steps >= 1 && steps <= MOST ? steps : null;
  }
  // A comma or a point before one to three last digits is the decimal mark of a number of kilometres.
  if (!/^\d+([.,]\d{1,3})?$/.test(text)) return null;
  const metres = Math.round(Number(text.replace(',', '.')) * 1000);
  return metres >= 1 && metres <= MOST ? metres : null;
}

/**
 * The number of an amount, as it is shown: kilometres as a whole number once they are many ("1,240") and
 * with one decimal while they are few ("4.5"); steps as they are ("8,400").
 */
export function numberOf(amount: number, unit: Unit): string {
  if (unit === 'steps') return Math.round(amount).toLocaleString('en-US');
  const km = amount / 1000;
  const whole = Math.round(km);
  if (km >= 100 || Math.abs(km - whole) < 0.05) return whole.toLocaleString('en-US');
  return (Math.round(km * 10) / 10).toFixed(1);
}

/** How long a person's bar is beside the others': a part of the one who walked most, 0 to 1. */
export function barOf(amount: number, most: number): number {
  return most <= 0 ? 0 : Math.min(Math.max(amount / most, 0), 1);
}
