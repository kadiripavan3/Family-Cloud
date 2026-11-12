/**
 * The sums behind the sliders of "A fairer split". All of it in whole cents, and whatever a slider does, the
 * shares add up to the same total before and after: the API refuses numbers that don't.
 */

const sum = (numbers: readonly number[]) => numbers.reduce((total, one) => total + one, 0);
const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi);

/** How far one notch of a slider moves a share: a whole euro for a rent, ten cents for a small pot. */
export function stepOf(totalCents: number): number {
  return totalCents >= 10_000 ? 100 : 10;
}

/**
 * The stretch a slider covers: from a little over half of an equal share to a third more than one, and wider
 * where a share already lies outside that. Nobody can be dragged to nothing, and nobody to everything.
 */
export function rangeOf(cents: readonly number[]): { lo: number; hi: number } {
  const total = sum(cents);
  if (cents.length < 2 || total <= 0) return { lo: total, hi: total };
  const step = stepOf(total);
  const equal = total / cents.length;
  const lo = Math.floor(Math.min(equal * 0.55, Math.min(...cents) * 0.8) / step) * step;
  const hi = Math.ceil(Math.max(equal * 1.35, Math.max(...cents) * 1.1) / step) * step;
  return { lo: Math.max(lo, 0), hi: Math.min(hi, total) };
}

/** Where a share stands on its slider, 0 to 1. */
export function placeOf(cents: number, range: { lo: number; hi: number }): number {
  return range.hi > range.lo ? clamp((cents - range.lo) / (range.hi - range.lo), 0, 1) : 0;
}

/** The share a place on the slider stands for, 0 to 1 in, cents out. */
export function centsAt(place: number, range: { lo: number; hi: number }): number {
  return range.lo + clamp(place, 0, 1) * (range.hi - range.lo);
}

/**
 * One slider is dragged to `to` cents, and the others move to keep the total: each of them keeps its part of
 * what is left, in the proportion they had. Every share stays inside the range and on a whole notch; the
 * cents that rounding leaves over go to the largest of the others. The dragged share stops where the others
 * would otherwise have to leave the range.
 */
export function move(cents: readonly number[], index: number, to: number, range: { lo: number; hi: number }): number[] {
  const total = sum(cents);
  const others = cents.map((_, at) => at).filter((at) => at !== index);
  if (others.length === 0 || range.hi <= range.lo) return [...cents];
  const step = stepOf(total);
  const mine = clamp(clamp(Math.round(to / step) * step, range.lo, range.hi), total - range.hi * others.length, total - range.lo * others.length);
  const rest = total - mine;

  // What is left is spread over the others by what they had; whoever would leave the range is held at its edge, and the rest spread again.
  const next = cents.map(() => 0);
  let free = [...others];
  let left = rest;
  while (free.length) {
    const weight = sum(free.map((at) => cents[at]!));
    for (const at of free) next[at] = weight > 0 ? (left * cents[at]!) / weight : left / free.length;
    const out = free.filter((at) => next[at]! < range.lo || next[at]! > range.hi).sort((a, b) => Math.abs(next[b]! - clamp(next[b]!, range.lo, range.hi)) - Math.abs(next[a]! - clamp(next[a]!, range.lo, range.hi)))[0];
    if (out === undefined) break;
    next[out] = clamp(next[out]!, range.lo, range.hi);
    left -= next[out]!;
    free = free.filter((at) => at !== out);
  }
  for (const at of others) next[at] = Math.round(next[at]! / step) * step;
  next[index] = mine;
  // Rounding to whole notches may leave a few cents over or short: the largest of the others takes them.
  const over = total - sum(next);
  if (over !== 0) {
    const takes = [...(free.length ? free : others)].sort((a, b) => next[b]! - next[a]!)[0]!;
    next[takes] = next[takes]! + over;
  }
  return next;
}
