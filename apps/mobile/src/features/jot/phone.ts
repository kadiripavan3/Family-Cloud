import { today } from '@/lib/dates';

/** The day on this phone, as the API takes it: what "tomorrow" in a jot is counted from. */
export const phoneDay = (): string => today();

/** Where this phone is, such as "Europe/Ljubljana", so "at 6" means six o'clock here. Undefined when the phone won't say. */
export function phoneZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** What every reading and every jot is sent with: the phone's day and its time zone. */
export const phoneNow = () => ({ day: phoneDay(), timeZone: phoneZone() });
