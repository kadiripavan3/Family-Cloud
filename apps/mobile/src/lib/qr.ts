/**
 * A QR code for a short piece of text (the link behind the code by the door, a Vault key), worked out here
 * because the app has no library for it. It follows ISO/IEC 18004 for what those need and no more: the text
 * as bytes, error correction level M (a code that is printed and taped by a door gets smudged), versions 1
 * to 10 (up to 213 bytes), and the mask that scores best by the standard's own four rules.
 *
 * The answer is the square of modules, true for a dark one, without the quiet zone around it. Its test
 * holds it to another encoder's codes, square for square.
 */

/** For each version 1 to 10 at level M: error-correction codewords per block, then pairs of (how many blocks, data codewords in each). */
const BLOCKS: readonly (readonly number[])[] = [
  [10, 1, 16],
  [16, 1, 28],
  [26, 1, 44],
  [18, 2, 32],
  [24, 2, 43],
  [16, 4, 27],
  [18, 4, 31],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
];

/** Where the centres of the small alignment squares are, for each version. */
const ALIGNMENT: readonly (readonly number[])[] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

/** How many bytes of text the largest code this file makes can hold. */
export const QR_MAX_BYTES = 213;

// ---------- the arithmetic of the error correction: the field of 256 elements ----------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let power = 0, value = 1; power < 255; power++) {
  EXP[power] = value;
  LOG[value] = power;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}
for (let power = 255; power < 512; power++) EXP[power] = EXP[power - 255]!;

const times = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);

/** The codewords that let a reader repair a block: the remainder of the block divided by the generator polynomial. */
export function errorCorrection(data: readonly number[], count: number): number[] {
  // The generator: (x - 1)(x - 2)(x - 4)… with `count` factors, highest power first, its leading 1 left out.
  let generator = [1];
  for (let factor = 0; factor < count; factor++) {
    const next = new Array<number>(generator.length + 1).fill(0);
    for (let at = 0; at < generator.length; at++) {
      next[at] = next[at]! ^ generator[at]!;
      next[at + 1] = next[at + 1]! ^ times(generator[at]!, EXP[factor]!);
    }
    generator = next;
  }
  const remainder = new Array<number>(count).fill(0);
  for (const byte of data) {
    const lead = byte ^ remainder.shift()!;
    remainder.push(0);
    for (let at = 0; at < count; at++) remainder[at] = remainder[at]! ^ times(generator[at + 1]!, lead);
  }
  return remainder;
}

// ---------- the text as codewords ----------

