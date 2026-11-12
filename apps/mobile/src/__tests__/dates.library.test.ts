import { formatClock, formatMonth, formatMonthName, formatMonthShort, formatWeekdayPast } from '@/lib/dates';

describe('the date helpers the Library added', () => {
  it('writes a month with its year, its name alone, and short', () => {
    expect(formatMonth('2026-11')).toBe('November 2026');
    expect(formatMonth('2026-11-07')).toBe('November 2026');
    expect(formatMonthName('2026-02')).toBe('February');
    expect(formatMonthShort('2028-11-30')).toBe('Nov 2028');
  });

  it('writes the day something was taken with its weekday, and its year when it is not this one', () => {
    const now = new Date();
    const thisYear = `${now.getFullYear()}-03-14`;
    expect(formatWeekdayPast(thisYear)).toMatch(/^[A-Z][a-z]{2} 14 Mar$/);
    expect(formatWeekdayPast('2019-09-24')).toBe('Tue 24 Sep 2019');
  });

  it("reads the clock a photo was taken by, wherever the phone is now", () => {
    expect(formatClock('2026-11-07T11:42:00')).toBe('11:42');
    expect(formatClock('2026-11-07T00:05:59')).toBe('00:05');
    expect(formatClock('2026-11-07')).toBeNull();
    expect(formatClock('')).toBeNull();
  });
});
