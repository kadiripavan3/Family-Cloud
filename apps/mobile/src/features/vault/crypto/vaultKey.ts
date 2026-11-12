import { scryptAsync } from '@noble/hashes/scrypt.js';

import { fromBase64Url, sameBytes, toBase64Url, utf8, wipe } from './bytes';
import { randomBytes } from './random';
import { DoesNotOpen, open, type Purpose, publicKeyOf, seal } from './seal';

/**
 * The Vault key (docs/07-vault-protocol.md "The Vault key"): 24 characters that open a person's private key
 * on a new phone. Shown once, never sent anywhere. And the same sum for a passcode, which is how the browser
 * preview (and a phone without Face ID) keeps the private key between unlocks.
 */

/** No I, O, 0 or 1: they are easy to confuse. 32 characters, so each one is five random bits. */
export const VAULT_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const VAULT_KEY_LENGTH = 24;

/** scrypt's numbers, as they travel next to a wrapped key. */
export type Kdf = { n: number; r: number; p: number };

/** What this app wraps with (the document's numbers). */
export const KDF: Kdf = { n: 32768, r: 8, p: 1 };

const SALT_BYTES = 16;
/** How long scrypt may hold the screen before it lets it draw again, in milliseconds. */
const TICK_MS = 12;

/** A new Vault key: 24 characters, each chosen at random (120 bits), without the spaces. */
export function newVaultKey(): string {
  const random = randomBytes(VAULT_KEY_LENGTH);
  let key = '';
  // 256 is a multiple of 32, so taking five bits of a random byte favours no character.
  for (const byte of random) key += VAULT_KEY_ALPHABET[byte & 31];
  wipe(random);
  return key;
}

/** A Vault key as a person reads it: six groups of four. */
export function grouped(vaultKey: string): string {
  return (vaultKey.match(/.{1,4}/g) ?? []).join(' ');
}

/**
 * What a person typed, as the Vault key it stands for: upper case, the spaces (and line breaks: the key is
 * shown on two lines) taken out. Null when that is not 24 characters of the alphabet.
 */
export function normalizeVaultKey(typed: string): string | null {
  const key = typed.replace(/\s+/g, '').toUpperCase();
  if (key.length !== VAULT_KEY_LENGTH) return null;
  for (const character of key) if (!VAULT_KEY_ALPHABET.includes(character)) return null;
  return key;
}

/**
 * Whether a phone agrees to do the sum with these numbers. A record comes from the API, and numbers large
 * enough would freeze the phone or run it out of memory: at most 128 MB (the app's own take 32 MB) and eight
 * times the app's own work. Nothing smaller than the API itself accepts.
 */
export function acceptableKdf(kdf: Partial<Kdf> | null | undefined): kdf is Kdf {
  if (!kdf) return false;
  const { n, r, p } = kdf;
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (n === undefined || r === undefined || p === undefined) return false;
  const powerOfTwo = n > 0 && Number.isInteger(Math.log2(n));
  return powerOfTwo && n >= 16384 && r >= 1 && p >= 1 && n * r <= 2 ** 20 && n * r * p <= 2 ** 21;
}

/**
 * The key made from a secret a person holds: scrypt(secret, salt, N, r, p, 32 bytes). It takes a moment on
 * purpose. The work is done in slices, so the screen keeps drawing meanwhile; `onProgress` hears how far it is,
 * from 0 to 1.
 */
export async function stretch(secret: string, salt: Uint8Array, kdf: Kdf, onProgress?: (done: number) => void): Promise<Uint8Array> {
  if (!acceptableKdf(kdf)) throw new Error('these scrypt numbers are refused');
  const password = utf8(secret);
  try {
    return await scryptAsync(password, salt, { N: kdf.n, r: kdf.r, p: kdf.p, dkLen: 32, asyncTick: TICK_MS, onProgress });
  } finally {
    wipe(password);
  }
}

/** A key wrapped with a key made from a secret, with the salt and the numbers a phone needs to do the same sum again. None of the three is secret. */
export type Wrapped = { wrapped: string; salt: string; kdf: Kdf };

/** Wraps a key with a key made from a secret a person holds, for one purpose. */
export async function wrapWith(secret: string, key: Uint8Array, purpose: Purpose, onProgress?: (done: number) => void): Promise<Wrapped> {
  const salt = randomBytes(SALT_BYTES);
  const wrappingKey = await stretch(secret, salt, KDF, onProgress);
  try {
    return { wrapped: seal(wrappingKey, key, purpose), salt: toBase64Url(salt), kdf: { ...KDF } };
  } finally {
    wipe(wrappingKey);
  }
}

/** Unwraps what `wrapWith` made. Throws `DoesNotOpen` when the secret is wrong. */
export async function unwrapWith(secret: string, kept: { wrapped: string; salt: string; kdf: Partial<Kdf> | null }, purpose: Purpose, onProgress?: (done: number) => void): Promise<Uint8Array> {
  if (!acceptableKdf(kept.kdf)) throw new Error('these scrypt numbers are refused');
  let salt: Uint8Array;
  try {
    salt = fromBase64Url(kept.salt);
  } catch {
    throw new DoesNotOpen();
  }
  const wrappingKey = await stretch(secret, salt, kept.kdf, onProgress);
  try {
    return open(wrappingKey, kept.wrapped, purpose);
  } finally {
    wipe(wrappingKey);
  }
}

/** What `PUT /v1/vault` and `PUT /v1/vault/key` send about the private key. */
export type WrappedPrivateKey = { wrappedPrivateKey: string; salt: string; kdf: Kdf };

/** The private key, wrapped with the key made from the Vault key: the only form in which it reaches the API. */
export async function wrapPrivateKey(vaultKey: string, privateKey: Uint8Array, onProgress?: (done: number) => void): Promise<WrappedPrivateKey> {
  const key = normalizeVaultKey(vaultKey);
  if (!key) throw new Error('not a Vault key');
  const { wrapped, salt, kdf } = await wrapWith(key, privateKey, 'private-key', onProgress);
  return { wrappedPrivateKey: wrapped, salt, kdf };
}

/** A person's Vault record, as `GET /v1/vault` answers it once they have one. */
export type VaultRecord = { publicKey: string; wrappedPrivateKey: string; salt: string; kdf: Partial<Kdf> | null };

/**
 * A new phone: the person types their Vault key, and the private key comes out of the record. Throws
 * `DoesNotOpen` when the Vault key is wrong, and also when the key that comes out is not the one the record's
 * public key belongs to: then something was swapped, and the phone stops.
 */
export async function unwrapPrivateKey(vaultKey: string, record: VaultRecord, onProgress?: (done: number) => void): Promise<Uint8Array> {
  const key = normalizeVaultKey(vaultKey);
  if (!key) throw new DoesNotOpen();
  const privateKey = await unwrapWith(key, { wrapped: record.wrappedPrivateKey, salt: record.salt, kdf: record.kdf }, 'private-key', onProgress);
  if (!belongsTo(privateKey, record.publicKey)) {
    wipe(privateKey);
    throw new DoesNotOpen();
  }
  return privateKey;
}

/** True when this private key is the one a public key (as the API holds it) belongs to. */
export function belongsTo(privateKey: Uint8Array, publicKey: string): boolean {
  try {
    return privateKey.length === 32 && sameBytes(publicKeyOf(privateKey), fromBase64Url(publicKey));
  } catch {
    return false;
  }
}
