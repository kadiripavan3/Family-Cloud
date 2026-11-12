import { formatMonthName, formatMonthAbbr } from '@/lib/dates';
import { formatAmount, formatMoneyAbout, formatMoneyExact, formatMoneyRound, moneyToType, parseMoney, toWhole } from '@/lib/money';

describe('money, the ways the drawings write it', () => {
  it('keeps its cents where every cent matters: a bill, a cell, an answer', () => {
    expect(formatMoneyExact(8420)).toBe('€84.20');
    expect(formatMoneyExact(98000)).toBe('€980.00');
    expect(formatMoneyExact(514000)).toBe('€5,140.00');
    expect(formatMoneyExact(-4210)).toBe('-€42.10');
    expect(formatMoneyExact(1999, 'USD')).toBe('$19.99');
  });

  it('is rounded to whole units on a card', () => {
    expect(formatMoneyRound(231819)).toBe('€2,318');
    expect(formatMoneyRound(8596)).toBe('€86');
    expect(formatMoneyRound(118866)).toBe('€1,189');
    expect(formatMoneyRound(11659963)).toBe('€116,600');
    expect(formatMoneyRound(6322)).toBe('€63');
    expect(formatMoneyRound(0)).toBe('€0');
  });

  it('rounds halves away from nothing, with whole numbers only', () => {
    expect(toWhole(8450)).toBe(85);
    expect(toWhole(8449)).toBe(84);
    expect(toWhole(-8450)).toBe(-85);
    expect(toWhole(49)).toBe(0);
    expect(toWhole(5230)).toBe(52);
  });

  it('is a rough figure after "about"', () => {
    expect(formatMoneyAbout(1495567)).toBe('€15,000');
    expect(formatMoneyAbout(11659963)).toBe('€120,000');
    expect(formatMoneyAbout(6322)).toBe('€63');
    expect(formatMoneyAbout(123456)).toBe('€1,200');
  });

  it('is a bare number in a grid whose column says the currency', () => {
    expect(formatAmount(148000)).toBe('1,480.00');
    expect(formatAmount(64000)).toBe('640.00');
    expect(formatAmount(5)).toBe('0.05');
  });

  it('reads what was typed as whole cents, however the cents were marked', () => {
    expect(parseMoney('84.20')).toBe(8420);
    expect(parseMoney('84,2')).toBe(8420);
    expect(parseMoney('€1,240')).toBe(124000);
    expect(parseMoney('1.240,50')).toBe(124050);
    expect(parseMoney('1,240.5')).toBe(124050);
    expect(parseMoney('2350')).toBe(235000);
    expect(parseMoney(' 0.07 ')).toBe(7);
    expect(parseMoney('-12')).toBe(-1200);
    expect(parseMoney('19.99')).toBe(1999);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('soon')).toBeNull();
  });

  it('puts an amount into a box as plain digits', () => {
    expect(moneyToType(235000)).toBe('2350.00');
    expect(moneyToType(7)).toBe('0.07');
    expect(moneyToType(-1250)).toBe('-12.50');
    expect(moneyToType(null)).toBe('');
    // What is put in comes out the same.
    for (const cents of [0, 1, 99, 100, 8420, 1999, 123456789]) expect(parseMoney(moneyToType(cents))).toBe(cents);
  });
});

describe('a month by its name', () => {
  it('is written whole, and short under a bar', () => {
    expect(formatMonthName('2026-11-01')).toBe('November');
    expect(formatMonthAbbr('2026-06-13')).toBe('Jun');
  });
});
