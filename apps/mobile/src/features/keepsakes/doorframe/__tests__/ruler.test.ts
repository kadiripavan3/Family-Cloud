import { inCm, labelled, placeOf, toMm, windowOf } from '../ruler';

describe("the doorframe's ruler", () => {
  it('shows sixty centimetres from a little under the lowest mark, as the drawing does', () => {
    const window = windowOf([1380, 1320, 1260, 1190, 1120, 1050]);
    expect(window).toEqual({ from: 900, to: 1500 });
    expect(placeOf(1380, window)).toBeCloseTo(0.8);
    expect(placeOf(1050, window)).toBeCloseTo(0.25);
    expect(placeOf(1190, window)).toBeCloseTo(0.483, 2);
  });

  it('grows when the marks are far apart, and has a place for an empty frame', () => {
    expect(windowOf([800, 1750])).toEqual({ from: 600, to: 1900 });
    expect(windowOf([])).toEqual({ from: 900, to: 1500 });
    expect(placeOf(2000, { from: 900, to: 1500 })).toBe(1);
    expect(placeOf(100, { from: 900, to: 1500 })).toBe(0);
  });

  it('writes a height in centimetres and reads one that was typed', () => {
    expect(inCm(1380)).toBe('138');
    expect(inCm(1215)).toBe('121.5');
    expect(toMm('138')).toBe(1380);
    expect(toMm(' 121,5 ')).toBe(1215);
    expect(toMm('12')).toBeNull();
    expect(toMm('tall')).toBeNull();
    expect(toMm('300')).toBeNull();
  });

  it('gives words to the newer of two marks that stand too close together', () => {
    const window = { from: 900, to: 1500 };
    const marks = [
      { id: 'mia-new', heightMm: 1380, day: '2026-11-02' },
      { id: 'mia-old', heightMm: 1215, day: '2023-12-06' },
      { id: 'leo-new', heightMm: 1190, day: '2026-11-02' },
      { id: 'leo-old', heightMm: 1120, day: '2025-09-15' },
    ];
    // 500 points of ruler for 60 cm: 1215 and 1190 are 21 points apart, 1190 and 1120 are 58.
    expect([...labelled(marks, window, 500, 24)]).toEqual(['mia-new', 'leo-new', 'leo-old']);
    expect(labelled(marks, window, 500, 12).size).toBe(4);
  });
});
