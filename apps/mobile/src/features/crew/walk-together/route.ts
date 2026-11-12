/**
 * The line of the walk, as the drawing has it: no map, no places on the earth, just one curve from the start
 * (top right) to the end (bottom left) in the drawing's own box of 390 by 844. How far the crew has come is
 * a point along it, and so is each place on the way.
 */

export type Point = { x: number; y: number };

/** The drawing's box: the phone it was drawn for. */
export const BOX = { width: 390, height: 844 } as const;

type Curve = readonly [Point, Point, Point, Point];
const at = (x: number, y: number): Point => ({ x, y });

/** The drawing's route, `M322 130C290 150 262 176 230 196S170 232 140 268S96 320 70 344`, as its three curves. */
const CURVES: readonly Curve[] = [
  [at(322, 130), at(290, 150), at(262, 176), at(230, 196)],
  [at(230, 196), at(198, 216), at(170, 232), at(140, 268)],
  [at(140, 268), at(110, 304), at(96, 320), at(70, 344)],
];

/** How finely each curve is cut into straight pieces: enough that the eye sees a curve. */
const PIECES = 24;

function onCurve([a, b, c, d]: Curve, t: number): Point {
  const u = 1 - t;
  const blend = (p: number, q: number, r: number, s: number) => u * u * u * p + 3 * u * u * t * q + 3 * u * t * t * r + t * t * t * s;
  return { x: blend(a.x, b.x, c.x, d.x), y: blend(a.y, b.y, c.y, d.y) };
}

/** The route as points close together, each with how far along the line it lies (0 at the start, 1 at the end). */
const LINE: readonly (Point & { along: number })[] = (() => {
  const points: Point[] = [CURVES[0]![0]];
  for (const curve of CURVES) for (let piece = 1; piece <= PIECES; piece++) points.push(onCurve(curve, piece / PIECES));
  let walked = 0;
  const lengths = points.map((point, index) => {
    const before = points[index - 1];
    if (before) walked += Math.hypot(point.x - before.x, point.y - before.y);
    return walked;
  });
  return points.map((point, index) => ({ ...point, along: lengths[index]! / walked }));
})();

const clamp = (fraction: number) => (Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0);

/** The point a part of the way along the line: 0 is the start, 1 the end. */
export function pointAt(fraction: number): Point {
  const part = clamp(fraction);
  const next = LINE.findIndex((point) => point.along >= part);
  const after = LINE[Math.max(next, 0)]!;
  const before = LINE[Math.max(next - 1, 0)]!;
  if (after.along === before.along) return { x: after.x, y: after.y };
  const between = (part - before.along) / (after.along - before.along);
  return { x: before.x + (after.x - before.x) * between, y: before.y + (after.y - before.y) * between };
}

/** The line between two parts of the way, as the path a drawing takes: "M322 130L318.1 132.4…". */
export function pathBetween(from: number, to: number): string {
  const [start, end] = [clamp(from), clamp(to)];
  if (end <= start) return '';
  const inside = LINE.filter((point) => point.along > start && point.along < end);
  const round = (value: number) => Math.round(value * 10) / 10;
  return [pointAt(start), ...inside, pointAt(end)].map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`).join('');
}

/** What is drawn of the route box, in the drawing's own measures: the part the eye has to see. */
export const ROUTE_BOX = { left: 70, right: 322, top: 130, bottom: 344 } as const;

/** How the drawing's box is laid onto a screen: its scale, and where its top left corner goes. */
export type Fit = { scale: number; left: number; top: number };

/** The drawing fills the screen from the top, as wide and as tall as it has to be: the land and the sea behind everything. */
export function cover(width: number, height: number): Fit {
  const scale = Math.max(width / BOX.width, height / BOX.height) || 1;
  return { scale, left: (width - BOX.width * scale) / 2, top: 0 };
}

/**
 * Where the route goes on a screen. On the phone it was drawn for it lies exactly where the drawing has it.
 * On a screen where that would push it under the head or the sheet, or off the sides (a small phone, a wide
 * window), it is made smaller and centred in the room between them, so the whole walk stays in view.
 *
 * @param room the part of the screen that is free: under the head, above the sheet
 */
export function fitRoute(width: number, height: number, room: { top: number; bottom: number }): Fit {
  const drawn = cover(width, height);
  // What stands around the line: half a pin above the start, a pin and a name under the end, half a pin at each side.
  const edge = { top: 18, bottom: 44, side: 44 };
  const fits =
    ROUTE_BOX.top * drawn.scale + drawn.top - edge.top >= room.top &&
    ROUTE_BOX.bottom * drawn.scale + drawn.top + edge.bottom <= room.bottom &&
    ROUTE_BOX.left * drawn.scale + drawn.left - edge.side >= 0 &&
    ROUTE_BOX.right * drawn.scale + drawn.left + edge.side <= width;
  if (fits) return drawn;
  const wide = ROUTE_BOX.right - ROUTE_BOX.left;
  const tall = ROUTE_BOX.bottom - ROUTE_BOX.top;
  const free = { top: room.top + edge.top, bottom: room.bottom - edge.bottom };
  const scale = Math.max(Math.min((width - 2 * edge.side) / wide, (free.bottom - free.top) / tall, drawn.scale), 0.4);
  return { scale, left: width / 2 - ((ROUTE_BOX.left + ROUTE_BOX.right) / 2) * scale, top: (free.top + free.bottom) / 2 - ((ROUTE_BOX.top + ROUTE_BOX.bottom) / 2) * scale };
}

/** A point of the drawing, on the screen. */
export function onScreen(point: Point, fit: Fit): Point {
  return { x: point.x * fit.scale + fit.left, y: point.y * fit.scale + fit.top };
}
