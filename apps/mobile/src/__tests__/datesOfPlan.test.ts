import { addMinutes, addMonths, formatClock, formatClocks, formatMonth, formatWeekdayDay, monthOf, nearName, phoneTimeZone, today, tomorrow, weekdayOf } from '@/lib/dates';

describe('days and times as a calendar writes them', () => {
  it('knows which day of the week a day is, Monday first', () => {
    expect(weekdayOf('2026-11-09')).toBe(0);
    expect(weekdayOf('2026-11-14')).toBe(5);
    expect(weekdayOf('2026-11-15')).toBe(6);
  });

  it('writes a day with its day of the week, and the year only when it is not this year', () => {
    const year = new Date().getFullYear();
    const written = formatWeekdayDay(`${year}-11-14`);
    expect(written).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) 14 Nov$/);
    expect(formatWeekdayDay('2019-12-25')).toBe('Wed 25 Dec 2019');
  });

  it('calls today and tomorrow by their names, and no other day', () => {
    expect(nearName(today())).toBe('Today');
    expect(nearName(tomorrow())).toBe('Tomorrow');
    expect(nearName('2019-04-01')).toBeNull();
  });

  it('writes a time of day without a nought in front, and a span with its end', () => {
    expect(formatClock('07:30')).toBe('7:30');
    expect(formatClock('15:05')).toBe('15:05');
    expect(formatClocks('10:00')).toBe('10:00');
    expect(formatClocks('10:00', '10:30')).toBe('10:00 to 10:30');
    expect(formatClocks('10:00', null)).toBe('10:00');
  });

  it('adds minutes to a time of day and stays within the day', () => {
    expect(addMinutes('10:00', 30)).toBe('10:30');
    expect(addMinutes('09:45', 30)).toBe('10:15');
    expect(addMinutes('23:50', 30)).toBe('23:59');
  });

  it('moves from month to month, across the end of a year', () => {
    expect(monthOf('2026-11-14')).toBe('2026-11');
    expect(addMonths('2026-11', 1)).toBe('2026-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(formatMonth('2026-11')).toBe('November 2026');
  });

  it('says which time zone the phone is in', () => {
    expect(phoneTimeZone().length).toBeGreaterThan(0);
  });
});
