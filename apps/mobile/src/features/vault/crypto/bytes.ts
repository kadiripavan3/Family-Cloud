/**
 * Bytes and the two ways the Vault writes them as text: base64url without padding (everything that travels
 * to the API, docs/07-vault-protocol.md "Text on the wire") and UTF-8 (what a person typed).
 *
 * Written out here, small, instead of leaning on what a phone's JavaScript engine happens to have: the same
 * code runs under Hermes, in a browser and in the tests.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Each character's six bits, or -1 for a character that is not in the alphabet. */
const VALUE_OF = (() => {
  const values = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i += 1) values[ALPHABET.charCodeAt(i)] = i;
  return values;
})();

/** Bytes as base64url without padding (RFC 4648, section 5). */
export function toBase64Url(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    text += ALPHABET[a >> 2];
    text += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) text += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) text += ALPHABET[c & 63];
  }
  return text;
}

/**
 * The bytes of a base64url text. Strict: no padding, no other alphabet, no white space, and no left-over bits
 * that a second spelling of the same bytes could hide in. Anything else throws.
 */
export function fromBase64Url(text: string): Uint8Array {
  if (text.length % 4 === 1) throw new Error('not base64url: a length no bytes encode to');
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let bits = 0;
  let held = 0;
  let at = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const value = code < 128 ? VALUE_OF[code]! : -1;
    if (value < 0) throw new Error('not base64url: a character outside A-Z a-z 0-9 - _');
    held = (held << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[at] = (held >> bits) & 0xff;
      at += 1;
      held &= (1 << bits) - 1;
    }
  }
  if (held !== 0) throw new Error('not base64url: bits left over at the end');
  return bytes;
}

/** A text as UTF-8 bytes. A lone half of a surrogate pair becomes U+FFFD, as everywhere else. */
export function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let point = text.charCodeAt(i);
    if (point >= 0xd800 && point <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        point = 0x10000 + ((point - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }
    if (point >= 0xd800 && point <= 0xdfff) point = 0xfffd;
    if (point < 0x80) out.push(point);
    else if (point < 0x800) out.push(0xc0 | (point >> 6), 0x80 | (point & 63));
    else if (point < 0x10000) out.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
    else out.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 63), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
  }
  return Uint8Array.from(out);
}

/** The text of UTF-8 bytes. Strict: bytes that are not well-formed UTF-8 throw, so rubbish never passes for a password. */
export function fromUtf8(bytes: Uint8Array): string {
  let text = '';
  let i = 0;
  const next = () => {
    const byte = bytes[i];
    if (byte === undefined || (byte & 0xc0) !== 0x80) throw new Error('not UTF-8');
    i += 1;
    return byte & 63;
  };
  while (i < bytes.length) {
    const first = bytes[i]!;
    i += 1;
    let point: number;
    if (first < 0x80) point = first;
    else if (first >= 0xc2 && first < 0xe0) point = ((first & 31) << 6) | next();
    else if (first >= 0xe0 && first < 0xf0) {
      point = ((first & 15) << 12) | (next() << 6) | next();
      if (point < 0x800 || (point >= 0xd800 && point <= 0xdfff)) throw new Error('not UTF-8');
    } else if (first >= 0xf0 && first < 0xf5) {
      point = ((first & 7) << 18) | (next() << 12) | (next() << 6) | next();
      if (point < 0x10000 || point > 0x10ffff) throw new Error('not UTF-8');
    } else throw new Error('not UTF-8');
    text += String.fromCodePoint(point);
  }
  return text;
}

/** Several pieces of bytes as one. */
export function concat(...parts: Uint8Array[]): Uint8Array {
  const all = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all;
}

/** True when two pieces hold the same bytes. It looks at every byte whatever it finds, so how long it takes says nothing. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i += 1) different |= a[i]! ^ b[i]!;
  return different === 0;
}

/**
 * Overwrites bytes that held a key, once they are no longer needed. JavaScript gives no promise that no copy
 * is left somewhere in memory (and a string can't be overwritten at all): this shortens how long a key lies
 * around, it doesn't guarantee it is gone.
 */
export function wipe(...keys: (Uint8Array | null | undefined)[]): void {
  for (const key of keys) key?.fill(0);
}
