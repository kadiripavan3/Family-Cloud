import { hmac } from '@noble/hashes/hmac.js';
import { sha1 } from '@noble/hashes/legacy.js';

/**
 * One-time codes, worked out on the phone from a secret kept inside an item: TOTP (RFC 6238) with SHA-1,
 * a new code every 30 seconds, 6 digits. That is what almost every site hands out. Nothing is served.
 */

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** The bytes of a base32 secret as sites show it: any case, with or without spaces, dashes and padding. Null when it isn't base32. */
export function fromBase32(text: string): Uint8Array | null {
  const clean = text.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  if (clean.length === 0) return null;
  const bytes: number[] = [];
  let held = 0;
  let bits = 0;
  for (const character of clean) {
    const value = BASE32.indexOf(character);
    if (value < 0) return null;
    held = (held << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((held >> bits) & 0xff);
      held &= (1 << bits) - 1;
    }
  }
  return bytes.length === 0 ? null : Uint8Array.from(bytes);
}

/**
 * The secret out of what a person pasted: the base32 secret itself, or the "otpauth://totp/…?secret=…" link
 * behind a site's QR code. Null when there is none, or when the link asks for a kind of code this app doesn't
 * make (another hash, another length, another rhythm).
 */
export function totpSecretFrom(pasted: string): string | null {
  const text = pasted.trim();
  if (!/^otpauth:\/\//i.test(text)) return fromBase32(text) ? text.replace(/[\s-]/g, '').toUpperCase() : null;
  if (!/^otpauth:\/\/totp\//i.test(text)) return null;
  const asked = (name: string) => new RegExp(`[?&]${name}=([^&#]*)`, 'i').exec(text)?.[1];
  const algorithm = asked('algorithm');
  const digits = asked('digits');
  const period = asked('period');
  if ((algorithm && algorithm.toUpperCase() !== 'SHA1') || (digits && digits !== String(TOTP_DIGITS)) || (period && period !== String(TOTP_STEP_SECONDS))) return null;
  const secret = decodeURIComponent(asked('secret') ?? '');
  return fromBase32(secret) ? secret.replace(/[\s-]/g, '').toUpperCase() : null;
}

/** HOTP (RFC 4226): the code for one count. */
export function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): string {
  if (!Number.isInteger(counter) || counter < 0) throw new Error('a count from 0 up');
  const message = new Uint8Array(8);
  let rest = counter;
  for (let i = 7; i >= 0; i -= 1) {
    message[i] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  const mac = hmac(sha1, secret, message);
  const offset = mac[mac.length - 1]! & 0x0f;
  const number = ((mac[offset]! & 0x7f) * 2 ** 24 + mac[offset + 1]! * 2 ** 16 + mac[offset + 2]! * 2 ** 8 + mac[offset + 3]!) % 10 ** digits;
  return String(number).padStart(digits, '0');
}

/** The code that is right at a moment (in milliseconds, as `Date.now()` gives it), from a base32 secret. Null when the secret isn't base32. */
export function totp(secret: string, atMs: number, digits = TOTP_DIGITS): string | null {
  const key = fromBase32(secret);
  if (!key) return null;
  return hotp(key, Math.floor(atMs / 1000 / TOTP_STEP_SECONDS), digits);
}

/** How many seconds the code of this moment still has, from 30 down to 1. */
export function totpSecondsLeft(atMs: number): number {
  return TOTP_STEP_SECONDS - (Math.floor(atMs / 1000) % TOTP_STEP_SECONDS);
}
