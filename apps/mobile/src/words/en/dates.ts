/** Days, months and "how long ago". Months are numbered from 0 (January), as in a JavaScript date. */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
  /** "November": a month on its own, where the year stands beside it. */
  monthName: (month: number) => MONTHS[month]!,
  /** "Nov 2028": a month and its year, short. */
  monthShort: (month: number, year: number) => `${MONTHS[month]!.slice(0, 3)} ${year}`,
  /** "Tue 24 Sep 2019": a day that was written without its year, with it. */
  withYear: (day: string, year: number) => `${day} ${year}`,
  /** "Sat 14 Nov", "Sat 2 Jan 2027": a day on a calendar with its weekday. `weekday` is numbered from 0 (Sunday); `day` is already written out. */
  weekdayDay: (weekday: number, day: string) => `${WEEKDAYS[weekday]} ${day}`,
  /** "3 Apr to 20 Apr", "10:00 to 10:30". Both ends are already written out. */
  fromTo: (from: string, to: string) => `${from} to ${to}`,
  /** "Nov": a month's name cut short, where there is little room (under a bar of a chart). */
  monthAbbr: (month: number) => MONTHS[month]!.slice(0, 3),

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

  // A week on a board, and a mark on a ruler
  /** "Fri": a weekday's short name, numbered from 0 (Sunday). */
  weekdayShort: (weekday: number) => WEEKDAYS[weekday]!,
  /** "Friday": the same, written out. */
  weekdayLong: (weekday: number) => WEEKDAYS_LONG[weekday]!,
  /** "9 to 15 November", or "30 November to 6 December" when the days are in two months. */
  range: (fromDay: number, fromMonth: number, toDay: number, toMonth: number) => (fromMonth === toMonth ? `${fromDay} to ${toDay} ${MONTHS[toMonth]}` : `${fromDay} ${MONTHS[fromMonth]} to ${toDay} ${MONTHS[toMonth]}`),
  /** "Nov 26": a month with the last two figures of its year, where there is room for no more. */
  monthAndYear: (month: number, year: number) => `${MONTHS[month]!.slice(0, 3)} ${String(year % 100).padStart(2, '0')}`,

  // How long ago
  justNow: 'just now',
  minutesAgo: (minutes: number) => `${minutes} min ago`,
  hoursAgo: (hours: number) => `${hours}h ago`,
  aDayAgo: 'yesterday',
  daysAgo: (days: number) => `${days} days ago`,
} as const;
