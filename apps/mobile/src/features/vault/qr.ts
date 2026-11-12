/**
 * A QR code of a short text, for the Vault key on its own screen: so it can be photographed onto paper, or
 * read by another phone's camera, instead of copied out by hand.
 *
 * Small on purpose: it writes only what a Vault key needs. Capital letters, digits and a few signs
 * ("alphanumeric mode"), versions 1 and 2 (21 and 25 squares a side), error correction level M, one block.
 * A Vault key's 24 characters fit version 2. Follows ISO/IEC 18004; nothing here is secret machinery, it only
 * draws what is on the screen as text already.
 */

const CHARACTERS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/** For each version: squares a side, how many bytes of data and of error correction (level M), and where its one alignment pattern sits. */
const VERSIONS = [
  { version: 1, size: 21, data: 16, check: 10, align: null },
  { version: 2, size: 25, data: 28, check: 16, align: 18 },
] as const;

/** How many characters of this kind a version holds: 4 bits of mode, 9 of length, 11 for each pair. */
const capacity = (dataBytes: number) => Math.floor(((dataBytes * 8 - 13) * 2) / 11);

// ---------- the bytes ----------

/** The text as data bytes: mode, length, the characters two at a time, then padding up to what the version holds. */
export function dataBytes(text: string, count: number): Uint8Array {
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };
  push(0b0010, 4);
  push(text.length, 9);
  for (let i = 0; i < text.length; i += 2) {
    const a = CHARACTERS.indexOf(text[i]!);
    const b = i + 1 < text.length ? CHARACTERS.indexOf(text[i + 1]!) : -1;
    if (a < 0 || (i + 1 < text.length && b < 0)) throw new Error('only capital letters, digits and a few signs fit this code');
    if (b < 0) push(a, 6);
    else push(a * 45 + b, 11);
  }
  if (bits.length > count * 8) throw new Error('too long for this code');
  push(0, Math.min(4, count * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const bytes = new Uint8Array(count);
  for (let i = 0; i < bits.length; i += 1) bytes[i >> 3]! |= bits[i]! << (7 - (i & 7));
  for (let i = bits.length / 8, pad = 0xec; i < count; i += 1, pad ^= 0xec ^ 0x11) bytes[i] = pad;
  return bytes;
}

/** Multiplication in the field the code's error correction uses: GF(256) with x^8 + x^4 + x^3 + x^2 + 1. */
function multiply(a: number, b: number): number {
  let product = 0;
  for (let bit = 7; bit >= 0; bit -= 1) {
    product = (product << 1) ^ ((product >> 7) * 0x11d);
    product ^= ((b >> bit) & 1) * a;
  }
  return product;
}

/** The error correction bytes for some data (Reed-Solomon): the remainder of dividing by the generator polynomial. */
export function checkBytes(data: Uint8Array, count: number): Uint8Array {
  // The generator: (x - 1)(x - 2)(x - 4)... with `count` factors. Its highest coefficient (1) is left out.
  const generator = new Uint8Array(count);
  generator[count - 1] = 1;
  let root = 1;
  for (let i = 0; i < count; i += 1) {
    for (let j = 0; j < count; j += 1) {
      generator[j] = multiply(generator[j]!, root);
      if (j + 1 < count) generator[j]! ^= generator[j + 1]!;
    }
    root = multiply(root, 2);
  }
  const rest = new Uint8Array(count);
  for (const byte of data) {
    const factor = byte ^ rest[0]!;
    rest.copyWithin(0, 1);
    rest[count - 1] = 0;
    for (let j = 0; j < count; j += 1) rest[j]! ^= multiply(generator[j]!, factor);
  }
  return rest;
}

/** The 15 bits that say which error correction level (M) and which mask a code uses, protected by their own check bits. */
export function formatBits(mask: number): number {
  const data = mask; // level M is 00, in front of the mask's three bits
  let rest = data;
  for (let i = 0; i < 10; i += 1) rest = (rest << 1) ^ ((rest >> 9) * 0x537);
  return ((data << 10) | rest) ^ 0x5412;
}

// ---------- the squares ----------

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

type Grid = boolean[][];

/** The code for one mask: the fixed patterns, the format bits, and the data laid out in its zigzag and masked. */
function draw(size: number, align: number | null, codewords: Uint8Array, mask: number): Grid {
  const dark: Grid = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed: Grid = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, on: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    dark[y]![x] = on;
    fixed[y]![x] = true;
  };
  // The dotted lines between the corners.
  for (let i = 0; i < size; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // The three big corner squares, each with a light border around it.
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, ring !== 2 && ring !== 4);
      }
    }
  }
  // The small square near the fourth corner.
  if (align !== null) {
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) set(align + dx, align + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // The format bits, twice: around the top-left corner, and split between the other two.
  const format = formatBits(mask);
  const bit = (i: number) => ((format >> i) & 1) === 1;
  for (let i = 0; i <= 5; i += 1) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true);
  // The data: two columns at a time from the right, up and down in turn, skipping what is fixed.
  let at = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - step : step;
        if (fixed[y]![x]) continue;
        const on = at < codewords.length * 8 && ((codewords[at >> 3]! >> (7 - (at & 7))) & 1) === 1;
        dark[y]![x] = on !== MASKS[mask]!(x, y);
        at += 1;
      }
    }
  }
  return dark;
}

/** How hard a code is to read, by the standard's four rules: long runs, 2 by 2 blocks, shapes that look like a corner square, and too much dark or light. Lower is better. */
export function penalty(grid: Grid): number {
  const size = grid.length;
  let points = 0;
  const lines = [...grid, ...grid.map((_, x) => grid.map((row) => row[x]!))];
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i += 1) {
      if (i < size && line[i] === line[i - 1]) run += 1;
      else {
        if (run >= 5) points += run - 2;
        run = 1;
      }
    }
    const text = line.map((on) => (on ? '1' : '0')).join('');
    for (let i = 0; i + 11 <= size; i += 1) {
      const part = text.slice(i, i + 11);
      if (part === '10111010000' || part === '00001011101') points += 40;
    }
  }
  let count = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (grid[y]![x]) count += 1;
      if (x + 1 < size && y + 1 < size && grid[y]![x] === grid[y]![x + 1] && grid[y]![x] === grid[y + 1]![x] && grid[y]![x] === grid[y + 1]![x + 1]) points += 3;
    }
  }
  points += Math.floor(Math.abs((count * 100) / (size * size) - 50) / 5) * 10;
  return points;
}

/**
 * The QR code of a text, as rows of squares: true is dark. The smallest version that holds the text is
 * used, with the mask that reads best. Throws for a text it can't write (small letters, or too long).
 */
export function qrCode(text: string): boolean[][] {
  const fits = VERSIONS.find((one) => text.length <= capacity(one.data));
  if (!fits) throw new Error('too long for this code');
  const data = dataBytes(text, fits.data);
  const codewords = new Uint8Array(fits.data + fits.check);
  codewords.set(data);
  codewords.set(checkBytes(data, fits.check), fits.data);
  let best: Grid | null = null;
  let least = Infinity;
  for (let mask = 0; mask < MASKS.length; mask += 1) {
    const grid = draw(fits.size, fits.align, codewords, mask);
    const points = penalty(grid);
    if (points < least) {
      least = points;
      best = grid;
    }
  }
  return best!;
}
