import {
  addDays,
  ageOn,
  atTime,
  daysBetween,
  formatComingDay,
  formatDay,
  formatDayFull,
  formatDayLong,
  formatDayOfYear,
  formatMonthAndYear,
  formatRange,
  formatSpan,
  formatTime,
  formatWeekday,
  formatWeekdayLong,
  formatWeekdayShort,
  fromISODate,
  mondayOf,
  nextBirthday,
  timeAgo,
  today,
  toISODate,
} from '@/lib/dates';

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

describe('days and times that are coming up', () => {
  // Wednesday 11 November 2026: "today" in the drawings.
  const from = '2026-11-11';

  it('says today and tomorrow in those words, and any other day with its weekday', () => {
    expect(formatComingDay('2026-11-11', from)).toBe('Today');
    expect(formatComingDay('2026-11-12', from)).toBe('Tomorrow');
    expect(formatComingDay('2026-12-04', from)).toBe('Fri 4 Dec');
    expect(formatWeekday('2026-12-05')).toBe('Sat 5 Dec');
  });

  it("writes a time on this phone's clock, and a stretch of time in one line", () => {
    expect(formatTime(new Date(2026, 10, 11, 9, 5))).toBe('09:05');
    const [start, end] = [new Date(2026, 10, 11, 18, 0).toISOString(), new Date(2026, 10, 11, 23, 30).toISOString()];
    expect(formatSpan(start, end, from)).toBe('Today, 18:00 to 23:30');
    expect(formatSpan(start, new Date(2026, 10, 12, 10, 0).toISOString(), from)).toBe('Today 18:00 to Tomorrow 10:00');
    expect(formatSpan(new Date(2026, 11, 5, 14, 0).toISOString(), new Date(2026, 11, 5, 18, 0).toISOString(), from)).toBe('Sat 5 Dec, 14:00 to 18:00');
  });

  it('reads a time that was typed, or says it is not one', () => {
    expect(atTime('2026-11-11', '18:00')).toEqual(new Date(2026, 10, 11, 18, 0));
    expect(atTime('2026-11-11', ' 7.30 ')).toEqual(new Date(2026, 10, 11, 7, 30));
    for (const wrong of ['', 'late', '24:00', '12:60', '1800', '6pm']) expect(atTime('2026-11-11', wrong)).toBeNull();
  });

  it('knows how old someone is, before and after their birthday', () => {
    expect(ageOn('2016-12-04', '2026-11-11')).toBe(9);
    expect(ageOn('2016-12-04', '2026-12-04')).toBe(10);
    expect(ageOn('2016-12-04', '2026-12-03')).toBe(9);
    expect(ageOn('2020-03-14', '2026-11-11')).toBe(6);
  });

  it('finds the next birthday: later this year, today, or next year', () => {
    expect(nextBirthday('2016-12-04', from)).toEqual({ day: '2026-12-04', inDays: 23 });
    expect(nextBirthday('2016-11-11', from)).toEqual({ day: '2026-11-11', inDays: 0 });
    expect(nextBirthday('2020-03-14', from)).toEqual({ day: '2027-03-14', inDays: 123 });
  });
});

describe('a week on a board, and a mark on a ruler', () => {
  it('names a weekday, short and written out', () => {
    expect(formatWeekdayShort('2026-11-11')).toBe('Wed');
    expect(formatWeekdayLong('2026-11-15')).toBe('Sunday');
  });

  it('writes a stretch of days in one month or across two', () => {
    expect(formatRange('2026-11-09', '2026-11-15')).toBe('9 to 15 November');
    expect(formatRange('2026-11-30', '2026-12-06')).toBe('30 November to 6 December');
  });

  it('writes a day out with its year, and a month as short as it goes', () => {
    expect(formatDayFull('2034-12-04')).toBe('4 December 2034');
    expect(formatDayOfYear('2016-12-04')).toBe('4 December');
    expect(formatMonthAndYear('2026-11-02')).toBe('Nov 26');
    expect(formatMonthAndYear('2005-01-31')).toBe('Jan 05');
  });

  it('finds the Monday of a week from any of its days', () => {
    expect(mondayOf('2026-11-11')).toBe('2026-11-09');
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
  });
});
