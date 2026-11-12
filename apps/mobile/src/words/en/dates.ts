/** Days, months and "how long ago". Months are numbered from 0 (January), as in a JavaScript date. */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const dates = {
  today: 'Today',
  yesterday: 'Yesterday',
  /** "3 Apr", or "3 Apr 2025" when the year is given. */
  day: (day: number, month: number, year?: number) => {
    const short = `${day} ${MONTHS[month]!.slice(0, 3)}`;
    return year === undefined ? short : `${short} ${year}`;
  },
  /** "1 April", or "1 April 2025" when the year is given. */
  dayLong: (day: number, month: number, year?: number) => {
    const long = `${day} ${MONTHS[month]}`;
    return year === undefined ? long : `${long} ${year}`;
  },
  /** "April 2026": the month a calendar shows. */
  month: (month: number, year: number) => `${MONTHS[month]} ${year}`,

  // The day picker
  /** One letter for each day of the week, Monday first. */
  weekdayInitials: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  previousYear: 'A year back',
  nextYear: 'A year on',
  /** "3 April 2026": what a screen reader says for a day in the calendar. */
  dayInCalendar: (day: number, month: number, year: number) => `${day} ${MONTHS[month]} ${year}`,

  /** "Fri 4 Dec": a day with its weekday, for something coming up. `weekday` is numbered from 0 (Sunday). */
  dayWithWeekday: (weekday: number, day: number, month: number) => `${WEEKDAYS[weekday]} ${day} ${MONTHS[month]!.slice(0, 3)}`,
  tomorrow: 'Tomorrow',
  /** "18:00": a time of day, on a 24-hour clock. */
  time: (hours: number, minutes: number) => `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
  /** "Today, 18:00 to 23:30": a stretch of time within one day, or from one day to another. */
  span: (day: string, from: string, to: string) => `${day}, ${from} to ${to}`,
  spanDays: (fromDay: string, from: string, toDay: string, to: string) => `${fromDay} ${from} to ${toDay} ${to}`,

  // How long ago
  justNow: 'just now',
  minutesAgo: (minutes: number) => `${minutes} min ago`,
  hoursAgo: (hours: number) => `${hours}h ago`,
  aDayAgo: 'yesterday',
  daysAgo: (days: number) => `${days} days ago`,
} as const;
