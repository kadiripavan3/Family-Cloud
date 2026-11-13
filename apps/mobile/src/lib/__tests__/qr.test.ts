import { errorCorrection, penalty, QR_MAX_BYTES, qrCode, utf8, versionFor } from '../qr';

const drawn = (code: boolean[][]) => code.map((row) => row.map((dark) => (dark ? '#' : '.')).join(''));

/** The fifteen format bits for level M and a mask, as the standard works them out. */
const formatFor = (mask: number) => {
  let remainder = mask;
  for (let at = 0; at < 10; at++) remainder = (remainder << 1) ^ ((remainder >> 9) * 0x537);
  return ((mask << 10) | remainder) ^ 0x5412;
};
/** Reads the first copy of the format bits (round the top-left square) and the second (split over the two other squares). */
const formatBits = (code: boolean[][]) => {
  const size = code.length;
  const bit = (x: number, y: number) => (code[y]![x] ? 1 : 0);
  let first = 0;
  let second = 0;
  for (let at = 0; at <= 5; at++) first |= bit(8, at) << at;
  first |= (bit(8, 7) << 6) | (bit(8, 8) << 7) | (bit(7, 8) << 8);
  for (let at = 9; at < 15; at++) first |= bit(14 - at, 8) << at;
  for (let at = 0; at < 8; at++) second |= bit(size - 1 - at, 8) << at;
  for (let at = 8; at < 15; at++) second |= bit(8, size - 15 + at) << at;
  return { first, second };
};

