import * as ExpoCrypto from 'expo-crypto';

import { randomBytes } from '../random';

jest.mock('expo-crypto', () => ({
  getRandomValues: jest.fn((bytes: Uint8Array) => jest.requireActual('node:crypto').webcrypto.getRandomValues(bytes)),
  // What the same module also offers, and falls back to Math.random with in a development build.
  getRandomBytes: jest.fn(() => {
    throw new Error('getRandomBytes must not be used');
  }),
}));

describe('random bytes', () => {
  afterEach(() => jest.restoreAllMocks());

  it('come from the secure source, in the length asked for, and differ each time', () => {
    const a = randomBytes(32);
    const b = randomBytes(32);
    expect(a).toHaveLength(32);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(ExpoCrypto.getRandomValues).toHaveBeenCalledTimes(2);
    expect(ExpoCrypto.getRandomBytes).not.toHaveBeenCalled();
  });

  it('never come from Math.random', () => {
    const insecure = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random was used for a key');
    });
    for (const length of [1, 12, 16, 24, 32, 64, 1024]) expect(randomBytes(length)).toHaveLength(length);
    expect(insecure).not.toHaveBeenCalled();
  });

  it('stop when the source fills nothing in, instead of handing out an all-zero key', () => {
    (ExpoCrypto.getRandomValues as jest.Mock).mockImplementationOnce((bytes: Uint8Array) => bytes);
    expect(() => randomBytes(32)).toThrow('the random source returned nothing');
  });

  it('stop when there is no secure source at all', () => {
    (ExpoCrypto.getRandomValues as jest.Mock).mockImplementationOnce(() => {
      throw new Error('unavailable');
    });
    expect(() => randomBytes(32)).toThrow('unavailable');
  });

  it('refuse a length that makes no sense', () => {
    for (const bad of [0, -1, 1.5, 1025, Number.NaN]) expect(() => randomBytes(bad)).toThrow('between 1 and 1024');
  });

  it('look random: over 64,000 bytes every value turns up about as often as any other', () => {
    const counts = new Array<number>(256).fill(0);
    for (let i = 0; i < 64; i += 1) for (const byte of randomBytes(1000)) counts[byte]! += 1;
    // Expected 250 of each. Chi-squared with 255 degrees of freedom is above 400 less than once in a million runs.
    const chi = counts.reduce((sum, count) => sum + (count - 250) ** 2 / 250, 0);
    expect(chi).toBeLessThan(400);
  });
});
