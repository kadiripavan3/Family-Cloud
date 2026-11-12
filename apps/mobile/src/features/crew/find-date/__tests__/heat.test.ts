import { heatOf, mix, mostOf, paleRange, weeksOf } from '../heat';

describe('how dark a day is drawn', () => {
  it('knows the most who can do any one day', () => {
    expect(mostOf([{ free: 0 }, { free: 3 }, { free: 4 }, { free: 1 }])).toBe(4);
    expect(mostOf([])).toBe(0);
  });

  it('draws the day with the most darkest, up to half of that pale, and the rest in between', () => {
    // As the drawing has it for five friends: one or two is pale, three in between, four the darkest.
    expect([0, 1, 2, 3, 4].map((free) => heatOf(free, 4))).toEqual([0, 1, 1, 2, 3]);
    expect([1, 2, 3, 4, 5].map((free) => heatOf(free, 5))).toEqual([1, 1, 2, 2, 3]);
    expect([1, 2].map((free) => heatOf(free, 2))).toEqual([1, 3]);
    // One answer so far: its days are the best there are.
    expect(heatOf(1, 1)).toBe(3);
    expect(heatOf(0, 0)).toBe(0);
  });

  it('says what the pale colour stands for', () => {
    expect(paleRange(4)).toEqual({ from: 1, to: 2 });
    expect(paleRange(3)).toEqual({ from: 1, to: 1 });
    expect(paleRange(7)).toEqual({ from: 1, to: 3 });
    expect(paleRange(1)).toBeNull();
    expect(paleRange(0)).toBeNull();
  });
});

describe('the weeks of the days offered', () => {
  const offered = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => ({ day: `2026-11-${String(from + index).padStart(2, '0')}` }));

  it('is whole weeks from a Monday, as the drawing has them', () => {
    // 16 November 2026 is a Monday: three weeks to Sunday 6 December.
    const days = [...offered(16, 30), ...['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'].map((day) => ({ day }))];
    const cells = weeksOf(days);
    expect(cells).toHaveLength(21);
    expect(cells[0]).toEqual({ day: '2026-11-16', offered: { day: '2026-11-16' } });
    expect(cells[20]?.day).toBe('2026-12-06');
    expect(cells.every((cell) => cell.offered !== null)).toBe(true);
  });

  it('leaves the days before the first and after the last empty', () => {
    // Thursday 12 to Tuesday 17 November: two weeks, with three empty squares before and five after.
    const cells = weeksOf(offered(12, 17));
    expect(cells).toHaveLength(14);
    expect(cells.slice(0, 3).map((cell) => cell.offered)).toEqual([null, null, null]);
    expect(cells[3]).toEqual({ day: '2026-11-12', offered: { day: '2026-11-12' } });
    expect(cells.slice(9).every((cell) => cell.offered === null)).toBe(true);
    expect(weeksOf([])).toEqual([]);
  });
});

describe('mixing two colours', () => {
  it('takes a part of the first and the rest of the second', () => {
    expect(mix('#ffffff', '#000000', 0.5)).toBe('#808080');
    expect(mix('#FFC21A', '#FFF3CC', 1)).toBe('#ffc21a');
    expect(mix('#FFC21A', '#FFF3CC', 0)).toBe('#fff3cc');
    expect(mix('#FFC21A', '#FFF3CC', 0.55)).toBe('#ffd86a');
  });
});
