import { randomBytes } from './random';

/**
 * Shamir's secret sharing over GF(256), for "any two helpers together" (docs/07-vault-protocol.md "Splitting
 * the Vault key for helpers"). Each byte of the secret is where a random straight line crosses 0, and a share
 * is that line's value at one other point. Two shares give the line back; one share fits every possible
 * secret equally well, so it says nothing.
 *
 * A share is its point's number (one byte, 1 to 255) followed by one byte for each byte of the secret.
 */

/** Multiplication in GF(256) with the polynomial x^8 + x^4 + x^3 + x + 1, the one AES uses. */
export function multiply(a: number, b: number): number {
  let product = 0;
  let x = a & 0xff;
  let y = b & 0xff;
  for (let bit = 0; bit < 8; bit += 1) {
    if (y & 1) product ^= x;
    const carry = x & 0x80;
    x = (x << 1) & 0xff;
    if (carry) x ^= 0x1b;
    y >>= 1;
  }
  return product;
}

/** The number that multiplies with this one to 1: this one to the power of 254. Zero has none. */
export function inverse(a: number): number {
  if ((a & 0xff) === 0) throw new Error('zero has no inverse');
  let result = 1;
  for (let i = 0; i < 254; i += 1) result = multiply(result, a);
  return result;
}

/**
 * The shares of a secret for given slopes: one random byte per byte of the secret. Only `split` and the tests
 * call this: the slopes are never chosen by hand.
 */
export function splitWith(secret: Uint8Array, slopes: Uint8Array, shares: number): Uint8Array[] {
  if (!Number.isInteger(shares) || shares < 2 || shares > 255) throw new Error('between 2 and 255 shares');
  if (secret.length === 0 || slopes.length !== secret.length) throw new Error('one slope for each byte of the secret');
  const all: Uint8Array[] = [];
  for (let x = 1; x <= shares; x += 1) {
    const share = new Uint8Array(secret.length + 1);
    share[0] = x;
    for (let i = 0; i < secret.length; i += 1) share[i + 1] = secret[i]! ^ multiply(slopes[i]!, x);
    all.push(share);
  }
  return all;
}

/** Splits a secret into this many shares, any two of which rebuild it. Helper number 1 gets the first, 2 the second, and so on. */
export function split(secret: Uint8Array, shares: number): Uint8Array[] {
  const slopes = randomBytes(secret.length);
  try {
    return splitWith(secret, slopes, shares);
  } finally {
    slopes.fill(0);
  }
}

/** Rebuilds the secret from two different shares of the same split. Shares of two different splits give rubbish, not an error: nothing in a share says which split it is from. */
export function join(a: Uint8Array, b: Uint8Array): Uint8Array {
  const xa = a[0];
  const xb = b[0];
  if (xa === undefined || xb === undefined || xa === 0 || xb === 0 || xa === xb || a.length !== b.length || a.length < 2) {
    throw new Error('two different shares of the same split are needed');
  }
  // The line through (xa, ya) and (xb, yb), read at 0. In GF(256) adding and subtracting are both XOR.
  const oneOverDifference = inverse(xa ^ xb);
  const secret = new Uint8Array(a.length - 1);
  for (let i = 0; i < secret.length; i += 1) {
    secret[i] = multiply(multiply(a[i + 1]!, xb) ^ multiply(b[i + 1]!, xa), oneOverDifference);
  }
  return secret;
}
