import { groupOf, lineWhen } from '../when';

/** Wednesday 11 November 2026, 21:00, on the phone's own clock. */
const NOW = new Date(2026, 10, 11, 21, 0, 0);
const at = (day: number, hours: number, minutes = 0) => new Date(2026, 10, day, hours, minutes).toISOString();
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

describe('when a line of Activity happened', () => {
  it('says how long ago for what has just happened', () => {
    expect(lineWhen(ago(0), false, NOW)).toBe('just now');
    expect(lineWhen(ago(12), false, NOW)).toBe('12 min ago');
    expect(lineWhen(ago(120), false, NOW)).toBe('2h ago');
  });

  it('says the time for earlier today', () => {
    expect(lineWhen(at(11, 7, 40), false, NOW)).toBe('7:40');
    expect(lineWhen(at(11, 13, 5), false, NOW)).toBe('13:05');
  });

  it('says the day and the time for earlier this week, and the day alone for a line that counts several moments', () => {
    expect(lineWhen(at(9, 18, 2), false, NOW)).toBe('Mon 18:02');
    expect(lineWhen(at(9, 17, 15), true, NOW)).toBe('Mon');
    expect(lineWhen(at(8, 9, 0), false, NOW)).toBe('Sun 9:00');
  });

  it('says a date for anything before that', () => {
    expect(lineWhen(new Date(2026, 9, 2, 9, 0).toISOString(), false, NOW)).toBe('2 Oct');
    expect(lineWhen(at(4, 9), true, NOW)).toBe('4 Nov');
  });

  it('says nothing for something due, which has no moment', () => {
    expect(lineWhen(null, false, NOW)).toBeNull();
    expect(lineWhen(undefined, false, NOW)).toBeNull();
  });
});

describe('which label a line stands under', () => {
  it('is Today for today and for what is due, Earlier this week for the six days before, Earlier beyond', () => {
    expect(groupOf(ago(12), NOW)).toBe('today');
    expect(groupOf(at(11, 0, 1), NOW)).toBe('today');
    expect(groupOf(null, NOW)).toBe('today');
    expect(groupOf(at(10, 23, 59), NOW)).toBe('week');
    expect(groupOf(at(5, 8), NOW)).toBe('week');
    expect(groupOf(at(4, 8), NOW)).toBe('earlier');
  });
});
