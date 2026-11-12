import { addDays, daysBetween, formatDay, formatDayLong, fromISODate, timeAgo, today, toISODate } from '@/lib/dates';

describe('dates', () => {
  it('keeps a day the same through text and back', () => {
    expect(toISODate(fromISODate('2026-04-03'))).toBe('2026-04-03');
    expect(toISODate(new Date(2026, 0, 9))).toBe('2026-01-09');
  });

  it('counts whole days, also across a month and a clock change', () => {
    expect(daysBetween('2026-03-28', '2026-04-02')).toBe(5);
    expect(daysBetween('2026-04-02', '2026-03-28')).toBe(-5);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('writes a day the short way, with the year only when it is not this year', () => {
    const year = new Date().getFullYear();
    expect(formatDay(`${year}-04-03`)).toBe('3 Apr');
    expect(formatDay('2019-12-25')).toBe('25 Dec 2019');
  });

  it('says how long ago something happened', () => {
    const now = new Date(2026, 3, 10, 15, 0, 0);
    const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
    expect(timeAgo(ago(0), now)).toBe('just now');
    expect(timeAgo(ago(5), now)).toBe('5 min ago');
    expect(timeAgo(ago(125), now)).toBe('2h ago');
    expect(timeAgo(ago(60 * 26), now)).toBe('yesterday');
    expect(timeAgo(ago(60 * 24 * 4), now)).toBe('4 days ago');
  });

  it('calls today and yesterday by their names, and any other day by its date', () => {
    expect(formatDayLong(today())).toBe('Today');
    expect(formatDayLong(addDays(today(), -1))).toBe('Yesterday');
    expect(formatDayLong('2019-04-01')).toBe('1 April 2019');
  });
});
