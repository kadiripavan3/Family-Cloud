import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { concat, fromBase64Url, sameBytes, toBase64Url, utf8, wipe } from './bytes';
import { randomBytes } from './random';

/**
 * Sealing, exactly as docs/07-vault-protocol.md "The building blocks" writes it down. Two ways:
 *
 *   with a key both sides hold     sealed = 0x01 || nonce || XChaCha20-Poly1305(key, nonce, plaintext, info)
 *   for a person (their public P)  sealed = 0x01 || E || nonce || XChaCha20-Poly1305(key, nonce, plaintext, info)
 *                                  key    = HKDF-SHA-256(X25519(e, P), salt = E || P, info, 32 bytes)
 *
 * where `info` is the text "homeport/vault/v1/" followed by the purpose, so something sealed for one use
 * doesn't open as another. Everything that leaves this file sealed is base64url text.
 */

/** What a sealed piece is for. The first nine are the document's table; the last never leaves the phone. */
export type Purpose =
  | 'private-key'
  | 'item'
  | 'item-key'
  | 'escrow-key'
  | 'escrow-note'
  | 'own-note'
  | 'helper-share'
  | 'recovery-share'
  | 'pass-key'
  /** The private key as this phone keeps it between unlocks, wrapped with a key made from a passcode. Stored on the phone only. */
  | 'this-device';

const VERSION = 0x01;
const KEY_BYTES = 32;
const NONCE_BYTES = 24;
const TAG_BYTES = 16;
const INFO = 'homeport/vault/v1/';

/** The wrong key, a changed text, or another purpose. The message never says which, and never holds any of the bytes. */
export class DoesNotOpen extends Error {
  constructor() {
    super('DoesNotOpen: the wrong key, a changed text, or another purpose');
    this.name = 'DoesNotOpen';
  }
}

const infoFor = (purpose: Purpose) => utf8(INFO + purpose);

/** Stops at anything that isn't 32 bytes: every key here is. `wrong` makes the error that says which key it was. */
function need32(key: Uint8Array, wrong: () => Error): void {
  if (!(key instanceof Uint8Array) || key.length !== KEY_BYTES) throw wrong();
}
const sealingKey = () => new Error('a sealing key must be 32 bytes');
const privateKeyOf32 = () => new Error('a private key must be 32 bytes');
const publicKeyOf32 = () => new Error('a public key must be 32 bytes');

// ---------- with a key both sides hold ----------

/** The bytes of a sealed piece for a given nonce. Only `seal` and the tests against published vectors call this: a nonce is never chosen by hand. */
export function sealWithNonce(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, purpose: Purpose): Uint8Array {
  need32(key, sealingKey);
  if (nonce.length !== NONCE_BYTES) throw new Error('a nonce must be 24 bytes');
  return concat(Uint8Array.of(VERSION), nonce, xchacha20poly1305(key, nonce, infoFor(purpose)).encrypt(plaintext));
}

/** Seals with a key both sides hold: an item with its item key, a private key with the key made from the Vault key. */
export function seal(key: Uint8Array, plaintext: Uint8Array, purpose: Purpose): string {
  return toBase64Url(sealWithNonce(key, randomBytes(NONCE_BYTES), plaintext, purpose));
}

/** Opens what `seal` made. Throws `DoesNotOpen` for a wrong key, a changed text, another purpose or an unknown layout. */
export function open(key: Uint8Array, sealed: string, purpose: Purpose): Uint8Array {
  need32(key, sealingKey);
  const all = bytesOf(sealed);
  if (all.length < 1 + NONCE_BYTES + TAG_BYTES || all[0] !== VERSION) throw new DoesNotOpen();
  return decrypt(key, all.subarray(1, 1 + NONCE_BYTES), all.subarray(1 + NONCE_BYTES), purpose);
}

// ---------- for a person: only their private key opens it ----------

/** A private key (32 random bytes) and the public key that belongs to it. */
export function newKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = randomBytes(KEY_BYTES);
  return { privateKey, publicKey: publicKeyOf(privateKey) };
}

