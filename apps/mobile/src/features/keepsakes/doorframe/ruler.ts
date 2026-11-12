/**
 * Where marks stand on the doorframe's ruler. Heights are in millimetres, as the API keeps them; the ruler
 * shows a window of them, because children's marks sit in a narrow band and a ruler from the floor up would
 * squeeze them together.
 */

/** The part of the frame the ruler shows, in millimetres: from a little under the lowest mark, at least 60 cm up. */
export function windowOf(heights: readonly number[]): { from: number; to: number } {
  if (heights.length === 0) return { from: 900, to: 1500 };
  const lowest = Math.min(...heights);
  const tallest = Math.max(...heights);
  const from = Math.max(0, Math.floor((lowest - 150) / 100) * 100);
  const span = Math.max(600, Math.ceil((tallest - from + 120) / 100) * 100);
  return { from, to: from + span };
}

/** How far up the ruler a height stands, from 0 (its foot) to 1 (its top). */
export function placeOf(height: number, window: { from: number; to: number }): number {
  return Math.min(Math.max((height - window.from) / (window.to - window.from), 0), 1);
}

/** "138" for 1380 mm, "121.5" for 1215: a height in centimetres, with the half where there is one. */
export function inCm(heightMm: number): string {
  const cm = Math.round(heightMm) / 10;
  return Number.isInteger(cm) ? String(cm) : cm.toFixed(1);
}

/** What was typed as a height in centimetres ("138", "121,5"), in millimetres, or null when it isn't a height a person can have. */
export function toMm(typed: string): number | null {
  const cm = Number.parseFloat(typed.trim().replace(',', '.'));
  if (!Number.isFinite(cm)) return null;
  const mm = Math.round(cm * 10);
  return mm >= 300 && mm <= 2500 ? mm : null;
}

/**
 * Which marks get their words beside them. Every mark gets its line; where two stand closer than a line of
 * text is tall, the newer one keeps its words and the other is only a line.
 */
export function labelled<Mark extends { id: string; heightMm: number; day: string }>(marks: readonly Mark[], window: { from: number; to: number }, rulerHeight: number, lineHeight: number): Set<string> {
  const kept: number[] = [];
  const ids = new Set<string>();
  for (const mark of [...marks].sort((a, b) => b.day.localeCompare(a.day) || b.heightMm - a.heightMm)) {
    const at = placeOf(mark.heightMm, window) * rulerHeight;
    if (kept.some((other) => Math.abs(other - at) < lineHeight)) continue;
    kept.push(at);
    ids.add(mark.id);
  }
  return ids;
}
