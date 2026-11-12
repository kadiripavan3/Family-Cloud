import { formatDay } from '@/lib/dates';

import { exactMoney, signedMoney, whenOf } from '../money';

describe("the piggy bank's money", () => {
  it('always writes the cents', () => {
    expect(exactMoney(1200)).toBe('€12.00');
    expect(exactMoney(840)).toBe('€8.40');
    expect(exactMoney(60)).toBe('€0.60');
    expect(exactMoney(0)).toBe('€0.00');
  });

  it('says whether it came in or went out', () => {
    expect(signedMoney(200)).toBe('+€2.00');
    expect(signedMoney(-350)).toBe('−€3.50');
  });

  it('falls back to the number and the code for a currency the phone does not know', () => {
    expect(exactMoney(1250, 'not a currency')).toBe('12.50 not a currency');
  });

  it('names a day of the last week the way a family does, and gives a date after that', () => {
    expect(whenOf('2026-11-12', '2026-11-12')).toBe('Today');
    expect(whenOf('2026-11-11', '2026-11-12')).toBe('Yesterday');
    expect(whenOf('2026-11-08', '2026-11-12')).toBe('Sunday');
    expect(whenOf('2026-11-06', '2026-11-12')).toBe('Friday');
    expect(whenOf('2026-11-05', '2026-11-12')).toBe(formatDay('2026-11-05'));
    expect(whenOf('2026-11-14', '2026-11-12')).toBe(formatDay('2026-11-14'));
  });
});
