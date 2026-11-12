import { getRandomValues } from 'expo-crypto';

/**
 * Random bytes from the phone's secure source: the operating system's generator on a phone, the browser's
 * `crypto.getRandomValues` in the web preview. Every key, nonce, salt and Vault key in the app is made of
 * bytes from here, and from nowhere else.
 *
 * It is `expo-crypto`'s `getRandomValues` on purpose, and not its `getRandomBytes`: that one falls back to
 * `Math.random` in a development build when the app is debugged remotely (see its source), which is exactly
 * what a key must never be made of. `getRandomValues` has no fallback: without a secure source it throws.
 */
export function randomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length < 1 || length > 1024) throw new Error('between 1 and 1024 random bytes at a time');
  const bytes = new Uint8Array(length);
  getRandomValues(bytes);
  // A source that filled nothing in (a stubbed-out module, a broken bridge) would hand every person the same
  // all-zero key. Sixteen zero bytes from a working source happen once in 2^128 tries: this is a broken one.
  if (length >= 16 && bytes.every((byte) => byte === 0)) throw new Error('the random source returned nothing');
  return bytes;
}
