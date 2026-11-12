/** Where things stand on the wheel, by plain geometry. Angles are in degrees, clockwise from the top. */

const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** The point at an angle on a circle (or on an oval, with two radii) around a centre. */
export function pointAt(centre: { x: number; y: number }, angle: number, radiusX: number, radiusY: number = radiusX): { x: number; y: number } {
  return { x: centre.x + radiusX * Math.sin(rad(angle)), y: centre.y - radiusY * Math.cos(rad(angle)) };
}

/** The middle of each of `count` equal slices: four jobs sit at 45°, 135°, 225° and 315°. */
export function sliceMiddles(count: number): number[] {
  return Array.from({ length: count }, (_, index) => ((index + 0.5) * 360) / count);
}

/** One slice of a pie as an SVG path: from the centre out along `from`, round to `to`, and back. */
export function slicePath(centre: { x: number; y: number }, radius: number, from: number, to: number): string {
  const start = pointAt(centre, from, radius);
  const end = pointAt(centre, to, radius);
  const large = to - from > 180 ? 1 : 0;
  const n = (value: number) => Math.round(value * 100) / 100;
  return `M${n(centre.x)} ${n(centre.y)} L${n(start.x)} ${n(start.y)} A${radius} ${radius} 0 ${large} 1 ${n(end.x)} ${n(end.y)} Z`;
}
