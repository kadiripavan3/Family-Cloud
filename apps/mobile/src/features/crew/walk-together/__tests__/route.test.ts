import { BOX, cover, fitRoute, onScreen, pathBetween, pointAt, ROUTE_BOX } from '../route';

describe('the line of the walk', () => {
  it('starts and ends where the drawing has it', () => {
    expect(pointAt(0)).toEqual({ x: 322, y: 130 });
    expect(pointAt(1)).toEqual({ x: 70, y: 344 });
    // Anything that isn't a part of the way is the nearest end.
    expect(pointAt(-1)).toEqual(pointAt(0));
    expect(pointAt(7)).toEqual(pointAt(1));
    expect(pointAt(Number.NaN)).toEqual(pointAt(0));
  });

  it('goes down and to the left all the way, at an even pace', () => {
    const points = Array.from({ length: 21 }, (_, index) => pointAt(index / 20));
    for (let index = 1; index < points.length; index++) {
      expect(points[index]!.x).toBeLessThan(points[index - 1]!.x);
      expect(points[index]!.y).toBeGreaterThan(points[index - 1]!.y);
    }
    const steps = points.slice(1).map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(0.5);
  });

  it('puts 59% of the way near where the drawing has its marker', () => {
    // The drawing's marker for 1,240 of 2,100 km stands at 168, 240.
    const here = pointAt(1240 / 2100);
    expect(Math.abs(here.x - 168)).toBeLessThan(14);
    expect(Math.abs(here.y - 240)).toBeLessThan(14);
  });

  it('draws the part that is walked and the part that is left as two paths that meet', () => {
    const walked = pathBetween(0, 0.59);
    const left = pathBetween(0.59, 1);
    expect(walked.startsWith('M322 130L')).toBe(true);
    expect(left.endsWith('L70 344')).toBe(true);
    const end = /L([\d.]+) ([\d.]+)$/.exec(walked)!;
    expect(left.startsWith(`M${end[1]} ${end[2]}L`)).toBe(true);
    expect(pathBetween(0.4, 0.4)).toBe('');
    expect(pathBetween(1, 1)).toBe('');
  });
});

describe('where the walk goes on a screen', () => {
  it('lies exactly where the drawing has it on the phone it was drawn for', () => {
    expect(cover(BOX.width, BOX.height)).toEqual({ scale: 1, left: 0, top: 0 });
    // The head ends at 108 under a status bar; the sheet begins near 506.
    const fit = fitRoute(390, 844, { top: 108, bottom: 506 });
    expect(fit).toEqual({ scale: 1, left: 0, top: 0 });
    expect(onScreen(pointAt(0), fit)).toEqual({ x: 322, y: 130 });
  });

  it('is made smaller and centred when it would not be in view', () => {
    for (const [width, height, room] of [
      [320, 568, { top: 60, bottom: 250 }],
      [1280, 800, { top: 60, bottom: 460 }],
      [390, 844, { top: 108, bottom: 300 }],
    ] as const) {
      const fit = fitRoute(width, height, room);
      const [start, end] = [onScreen(pointAt(0), fit), onScreen(pointAt(1), fit)];
      expect(start.y).toBeGreaterThanOrEqual(room.top);
      expect(end.y).toBeLessThanOrEqual(room.bottom);
      expect(end.x).toBeGreaterThanOrEqual(0);
      expect(start.x).toBeLessThanOrEqual(width);
      // Centred between the sides.
      expect((start.x + end.x) / 2).toBeCloseTo(width / 2, 5);
    }
  });

  it('never makes the line too small to see', () => {
    const fit = fitRoute(200, 300, { top: 100, bottom: 120 });
    expect(fit.scale).toBeGreaterThanOrEqual(0.4);
    expect(ROUTE_BOX.right - ROUTE_BOX.left).toBe(252);
  });
});
