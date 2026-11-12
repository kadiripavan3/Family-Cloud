import { utf8 } from '../bytes';
import { inverse, join, multiply, split, splitWith } from '../shamir';
import { newVaultKey } from '../vaultKey';

jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);

describe('GF(256), the arithmetic underneath', () => {
  it('multiplies as the AES standard does: {53} x {ca} = {01}, {57} x {83} = {c1}, {57} x {13} = {fe}', () => {
    expect(multiply(0x53, 0xca)).toBe(0x01);
    expect(multiply(0x57, 0x83)).toBe(0xc1);
    expect(multiply(0x57, 0x13)).toBe(0xfe);
  });

  it('is a field: one and zero behave, the order of two numbers makes no difference, and brackets can move', () => {
    for (let a = 0; a < 256; a += 1) {
      expect(multiply(a, 1)).toBe(a);
      expect(multiply(a, 0)).toBe(0);
      for (let b = 0; b < 256; b += 1) expect(multiply(a, b)).toBe(multiply(b, a));
    }
    for (const [a, b, c] of [
      [0x02, 0x87, 0x6e],
      [0xff, 0xfe, 0x03],
      [0x1b, 0x80, 0xc3],
    ] as const) {
      expect(multiply(multiply(a, b), c)).toBe(multiply(a, multiply(b, c)));
      expect(multiply(a, b ^ c)).toBe(multiply(a, b) ^ multiply(a, c));
    }
  });

  it('every number but zero has exactly one inverse', () => {
    const inverses = new Set<number>();
    for (let a = 1; a < 256; a += 1) {
      expect(multiply(a, inverse(a))).toBe(1);
      inverses.add(inverse(a));
    }
    expect(inverses.size).toBe(255);
    expect(() => inverse(0)).toThrow('zero has no inverse');
  });
});

describe("splitting the Vault key for helpers", () => {
  const secret = utf8('KT4M9QXZPL2A77HDVB3NE8RW');

  it('gives each helper their number and one byte for each byte of the secret: 25 bytes for a Vault key', () => {
    const shares = split(secret, 5);
    expect(shares).toHaveLength(5);
    shares.forEach((share, at) => {
      expect(share).toHaveLength(25);
      expect(share[0]).toBe(at + 1);
    });
  });

  it('is the sum the document writes down: s XOR (a x helper number)', () => {
    const slopes = Uint8Array.from({ length: 24 }, (_, i) => (i * 37 + 11) & 0xff);
    const shares = splitWith(secret, slopes, 3);
    for (const share of shares) {
      for (let i = 0; i < 24; i += 1) expect(share[i + 1]).toBe(secret[i]! ^ multiply(slopes[i]!, share[0]!));
    }
    // A worked example, by hand: secret byte 0x4b ('K'), slope 0x0b, helper 2: 0x4b XOR (0x0b x 2 = 0x16) = 0x5d.
    expect(shares[1]![1]).toBe(0x5d);
  });

  it('every pair of shares rebuilds the secret, in either order, for two to five helpers', () => {
    for (let helpers = 2; helpers <= 5; helpers += 1) {
      for (let run = 0; run < 20; run += 1) {
        const key = utf8(newVaultKey());
        const shares = split(key, helpers);
        for (let a = 0; a < helpers; a += 1) {
          for (let b = 0; b < helpers; b += 1) {
            if (a !== b) expect(join(shares[a]!, shares[b]!)).toEqual(key);
          }
        }
      }
    }
  });

  it('every pair rebuilds it for the most helpers there can be, 255, and for every value a byte can have', () => {
    const everyByte = Uint8Array.from({ length: 256 }, (_, i) => i);
    const shares = split(everyByte, 255);
    for (let a = 0; a < 255; a += 1) {
      const b = (a * 7 + 13) % 255;
      if (a !== b) expect(join(shares[a]!, shares[b]!)).toEqual(everyByte);
    }
    expect(join(shares[0]!, shares[254]!)).toEqual(everyByte);
  });

  it('one share fits every possible secret equally well: for any share byte, each of the 256 secrets is reached by exactly one slope', () => {
    // This is the whole reason one helper alone learns nothing, checked for every helper number and every byte.
    for (let x = 1; x <= 255; x += 1) {
      for (const shareByte of [0x00, 0x4b, 0xff]) {
        const secrets = new Set<number>();
        for (let slope = 0; slope < 256; slope += 1) secrets.add(shareByte ^ multiply(slope, x));
        expect(secrets.size).toBe(256);
      }
    }
  });

  it('one share tells nothing recognisable: over many splits of the same key its bytes are spread evenly, and it is never the key', () => {
    const counts = new Array<number>(256).fill(0);
    const key = Buffer.from(secret).toString('latin1');
    for (let run = 0; run < 4000; run += 1) {
      const share = split(secret, 3)[0]!;
      expect(Buffer.from(share.subarray(1)).toString('latin1')).not.toBe(key);
      for (const byte of share.subarray(1)) counts[byte]! += 1;
    }
    // 96,000 bytes, 375 expected of each value, although the secret itself is 24 capital letters and digits.
    const chi = counts.reduce((sum, count) => sum + (count - 375) ** 2 / 375, 0);
    expect(chi).toBeLessThan(400);
    expect(counts.every((count) => count > 0)).toBe(true);
  });

  it('shares of two different splits do not fit together', () => {
    let wrong = 0;
    for (let run = 0; run < 50; run += 1) {
      const first = split(secret, 3);
      const second = split(secret, 3);
      if (Buffer.compare(join(first[0]!, second[1]!), secret) !== 0) wrong += 1;
    }
    // (Two splits happen to use the same 24 slopes once in 2^192 tries.)
    expect(wrong).toBe(50);
  });

  it('refuses the same share twice, shares of different lengths, a share numbered 0, and fewer than two or more than 255 helpers', () => {
    const shares = split(secret, 3);
    expect(() => join(shares[0]!, shares[0]!)).toThrow('two different shares');
    expect(() => join(shares[0]!, shares[1]!.subarray(0, 24))).toThrow('two different shares');
    expect(() => join(Uint8Array.of(0, 1, 2), Uint8Array.of(1, 1, 2))).toThrow('two different shares');
    expect(() => join(Uint8Array.of(1), Uint8Array.of(2))).toThrow('two different shares');
    expect(() => split(secret, 1)).toThrow('between 2 and 255');
    expect(() => split(secret, 256)).toThrow('between 2 and 255');
    expect(() => splitWith(secret, new Uint8Array(23), 2)).toThrow('one slope for each byte');
    expect(() => split(new Uint8Array(0), 2)).toThrow();
  });

  it("opens shares the API's own test phone (Java) would make: the same sum, the same layout", () => {
    // Shares of the 24 bytes "KT4M9QXZPL2A77HDVB3NE8RW" with every slope 0x01: helper x gets s XOR x.
    const one = Uint8Array.from([1, ...secret].map((byte, i) => (i === 0 ? 1 : byte ^ 1)));
    const two = Uint8Array.from([2, ...secret].map((byte, i) => (i === 0 ? 2 : byte ^ 2)));
    expect(splitWith(secret, new Uint8Array(24).fill(1), 2)).toEqual([one, two]);
    expect(join(one, two)).toEqual(secret);
  });
});
