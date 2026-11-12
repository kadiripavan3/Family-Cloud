import { words } from '@/words';

/** A video's length as a clock: 42 seconds is "0:42", 75 minutes "1:15:00". */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const [hours, minutes, rest] = [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60];
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * How much room something takes, as people read it: "48 GB", "2.4 GB", "620 MB". Whole numbers from ten
 * up, one decimal below that.
 */
export function formatBytes(bytes: number): string {
  let unit = 0;
  let value = Math.max(0, bytes);
  while (unit < UNITS.length - 1 && value >= 1000) {
    value /= 1024;
    unit += 1;
  }
  const shown = value >= 10 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return words.library.size(shown, UNITS[unit]!);
}