/** The text as the bytes of UTF-8. */
export function utf8(text: string): number[] {
  const bytes: number[] = [];
  for (const symbol of text) {
    const code = symbol.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return bytes;
}

const dataCodewords = (version: number) => {
  const [, ...groups] = BLOCKS[version - 1]!;
  let total = 0;
  for (let at = 0; at < groups.length; at += 2) total += groups[at]! * groups[at + 1]!;
  return total;
};

/** How many bytes of text a version holds: its data codewords less the four bits that say "bytes" and the count. */
const capacity = (version: number) => Math.floor((dataCodewords(version) * 8 - 4 - (version < 10 ? 8 : 16)) / 8);

/** The smallest version that holds this many bytes, or null when even the largest doesn't. */
export function versionFor(byteCount: number): number | null {
  for (let version = 1; version <= BLOCKS.length; version++) if (byteCount <= capacity(version)) return version;
  return null;
}

/** Every codeword of the code in the order it is laid out: the blocks' data woven together, then their error correction. */
function codewords(bytes: readonly number[], version: number): number[] {
  const room = dataCodewords(version);
  const bits: number[] = [];
  const put = (value: number, length: number) => {
    for (let at = length - 1; at >= 0; at--) bits.push((value >> at) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) put(byte, 8);
  put(0, Math.min(4, room * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let at = 0; at < bits.length; at += 8) data.push(bits.slice(at, at + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  for (let pad = 0xec; data.length < room; pad ^= 0xec ^ 0x11) data.push(pad);

  const [perBlock, ...groups] = BLOCKS[version - 1]!;
  const blocks: number[][] = [];
  let from = 0;
  for (let at = 0; at < groups.length; at += 2) {
    for (let n = 0; n < groups[at]!; n++) {
      blocks.push(data.slice(from, from + groups[at + 1]!));
      from += groups[at + 1]!;
    }
  }
  const repairs = blocks.map((block) => errorCorrection(block, perBlock!));
  const out: number[] = [];
  const longest = Math.max(...blocks.map((block) => block.length));
  for (let at = 0; at < longest; at++) for (const block of blocks) if (at < block.length) out.push(block[at]!);
  for (let at = 0; at < perBlock!; at++) for (const repair of repairs) out.push(repair[at]!);
  return out;
}

// ---------- the square ----------

type Grid = { size: number; dark: boolean[][]; fixed: boolean[][] };

function emptyGrid(version: number): Grid {
  const size = 17 + 4 * version;
  const rows = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  return { size, dark: rows(), fixed: rows() };
}

/** Sets one module of a fixed pattern: nothing of the text may be written there. */
function fix(grid: Grid, x: number, y: number, dark: boolean) {
  if (x < 0 || y < 0 || x >= grid.size || y >= grid.size) return;
  grid.dark[y]![x] = dark;
  grid.fixed[y]![x] = true;
}

/** The three big squares in the corners with the light band around each, the small squares, and the two dotted lines between them. */
function drawPatterns(grid: Grid, version: number) {
  const { size } = grid;
  for (let at = 0; at < size; at++) {
    fix(grid, 6, at, at % 2 === 0);
    fix(grid, at, 6, at % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        fix(grid, cx + dx, cy + dy, ring !== 2 && ring !== 4);
      }
    }
  }
  const centres = ALIGNMENT[version - 1]!;
  for (const cy of centres) {
    for (const cx of centres) {
      // Not where a big square already stands.
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fix(grid, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

/** The fifteen bits that say "level M, this mask", protected by their own small code, written twice. */
function drawFormat(grid: Grid, mask: number) {
  const { size } = grid;
  // Level M is 00, so the five bits of data are the mask alone.
  const data = mask;
  let remainder = data;
  for (let at = 0; at < 10; at++) remainder = (remainder << 1) ^ ((remainder >> 9) * 0x537);
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const bit = (at: number) => ((bits >> at) & 1) === 1;
  for (let at = 0; at <= 5; at++) fix(grid, 8, at, bit(at));
  fix(grid, 8, 7, bit(6));
  fix(grid, 8, 8, bit(7));
  fix(grid, 7, 8, bit(8));
  for (let at = 9; at < 15; at++) fix(grid, 14 - at, 8, bit(at));
  for (let at = 0; at < 8; at++) fix(grid, size - 1 - at, 8, bit(at));
  for (let at = 8; at < 15; at++) fix(grid, 8, size - 15 + at, bit(at));
  fix(grid, 8, size - 8, true);
}

/** From version 7 on, the version itself is written twice as well, eighteen bits each. */
function drawVersion(grid: Grid, version: number) {
  if (version < 7) return;
  let remainder = version;
  for (let at = 0; at < 12; at++) remainder = (remainder << 1) ^ ((remainder >> 11) * 0x1f25);
  const bits = (version << 12) | remainder;
  for (let at = 0; at < 18; at++) {
    const dark = ((bits >> at) & 1) === 1;
    const a = grid.size - 11 + (at % 3);
    const b = Math.floor(at / 3);
    fix(grid, a, b, dark);
    fix(grid, b, a, dark);
  }
}

/** The codewords, bit by bit, in the zigzag that climbs and falls through pairs of columns from the right. */
function drawData(grid: Grid, words: readonly number[]) {
  const { size } = grid;
  let at = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      for (let side = 0; side < 2; side++) {
        const x = right - side;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - step : step;
        if (grid.fixed[y]![x]) continue;
        grid.dark[y]![x] = at < words.length * 8 && ((words[at >> 3]! >> (7 - (at & 7))) & 1) === 1;
        at++;
      }
    }
  }
}

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Turns over the modules of the text that a mask picks. Doing it twice puts them back. */
function applyMask(grid: Grid, mask: number) {
  const picks = MASKS[mask]!;
  for (let y = 0; y < grid.size; y++) for (let x = 0; x < grid.size; x++) if (!grid.fixed[y]![x] && picks(x, y)) grid.dark[y]![x] = !grid.dark[y]![x];
}

/** How hard a square is to read, by the standard's four rules: long runs, blocks, shapes like the corner squares, and too much of one colour. */
export function penalty(dark: readonly (readonly boolean[])[]): number {
  const size = dark.length;
  let score = 0;
  const lines: boolean[][] = [];
  for (let at = 0; at < size; at++) {
    lines.push([...dark[at]!]);
    lines.push(dark.map((row) => row[at]!));
  }
  for (const line of lines) {
    let run = 1;
    for (let at = 1; at <= size; at++) {
      if (at < size && line[at] === line[at - 1]) {
        run++;
        continue;
      }
      if (run >= 5) score += run - 2;
      run = 1;
    }
    // A dark-light-dark-dark-dark-light-dark shape with four light modules on one side looks like a corner square.
    const text = line.map((one) => (one ? '1' : '0')).join('');
    for (let at = 0; at + 11 <= size; at++) {
      const piece = text.slice(at, at + 11);
      if (piece === '10111010000' || piece === '00001011101') score += 40;
    }
  }
  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const one = dark[y]![x];
      if (one === dark[y]![x + 1] && one === dark[y + 1]![x] && one === dark[y + 1]![x + 1]) score += 3;
    }
  }
  const darkCount = dark.reduce((total, row) => total + row.filter(Boolean).length, 0);
  // Ten for every full five per cent that the dark share is away from half.
  score += Math.floor((Math.abs(darkCount / (size * size) - 0.5) * 100) / 5) * 10;
  return score;
}

/**
 * The QR code for a text: its modules row by row, true for a dark one. Null when the text is longer than
 * the largest code made here holds (213 bytes), so whoever draws it can show the text itself instead.
 */
export function qrCode(text: string): boolean[][] | null {
  const bytes = utf8(text);
  const version = versionFor(bytes.length);
  if (version === null) return null;
  const grid = emptyGrid(version);
  drawPatterns(grid, version);
  drawFormat(grid, 0);
  drawVersion(grid, version);
  drawData(grid, codewords(bytes, version));

  let best = 0;
  let least = Infinity;
  for (let mask = 0; mask < MASKS.length; mask++) {
    applyMask(grid, mask);
    drawFormat(grid, mask);
    const score = penalty(grid.dark);
    if (score < least) {
      least = score;
      best = mask;
    }
    applyMask(grid, mask);
  }
  applyMask(grid, best);
  drawFormat(grid, best);
  return grid.dark;
}
