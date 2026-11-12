import { barOf, numberOf, readAmount, unitOf } from '../amounts';

describe('what a walk is counted in', () => {
  it('reads kilometres the way people type them, as whole metres', () => {
    expect(readAmount('12', 'km')).toBe(12000);
    expect(readAmount('4.5', 'km')).toBe(4500);
    expect(readAmount('4,5', 'km')).toBe(4500);
    expect(readAmount(' 7 km ', 'km')).toBe(7000);
    expect(readAmount('0.75 kilometres', 'km')).toBe(750);
    expect(readAmount('500', 'km')).toBe(500000);
  });

  it('refuses what is not a walk', () => {
    for (const typed of ['', 'a lot', '0', '-3', '501', '1.2.3', '4,5678']) expect(readAmount(typed, 'km')).toBeNull();
    for (const typed of ['', 'many', '0', '500001', '4.5km x']) expect(readAmount(typed, 'steps')).toBeNull();
  });

  it('reads steps as they are, with or without the marks between thousands', () => {
    expect(readAmount('8400', 'steps')).toBe(8400);
    expect(readAmount('8,400', 'steps')).toBe(8400);
    expect(readAmount('12.300 steps', 'steps')).toBe(12300);
  });

  it('shows many kilometres whole and few with one decimal', () => {
    expect(numberOf(1_240_000, 'km')).toBe('1,240');
    expect(numberOf(2_100_000, 'km')).toBe('2,100');
    expect(numberOf(44_000, 'km')).toBe('44');
    expect(numberOf(4_500, 'km')).toBe('4.5');
    expect(numberOf(28_750, 'km')).toBe('28.8');
    expect(numberOf(31_020, 'km')).toBe('31');
    expect(numberOf(0, 'km')).toBe('0');
    expect(numberOf(8400, 'steps')).toBe('8,400');
  });

  it('knows a board in steps from one in kilometres, and how long a bar is', () => {
    expect(unitOf('steps')).toBe('steps');
    expect(unitOf('km')).toBe('km');
    expect(unitOf('anything else')).toBe('km');
    expect(barOf(38, 44)).toBeCloseTo(0.8636, 3);
    expect(barOf(44, 44)).toBe(1);
    expect(barOf(5, 0)).toBe(0);
  });
});
