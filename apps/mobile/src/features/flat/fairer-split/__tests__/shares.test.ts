import { centsAt, move, placeOf, rangeOf, stepOf } from '../shares';

const sum = (numbers: number[]) => numbers.reduce((total, one) => total + one, 0);

describe('the sums behind the sliders of a fairer split', () => {
  const rent = [37200, 31000, 26800];

  it('moves a rent by whole euros and a small pot by ten cents', () => {
    expect(stepOf(95000)).toBe(100);
    expect(stepOf(3000)).toBe(10);
  });

  it('gives a slider a stretch around an equal share, wide enough for every share there is', () => {
    const range = rangeOf(rent);
    expect(range).toEqual({ lo: 17400, hi: 42800 });
    // As the drawing has them: the big room well to the right, the small one to the left.
    expect(Math.round(placeOf(37200, range) * 100)).toBe(78);
    expect(Math.round(placeOf(26800, range) * 100)).toBe(37);
    expect(rangeOf([90000, 3000, 2000]).hi).toBe(95000);
    expect(rangeOf([1000, 1000, 1000])).toEqual({ lo: 550, hi: 1350 });
  });

  it('has nothing to drag when one person pays it all', () => {
    expect(rangeOf([95000])).toEqual({ lo: 95000, hi: 95000 });
    expect(move([95000], 0, 50000, rangeOf([95000]))).toEqual([95000]);
  });

  it('turns a place on the slider into cents and back', () => {
    const range = rangeOf(rent);
    expect(centsAt(0, range)).toBe(17400);
    expect(centsAt(1, range)).toBe(42800);
    expect(placeOf(centsAt(0.5, range), range)).toBeCloseTo(0.5);
  });

  it('moves the others to keep the total, each keeping its part of what is left', () => {
    const next = move(rent, 0, 40000, rangeOf(rent));
    expect(next).toEqual([40000, 29500, 25500]);
    expect(sum(next)).toBe(95000);
    // The other way round: the big room pays less, the two others more.
    const less = move(rent, 0, 33000, rangeOf(rent));
    expect(less[0]).toBe(33000);
    expect(less[1]!).toBeGreaterThan(31000);
    expect(less[2]!).toBeGreaterThan(26800);
    expect(sum(less)).toBe(95000);
  });

  it('lands on whole notches, and never loses a cent of an odd total', () => {
    const bill = [6079, 7015, 2806];
    const next = move(bill, 2, 4000, rangeOf(bill));
    expect(next[2]).toBe(4000);
    expect(sum(next)).toBe(15900);
  });

  it('stops a slider at the end of its stretch, and where the others would have to leave theirs', () => {
    const range = rangeOf(rent);
    expect(move(rent, 0, 99999, range)[0]).toBe(42800);
    expect(move(rent, 0, 0, range)[0]).toBe(17400);
    const two = [5000, 5000];
    const far = move(two, 0, 9000, rangeOf(two));
    expect(far).toEqual([6800, 3200]);
    for (const share of move(rent, 2, 0, range)) expect(share).toBeLessThanOrEqual(range.hi);
    expect(sum(move(rent, 2, 0, range))).toBe(95000);
  });

  it('splits what is left equally between people who had nothing', () => {
    const next = move([10000, 0, 0], 0, 6000, { lo: 0, hi: 10000 });
    expect(next).toEqual([6000, 2000, 2000]);
  });
});
