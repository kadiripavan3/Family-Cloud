/**
 * Reads a time of day the way people type it: "9", "9:30", "930", "14.00", "7pm", "7:15 am", "noon".
 * Gives it back as the API keeps it ("09:30"), or null when it isn't a time.
 */
export function readTime(typed: string): string | null {
  const text = typed.trim().toLowerCase().replace(/\s+/g, '');
  if (text === 'noon' || text === 'midday') return '12:00';
  if (text === 'midnight') return '00:00';
  const match = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a\.m\.|p\.m\.)?$/.exec(text);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const half = match[3]?.[0];
  if (half) {
    if (hours < 1 || hours > 12) return null;
    if (half === 'p' && hours < 12) hours += 12;
    if (half === 'a' && hours === 12) hours = 0;
  }
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Minutes since midnight of a time of day as the API keeps it. */
export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/**
 * Reads an amount of money the way people type it ("150", "12.50", "12,5", "€ 1,200") as whole cents, or
 * null when it isn't one. A comma is a decimal mark when one or two digits follow it, else it groups thousands.
 */
export function readCents(typed: string): number | null {
  const text = typed.trim().replace(/[€$£\s]/g, '');
  if (!/^\d[\d.,]*$/.test(text)) return null;
  const decimal = /[.,](\d{1,2})$/.exec(text);
  const whole = (decimal ? text.slice(0, decimal.index) : text).replace(/[.,]/g, '');
  if (whole === '') return null;
  const cents = Number(whole) * 100 + (decimal ? Number(decimal[1]!.padEnd(2, '0')) : 0);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Reads a whole number the way people type it ("20", "1,200"), or null when it isn't one. */
export function readCount(typed: string): number | null {
  const text = typed.trim().replace(/[,\s]/g, '');
  if (!/^\d+$/.test(text)) return null;
  const count = Number(text);
  return Number.isSafeInteger(count) ? count : null;
}
