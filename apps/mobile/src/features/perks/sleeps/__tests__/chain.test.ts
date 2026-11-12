import { layoutOf, linksOf, rowsOf, tintOf } from '../chain';

describe('the paper chain', () => {
  it('has a link for every sleep there was, the ones that are gone first', () => {
    const links = linksOf({ links: 14, off: 2, canTear: true });
    expect(links).toHaveLength(14);
    expect(links.map((link) => link.off)).toEqual([true, true, ...Array<boolean>(12).fill(false)]);
    // Tonight's is the first that is still on: the yellow one of the drawing.
    expect(links.findIndex((link) => link.tonight)).toBe(2);
    expect(links[2]!.tint).toBe(0);
  });

  it("has no link for tonight once tonight's was torn off, or when the day has come", () => {
    expect(linksOf({ links: 14, off: 3, canTear: false }).some((link) => link.tonight)).toBe(false);
    expect(linksOf({ links: 0, off: 0, canTear: false })).toEqual([]);
  });

  it('colours the links as the drawing does, and each keeps its colour as others come off', () => {
    expect(Array.from({ length: 12 }, (_, index) => tintOf(index + 2))).toEqual([0, 2, 1, 3, 0, 4, 5, 2, 0, 1, 3, 4]);
    expect(linksOf({ links: 14, off: 2, canTear: true })[5]!.tint).toBe(linksOf({ links: 14, off: 4, canTear: true })[5]!.tint);
    expect(tintOf(0)).toBe(3);
    expect(tintOf(14)).toBe(0);
  });

  it('lays links flat and on edge by turns, each overlapping the next', () => {
    const { lefts, width } = layoutOf(linksOf({ links: 14, off: 2, canTear: true }));
    expect(lefts.slice(0, 4)).toEqual([0, 24, 30, 54]);
    expect(width).toBe(222);
    expect(layoutOf([])).toEqual({ lefts: [], width: 0 });
  });

  it('breaks a long chain into rows', () => {
    expect(rowsOf(linksOf({ links: 60, off: 0, canTear: true }), 20).map((row) => row.length)).toEqual([20, 20, 20]);
    expect(rowsOf(linksOf({ links: 14, off: 0, canTear: true }), 20)).toHaveLength(1);
  });
});