describe('a QR code', () => {
  it('is, module for module, the code a reader expects for a short word', () => {
    // Checked once against an independent encoder (the one the Expo CLI prints its codes with), at level M.
    expect(drawn(qrCode('hello')!)).toEqual([
      '#######..##...#######',
      '#.....#.##....#.....#',
      '#.###.#..#.##.#.###.#',
      '#.###.#...##..#.###.#',
      '#.###.#.##..#.#.###.#',
      '#.....#.....#.#.....#',
      '#######.#.#.#.#######',
      '..........###........',
      '#.#.#.#..#.#....#..#.',
      '..#.##....#...#....##',
      '.#.#..#.###.#...#####',
      '##..#.........#....#.',
      '.##.#.##..#.#.#.#....',
      '........####.#.#..###',
      '#######...##.###..###',
      '#.....#...####.##....',
      '#.###.#.#.##.###...##',
      '#.###.#..#....##..##.',
      '#.###.#.###.#...#.#.#',
      '#.....#..#....#.#..#.',
      '#######.###.#.##...##',
    ]);
  });

  it("is the code a reader expects for a door's link: two blocks, woven together", () => {
    // Checked the same way. A link of this length is a version 4 code: 33 modules a side.
    const code = drawn(qrCode('http://localhost:8105/book/6hzd5-vkx3q-4qy6v-6tz5a')!);
    expect(code).toHaveLength(33);
    expect(code.slice(0, 9)).toEqual([
      '#######.##..#..####.##.#..#######',
      '#.....#..###.....#.#..#.#.#.....#',
      '#.###.#..#####.##...##.#..#.###.#',
      '#.###.#.###.#.#..##.#.#...#.###.#',
      '#.###.#.#.##..#..########.#.###.#',
      '#.....#.#..##.#.##.#.##.#.#.....#',
      '#######.#.#.#.#.#.#.#.#.#.#######',
      '........#.#....####..#..#........',
      '#...#.#####.#....#.#.##.######..#',
    ]);
    expect(code.slice(-4)).toEqual(['#.###.#...###.#.##...###..#.#....', '#.###.#...#..##.#.#.#.##..####...', '#.....#..#.#.##..##.###.#..#.#...', '#######.####...#.#.#.#.##.#.##..#']);
  });

  it('works out the codewords that let a reader repair a smudged code', () => {
    // The standard's own worked example: the sixteen data codewords of "HELLO WORLD" at 1-M.
    expect(errorCorrection([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('picks the smallest code the text fits in, up to 213 bytes', () => {
    expect(versionFor(14)).toBe(1);
    expect(versionFor(15)).toBe(2);
    expect(versionFor(62)).toBe(4);
    expect(versionFor(63)).toBe(5);
    expect(versionFor(180)).toBe(9);
    expect(versionFor(181)).toBe(10);
    expect(versionFor(QR_MAX_BYTES)).toBe(10);
    expect(versionFor(QR_MAX_BYTES + 1)).toBeNull();
    expect(qrCode('x'.repeat(214))).toBeNull();
  });

  it('counts a letter outside ASCII as the bytes it takes', () => {
    expect(utf8('a')).toEqual([0x61]);
    expect(utf8('č')).toEqual([0xc4, 0x8d]);
    expect(utf8('€')).toEqual([0xe2, 0x82, 0xac]);
    expect(utf8('🏠')).toEqual([0xf0, 0x9f, 0x8f, 0xa0]);
  });

  it.each([1, 20, 62, 63, 106, 122, 123, 152, 180, 181, 213])('has its squares, its dotted lines and readable format bits for %i bytes', (length) => {
    const code = qrCode('k'.repeat(length))!;
    const size = code.length;
    expect(size).toBe(17 + 4 * versionFor(length)!);
    for (const row of code) expect(row).toHaveLength(size);
    // The three big squares, each a dark ring round a light one round a dark middle.
    for (const [x, y] of [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ] as const) {
      expect(drawn(code.slice(y, y + 7).map((row) => row.slice(x, x + 7)))).toEqual(['#######', '#.....#', '#.###.#', '#.###.#', '#.###.#', '#.....#', '#######']);
    }
    // The dotted lines between them, and the one module that is always dark.
    for (let at = 8; at < size - 8; at++) {
      expect(code[6]![at]).toBe(at % 2 === 0);
      expect(code[at]![6]).toBe(at % 2 === 0);
    }
    expect(code[size - 8]![8]).toBe(true);
    // Both copies of the format bits say the same: level M, and one of the eight masks.
    const { first, second } = formatBits(code);
    expect(first).toBe(second);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(formatFor)).toContain(first);
  });

  it('scores a square that is hard to read worse than one that is easy', () => {
    const blank = Array.from({ length: 21 }, () => new Array<boolean>(21).fill(false));
    const chequered = blank.map((row, y) => row.map((_, x) => (x + y) % 2 === 0));
    expect(penalty(blank)).toBeGreaterThan(penalty(chequered));
    // Nothing but one colour: every line is one long run, every block is whole, and it is as far from half dark as can be.
    expect(penalty(blank)).toBe(42 * 19 + 400 * 3 + 100);
  });
});

/**
 * Three codes as another encoder draws them, square for square: toqr 0.1.1, the one Expo's own command line
 * shows its QR codes with (worked out on 13 Nov 2026). One block, one that is a single letter, and one of four
 * blocks with letters of more than one byte.
 */
const KNOWN: { text: string; rows: string[] }[] = [
  {
    text: 'https://homeport.app/g/the-flat-x7k2m9qa',
    rows: [
      '#######..#..####.####.#######',
      '#.....#.#.#.####..###.#.....#',
      '#.###.#..###...##..#..#.###.#',
      '#.###.#.....#..##.##..#.###.#',
      '#.###.#.#..###.##..#..#.###.#',
      '#.....#...#..#.######.#.....#',
      '#######.#.#.#.#.#.#.#.#######',
      '..........#.###..#..#........',
      '#.#.#.#...####.###.##...#..#.',
      '..###...##...##.#.....#..#..#',
      '##.#####.#.#..#...#.#.###.###',
      '###.#..##.#..##.##.#.#.....#.',
      '#...###.#..#.#...#...##..#.##',
      '##..#........#...#..###..#..#',
      '.#..#.#.#.#...#.#...##.###.##',
      '###.##...#...###.###..#.##.#.',
      '.##...#....##.##.##..##..#.##',
      '..#.....#..#....#...#.#..##.#',
      '#.#..###..#..#........##...##',
      '.#.##...#.###..#####.##.##.#.',
      '#...#.###..##..###..#####....',
      '........##..##...#.##...#.###',
      '#######....##.#.##.##.#.##.##',
      '#.....#...########..#...##.#.',
      '#.###.#.#..##.#..#..#####....',
      '#.###.#..##...#.#..##..##.###',
      '#.###.#.#.#.##.....#.#.###..#',
      '#.....#..#.##.##.#.##..#...#.',
      '#######.##.#.##.##..#.#....##',
    ],
  },
  {
    text: 'a',
    rows: [
      '#######..#.##.#######',
      '#.....#.#.##..#.....#',
      '#.###.#.##.#..#.###.#',
      '#.###.#.#.##..#.###.#',
      '#.###.#..#..#.#.###.#',
      '#.....#...##..#.....#',
      '#######.#.#.#.#######',
      '........##...........',
      '#.....#.#.##.##..###.',
      '#..##......###.###..#',
      '..#.###..##.#.##.....',
      '.#.#.#.##..#####.#.#.',
      '##.#..####.##########',
      '........##..#.....#.#',
      '#######..###.#..####.',
      '#.....#...#...#...###',
      '#.###.#..###.#..###..',
      '#.###.#..#.#####.#...',
      '#.###.#..#.###.###.##',
      '#.....#...######.#...',
      '#######.#.#.#..#..##.',
    ],
  },
  {
    text: 'Hello, wörld ✓ with some more words to reach a bigger version of the code, well past eighty bytes long.',
    rows: [
      '#######...#.###.####.#.#.#....###.#######',
      '#.....#.....#.#.##...##.#..#....#.#.....#',
      '#.###.#.#.####..#.#.###.#.#.#.....#.###.#',
      '#.###.#.#..#.#..##.#..#.##.#.#.##.#.###.#',
      '#.###.#.#.#.#.....######....#.###.#.###.#',
      '#.....#.#..#.#.####...#....#.##.#.#.....#',
      '#######.#.#.#.#.#.#.#.#.#.#.#.#.#.#######',
      '........#..#.#.......##.##.###.##........',
      '#.#####...##.##.##..#.#..###.###..#####..',
      '#..##..#..#.###.#.####.#.#......#####.###',
      '#..####.#.#.##.#.##.....####.#####.......',
      '#.##.#.#..######..#..##.#.###.###..###.#.',
      '#####.###.##...#.#....#.##.###........#.#',
      '.#####.#..#.#.###.####.#....#####.###..##',
      '#..#.##....#.####.#.#...#..#.#....#......',
      '....#..##.#..#.##.#####....##.....#.##..#',
      '.#...####.##.##.##.#..#.####.#...#....#..',
      '.####...###.#......#.#.##.#.##########.##',
      '..#.#.###.#.###..#..#......##.#.#...##.#.',
      '#.#.##.###.#........###.....#..#...#.#...',
      '.....##....#.##..##.....###.##...#...##..',
      '#..##..###.#....####...#....#.##########.',
      '.#....#..#######.#..##...#.#.#..#...#....',
      '.#..#...#......#.....##..#.#..###...#..##',
      '##....#####..#..##....#.#..#.#..#..#..###',
      '##..#...#.#....#.###..###.#.#..##.####.##',
      '.#.#..###...#.###.#..#.....#.....#..##...',
      '#....#..####..#......#.##..##.#...#.##...',
      '#####.#.#..#.#####.#.....##.##.....#..#..',
      '#..###...#......#.###..#..#.##.#..#######',
      '#...#.###.##....##....#...##.#....##.#...',
      '#..##..###....#.#...###.#..#..#.##.#.#..#',
      '#.##..##...#.#..##.#..#####..##.#####.#..',
      '........##.###..######.#....#.###...#..##',
      '#######......##..#...#..##.#.#.##.#.#.#..',
      '#.....#.#..#...#..#.##..#..#...##...#....',
      '#.###.#.####..#...#...######.#..#####.#.#',
      '#.###.#.##...#.##.####.#.##...#.##.....##',
      '#.###.#.##.##...#.#..##.#.#####..####....',
      '#.....#....#.#####...#.###....####..##.#.',
      '#######.#.#..#.####...#....#.#.#.#.#.##..',
    ],
  },
];

describe('a QR code, against another encoder', () => {
  it.each(KNOWN)('is the same square for square: $text', ({ text, rows }) => {
    expect(drawn(qrCode(text)!)).toEqual(rows);
  });
});
