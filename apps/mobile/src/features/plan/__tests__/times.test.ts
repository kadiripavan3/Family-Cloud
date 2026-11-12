import { minutesOf, readCents, readCount, readTime } from '../times';

describe('a time of day, the way people type it', () => {
  it.each([
    ['9', '09:00'],
    ['11', '11:00'],
    ['9:30', '09:30'],
    ['09.30', '09:30'],
    ['930', '09:30'],
    ['1430', '14:30'],
    ['14:00', '14:00'],
    ['7pm', '19:00'],
    ['7 pm', '19:00'],
    ['7:15 am', '07:15'],
    ['12am', '00:00'],
    ['12pm', '12:00'],
    ['noon', '12:00'],
    ['midnight', '00:00'],
    [' 18h30 ', '18:30'],
  ])('reads %s as %s', (typed, time) => {
    expect(readTime(typed)).toBe(time);
  });

  it.each(['', 'soon', '25', '9:75', '13pm', '0pm', '9:3', 'half past nine'])('does not take "%s" for a time', (typed) => {
    expect(readTime(typed)).toBeNull();
  });

  it('counts the minutes since midnight', () => {
    expect(minutesOf('00:00')).toBe(0);
    expect(minutesOf('10:30')).toBe(630);
  });
});

describe('an amount, the way people type it', () => {
  it.each([
    ['150', 15000],
    ['12.50', 1250],
    ['12,5', 1250],
    ['€ 1,200', 120000],
    ['1.200,50', 120050],
    ['0.05', 5],
  ])('reads %s as %d cents', (typed, cents) => {
    expect(readCents(typed)).toBe(cents);
  });

  it.each(['', 'a lot', '-5', '12.345.6x'])('does not take "%s" for an amount', (typed) => {
    expect(readCents(typed)).toBeNull();
  });

  it('reads a whole number, and nothing else', () => {
    expect(readCount('20')).toBe(20);
    expect(readCount('1,200')).toBe(1200);
    expect(readCount('2.5')).toBeNull();
    expect(readCount('')).toBeNull();
  });
});
