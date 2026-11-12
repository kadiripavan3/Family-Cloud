import { gcm } from '@noble/ciphers/aes.js';

import { concat, fromBase64Url, toBase64Url, utf8 } from './bytes';
import { randomBytes } from './random';
import { newKey } from './seal';

/**
 * A sealed card on a guest pass (docs/07-vault-protocol.md "A sealed card on a guest pass"): a door code or
 * a Wi‑Fi password for someone who has no app and no key of their own.
 *
 *   pass key = 32 random bytes, made by the phone that makes the pass
 *   card     = nonce (12 random bytes) || AES-256-GCM(pass key, nonce, the text as UTF-8)
 *   link     = the pass's address + "#" + base64url(pass key)
 *
 * AES-GCM, because a browser has it built in and the guest's page then needs no library. The API gets the
 * card; the key travels only in the part of the link after the #, which a browser never sends.
 */

const NONCE_BYTES = 12;

/** The bytes of a card for a given key and nonce. Only `sealForGuest` and the tests call this. */
export function sealForGuestWith(passKey: Uint8Array, nonce: Uint8Array, text: string): Uint8Array {
  if (passKey.length !== 32) throw new Error('a pass key must be 32 bytes');
  if (nonce.length !== NONCE_BYTES) throw new Error('a nonce must be 12 bytes');
  return concat(nonce, gcm(passKey, nonce).encrypt(utf8(text)));
}

/**
 * Seals a text for the guest of one pass. Returns the card's `ciphertext` (what the API stores) and the
 * `key` that goes after the # of the link. For a second card on the same pass, hand the first card's `key`
 * back in: a pass has one key.
 */
export function sealForGuest(text: string, key?: string): { ciphertext: string; key: string } {
  const passKey = key === undefined ? newKey() : fromBase64Url(key);
  return { ciphertext: toBase64Url(sealForGuestWith(passKey, randomBytes(NONCE_BYTES), text)), key: toBase64Url(passKey) };
}

/** A pass's whole link: the address the API gave, and the key after the #. */
export function guestLink(url: string, key: string): string {
  return `${url.split('#')[0]}#${key}`;
}
