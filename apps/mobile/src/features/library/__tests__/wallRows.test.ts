import { id, lakeItems, moment, photo, thursday } from '@/test/samples/library';

import { aspectOf, dayOf, lastDayOf, MOMENT_SHAPES, photoRows, wallRows } from '../wallRows';

const many = (count: number, from = 100) => Array.from({ length: count }, (_, index) => photo({ id: id(from + index) }));
const sizes = (count: number) => photoRows(many(count), 390).map((row) => row.cells.length);

describe('the rows of the wall', () => {
  it('lays seven photos out as drawn: two, three, two, at the drawn heights', () => {
    const rows = photoRows(lakeItems, 390);
    expect(rows.map((row) => row.cells.length)).toEqual([2, 3, 2]);
    expect(rows.map((row) => row.height)).toEqual([150, 104, 128]);
    // The first of the first row is the wide one, the last of the second, the second of the third.
    expect(rows[0]!.cells[0]!.flex).toBeGreaterThan(rows[0]!.cells[1]!.flex);
    expect(rows[2]!.cells[1]!.flex).toBeGreaterThan(rows[2]!.cells[0]!.flex);
    expect(rows[0]!.key).toBe(lakeItems[0]!.id);
  });

  it('never leaves a photo alone at the end of a day, unless it is the only one', () => {
    expect(sizes(1)).toEqual([1]);
    expect(sizes(2)).toEqual([2]);
    expect(sizes(3)).toEqual([3]);
    expect(sizes(4)).toEqual([2, 2]);
    expect(sizes(5)).toEqual([2, 3]);
    expect(sizes(6)).toEqual([2, 2, 2]);
    expect(sizes(8)).toEqual([2, 3, 3]);
    expect(sizes(9)).toEqual([2, 3, 2, 2]);
    for (let count = 2; count < 40; count += 1) expect(sizes(count)).not.toContain(1);
    for (let count = 1; count < 40; count += 1) expect(sizes(count).reduce((sum, size) => sum + size, 0)).toBe(count);
  });

  it('makes a row only as tall as its photos need, and never taller than drawn', () => {
    const wide = [photo({ id: id(1), width: 3000, height: 1000 }), photo({ id: id(2), width: 3000, height: 1000 })];
    expect(photoRows(wide, 390)[0]!.height).toBeLessThan(150);
    expect(photoRows(wide, 390)[0]!.height).toBeGreaterThanOrEqual(88);
    expect(photoRows([photo({ width: 700, height: 1400 })], 390)[0]!.height).toBe(240);
  });

  it("draws a moment's own page a little lower", () => {
    expect(photoRows(lakeItems, 390, MOMENT_SHAPES).map((row) => row.height)).toEqual([138, 100, 120]);
  });

  it('takes a photo as wide as it is, within reason, and a video of unknown size as a little wider than tall', () => {
    expect(aspectOf({ width: 780, height: 700, kind: 'photo' })).toBeCloseTo(1.114, 2);
    expect(aspectOf({ width: 9000, height: 1000, kind: 'photo' })).toBe(2.4);
    expect(aspectOf({ width: 500, height: 4000, kind: 'photo' })).toBe(0.5);
    expect(aspectOf({ width: null, height: null, kind: 'video' })).toBeCloseTo(4 / 3);
    expect(aspectOf({ width: null, height: null, kind: 'photo' })).toBe(1);
  });

  it('puts each run of one moment under its own line', () => {
    const home = [20, 21, 22].map((n) => photo({ id: id(n), momentId: id(20), takenLocal: '2026-11-05T18:00:00' }));
    const rows = wallRows([...lakeItems, ...home], [moment(), thursday], 390);
    expect(rows.map((row) => row.type)).toEqual(['day', 'row', 'row', 'row', 'day', 'row']);
    const [lake, , , , thursdays] = rows;
    expect(lake).toMatchObject({ type: 'day', day: '2026-11-07', moment: { title: 'Saturday at Lake Bled' } });
    expect(thursdays).toMatchObject({ type: 'day', day: '2026-11-05', moment: { title: 'Thursday' } });
    // Every row has its own key, however the pages arrive.
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });

  it('still makes a line for photos whose moment did not come with the page', () => {
    const rows = wallRows([photo({ momentId: null })], [], 390);
    expect(rows[0]).toMatchObject({ type: 'day', day: '2026-11-07', moment: null });
  });

  it('reads the day from the clock where the photo was taken', () => {
    expect(dayOf({ takenLocal: '2026-11-07T23:59:00', takenAt: '2026-11-08T07:59:00Z' })).toBe('2026-11-07');
    expect(dayOf({ takenLocal: undefined, takenAt: '2026-11-08T07:59:00Z' })).toBe('2026-11-08');
  });

  it('knows the last day of a month, leap years too', () => {
    expect(lastDayOf('2026-11')).toBe('2026-11-30');
    expect(lastDayOf('2026-12')).toBe('2026-12-31');
    expect(lastDayOf('2026-02')).toBe('2026-02-28');
    expect(lastDayOf('2028-02')).toBe('2028-02-29');
  });
});
