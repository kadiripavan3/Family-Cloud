/** Days, months and "how long ago". Months are numbered from 0 (January), as in a JavaScript date. */

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
  /** "3 April 2026": what a screen reader says for a day in the calendar. */
  dayInCalendar: (day: number, month: number, year: number) => `${day} ${MONTHS[month]} ${year}`,

  // How long ago
  justNow: 'just now',
  minutesAgo: (minutes: number) => `${minutes} min ago`,
  hoursAgo: (hours: number) => `${hours}h ago`,
  aDayAgo: 'yesterday',
  daysAgo: (days: number) => `${days} days ago`,
} as const;
