import { pointAt, sliceMiddles, slicePath } from '../wheel';

describe('the geometry of the wheel', () => {
  it('puts four jobs in the middle of four quarters, clockwise from the top', () => {
    expect(sliceMiddles(4)).toEqual([45, 135, 225, 315]);
    expect(sliceMiddles(1)).toEqual([180]);
    expect(sliceMiddles(0)).toEqual([]);
  });

  it('finds a point at an angle: up, right, down, left', () => {
    const centre = { x: 100, y: 100 };
    const round = (point: { x: number; y: number }) => ({ x: Math.round(point.x), y: Math.round(point.y) });
    expect(round(pointAt(centre, 0, 50))).toEqual({ x: 100, y: 50 });
    expect(round(pointAt(centre, 90, 50))).toEqual({ x: 150, y: 100 });
    expect(round(pointAt(centre, 180, 50))).toEqual({ x: 100, y: 150 });
    expect(round(pointAt(centre, 270, 50))).toEqual({ x: 50, y: 100 });
    // On an oval the sides are further out than the top: where the people stand around the wheel.
    expect(round(pointAt(centre, 45, 143, 123))).toEqual({ x: 201, y: 13 });
  });

  it('draws a slice from the centre, round the rim and back', () => {
    expect(slicePath({ x: 100, y: 100 }, 50, 0, 90)).toBe('M100 100 L100 50 A50 50 0 0 1 150 100 Z');
    expect(slicePath({ x: 100, y: 100 }, 50, 0, 270)).toContain(' 0 1 1 ');
  });
});
