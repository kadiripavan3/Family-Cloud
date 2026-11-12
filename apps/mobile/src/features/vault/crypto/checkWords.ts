import { sha256 } from '@noble/hashes/sha2.js';

import { fromBase64Url } from './bytes';

/**
 * The check for a recovery (docs/07-vault-protocol.md "Helpers and getting back in"): before a helper passes
 * their share on, both people read out the same few words. The words are picked by the first bytes of the
 * SHA-256 of the new phone's temporary public key, so a recovery someone else started shows other words.
 *
 * This returns the numbers (0 to 255, one for each word); the catalog holds the 256 words.
 */
export function checkNumbers(tempPublicKey: string, count = 3): number[] {
  const key = fromBase64Url(tempPublicKey);
  if (key.length !== 32) throw new Error('a public key must be 32 bytes');
  return [...sha256(key).subarray(0, count)];
}