/** The public key of a private key (X25519 with the base point). */
export function publicKeyOf(privateKey: Uint8Array): Uint8Array {
  need32(privateKey, privateKeyOf32);
  return x25519.getPublicKey(privateKey);
}

/** An item's own key, or a guest pass's: 32 random bytes. */
export function newKey(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

/** X25519, refusing an all-zero result: that is what a public key chosen to make everyone agree on the same "secret" gives. */
function agree(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  let shared: Uint8Array;
  try {
    shared = x25519.getSharedSecret(privateKey, publicKey);
  } catch {
    throw new Error('this public key cannot be sealed for');
  }
  if (sameBytes(shared, new Uint8Array(KEY_BYTES))) throw new Error('this public key cannot be sealed for');
  return shared;
}

/** The sealing key both ends work out: HKDF-SHA-256 over the agreement, salted with both public keys. */
function agreedKey(shared: Uint8Array, ephemeralPublic: Uint8Array, recipientPublic: Uint8Array, purpose: Purpose): Uint8Array {
  return hkdf(sha256, shared, concat(ephemeralPublic, recipientPublic), infoFor(purpose), KEY_BYTES);
}

/** The bytes of a piece sealed for a person, for a given one-time private key and nonce. Only `sealFor` and the tests call this. */
export function sealForWith(ephemeralPrivate: Uint8Array, nonce: Uint8Array, recipientPublic: Uint8Array, plaintext: Uint8Array, purpose: Purpose): Uint8Array {
  need32(recipientPublic, publicKeyOf32);
  if (nonce.length !== NONCE_BYTES) throw new Error('a nonce must be 24 bytes');
  const ephemeralPublic = publicKeyOf(ephemeralPrivate);
  const shared = agree(ephemeralPrivate, recipientPublic);
  const key = agreedKey(shared, ephemeralPublic, recipientPublic, purpose);
  try {
    return concat(Uint8Array.of(VERSION), ephemeralPublic, nonce, xchacha20poly1305(key, nonce, infoFor(purpose)).encrypt(plaintext));
  } finally {
    wipe(shared, key);
  }
}

/**
 * Seals for one person, who is known only by their public key: a wrapped item key, a share for a helper, a
 * note for the trusted person. The one-time key pair is made here and thrown away.
 */
export function sealFor(recipientPublic: Uint8Array, plaintext: Uint8Array, purpose: Purpose): string {
  const ephemeralPrivate = randomBytes(KEY_BYTES);
  try {
    return toBase64Url(sealForWith(ephemeralPrivate, randomBytes(NONCE_BYTES), recipientPublic, plaintext, purpose));
  } finally {
    wipe(ephemeralPrivate);
  }
}

/** Opens what was sealed for the holder of this private key. Throws `DoesNotOpen` when it was sealed for someone else, changed, or for another purpose. */
export function openMine(privateKey: Uint8Array, sealed: string, purpose: Purpose): Uint8Array {
  need32(privateKey, privateKeyOf32);
  const all = bytesOf(sealed);
  if (all.length < 1 + KEY_BYTES + NONCE_BYTES + TAG_BYTES || all[0] !== VERSION) throw new DoesNotOpen();
  const ephemeralPublic = all.subarray(1, 1 + KEY_BYTES);
  let shared: Uint8Array;
  try {
    shared = agree(privateKey, ephemeralPublic);
  } catch {
    throw new DoesNotOpen();
  }
  const key = agreedKey(shared, ephemeralPublic, publicKeyOf(privateKey), purpose);
  try {
    return decrypt(key, all.subarray(1 + KEY_BYTES, 1 + KEY_BYTES + NONCE_BYTES), all.subarray(1 + KEY_BYTES + NONCE_BYTES), purpose);
  } finally {
    wipe(shared, key);
  }
}

// ---------- the pieces ----------

function bytesOf(sealed: string): Uint8Array {
  try {
    return fromBase64Url(sealed);
  } catch {
    throw new DoesNotOpen();
  }
}

function decrypt(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array, purpose: Purpose): Uint8Array {
  try {
    return xchacha20poly1305(key, nonce, infoFor(purpose)).decrypt(ciphertext);
  } catch {
    throw new DoesNotOpen();
  }
}
