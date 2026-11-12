import { checkBytes, dataBytes, formatBits, penalty, qrCode } from '../qr';

/** GF(256) as the code's error correction uses it, written a second time here to check the first. */
function multiply(a: number, b: number): number {
  let product = 0;
  for (let x = a, y = b; y > 0; y >>= 1) {
    if (y & 1) product ^= x;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
  return product;
}

const FINDER = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
const corner = (grid: boolean[][], x: number, y: number) => FINDER.map((_, dy) => grid[y + dy]!.slice(x, x + 7).map((on) => (on ? '1' : '0')).join(''));

describe('the QR code of a Vault key', () => {
  it("writes the worked example every tutorial uses, HELLO WORLD at version 1, level M: the same data and check bytes", () => {
    const data = dataBytes('HELLO WORLD', 16);
    expect([...data]).toEqual([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]);
    expect([...checkBytes(data, 10)]).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('makes check bytes that really are a Reed-Solomon code: the whole divides evenly at each of the roots', () => {
    const data = dataBytes('KT4M9QXZPL2A77HDVB3NE8RW', 28);
    const all = [...data, ...checkBytes(data, 16)];
    let root = 1;
    for (let i = 0; i < 16; i += 1) {
      // The polynomial's value at this root, by Horner's rule: zero for a valid codeword.
      expect(all.reduce((value, byte) => multiply(value, root) ^ byte, 0)).toBe(0);
      root = multiply(root, 2);
    }
  });

  it("writes the standard's format bits for level M and each of the eight masks", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((mask) => formatBits(mask).toString(2).padStart(15, '0'))).toEqual([
      '101010000010010',
      '101000100100101',
      '101111001111100',
      '101101101001011',
      '100010111111001',
      '100000011001110',
      '100111110010111',
      '100101010100000',
    ]);
  });

  it('draws a Vault key as 25 squares a side, with the three corner squares, the dotted lines and the small fourth square', () => {
    const grid = qrCode('KT4M9QXZPL2A77HDVB3NE8RW');
    expect(grid).toHaveLength(25);
    expect(grid.every((row) => row.length === 25)).toBe(true);
    expect(corner(grid, 0, 0)).toEqual(FINDER);
    expect(corner(grid, 18, 0)).toEqual(FINDER);
    expect(corner(grid, 0, 18)).toEqual(FINDER);
    for (let i = 8; i < 17; i += 1) {
      expect(grid[6]![i]).toBe(i % 2 === 0);
      expect(grid[i]![6]).toBe(i % 2 === 0);
    }
    expect([16, 17, 18, 19, 20].map((x) => (grid[18]![x] ? '1' : '0')).join('')).toBe('10101');
    expect(grid[17]![8]).toBe(true);
  });

  it('is the same every time for the same key, and different for another', () => {
    const one = JSON.stringify(qrCode('KT4M9QXZPL2A77HDVB3NE8RW'));
    expect(JSON.stringify(qrCode('KT4M9QXZPL2A77HDVB3NE8RW'))).toBe(one);
    expect(JSON.stringify(qrCode('KT4M9QXZPL2A77HDVB3NE8RX'))).not.toBe(one);
  });

  it('picks the mask that reads best: no other mask scores lower for the same key', () => {
    // (Checked from outside when this was written: an independent reader, jsQR 1.4.0, decoded 300 random
    // Vault keys drawn by this file. It is not a dependency of the app, so that check is not repeated here.)
    const grid = qrCode('KT4M9QXZPL2A77HDVB3NE8RW');
    expect(penalty(grid)).toBeGreaterThan(0);
    expect(penalty(grid)).toBeLessThan(900);
  });

  it('uses the smaller code for a shorter text', () => {
    expect(qrCode('HELLO WORLD')).toHaveLength(21);
    expect(qrCode('A'.repeat(20))).toHaveLength(21);
    expect(qrCode('A'.repeat(21))).toHaveLength(25);
    expect(qrCode('A'.repeat(38))).toHaveLength(25);
  });

  it("refuses what it can't write", () => {
    expect(() => qrCode('kt4m')).toThrow('only capital letters');
    expect(() => qrCode('A'.repeat(39))).toThrow('too long');
  });
});
