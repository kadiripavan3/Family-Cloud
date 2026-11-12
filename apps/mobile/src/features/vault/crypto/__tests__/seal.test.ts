import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { extract, hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import nodeCrypto from 'node:crypto';

import * as reference from '@/test/vaultReference';

import { fromBase64Url, toBase64Url, utf8 } from '../bytes';
import { DoesNotOpen, newKey, newKeyPair, open, openMine, publicKeyOf, type Purpose, seal, sealFor, sealForWith, sealWithNonce } from '../seal';

jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);

const hex = (text: string) => Uint8Array.from(Buffer.from(text.replace(/\s+/g, ''), 'hex'));
const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

const PURPOSES: Purpose[] = ['private-key', 'item', 'item-key', 'escrow-key', 'escrow-note', 'own-note', 'helper-share', 'recovery-share', 'pass-key', 'this-device'];

describe('X25519 (RFC 7748)', () => {
  it('gives the two results of section 5.2', () => {
    expect(toHex(x25519.scalarMult(hex('a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4'), hex('e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c')))).toBe(
      'c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552',
    );
    expect(toHex(x25519.scalarMult(hex('4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d'), hex('e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493')))).toBe(
      '95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957',
    );
  });

  it('gives Alice and Bob of section 6.1 their public keys and the same shared secret', () => {
    const alice = hex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a');
    const bob = hex('5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb');
    expect(toHex(publicKeyOf(alice))).toBe('8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a');
    expect(toHex(publicKeyOf(bob))).toBe('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f');
    const shared = '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742';
    expect(toHex(x25519.getSharedSecret(alice, publicKeyOf(bob)))).toBe(shared);
    expect(toHex(x25519.getSharedSecret(bob, publicKeyOf(alice)))).toBe(shared);
  });

  it('agrees with OpenSSL for fresh keys', () => {
    for (let i = 0; i < 10; i += 1) {
      const mine = newKeyPair();
      const theirs = newKeyPair();
      expect(toHex(mine.publicKey)).toBe(toHex(reference.publicKey(mine.privateKey)));
      expect(toHex(x25519.getSharedSecret(mine.privateKey, theirs.publicKey))).toBe(toHex(reference.x25519(mine.privateKey, theirs.publicKey)));
    }
  });
});

describe('HKDF-SHA-256 (RFC 5869)', () => {
  it('gives test case 1', () => {
    const ikm = hex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const salt = hex('000102030405060708090a0b0c');
    const info = hex('f0f1f2f3f4f5f6f7f8f9');
    expect(toHex(extract(sha256, ikm, salt))).toBe('077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5');
    expect(toHex(hkdf(sha256, ikm, salt, info, 42))).toBe('3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');
  });

  it('gives test case 3, without salt or info', () => {
    const ikm = hex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    expect(toHex(hkdf(sha256, ikm, new Uint8Array(0), new Uint8Array(0), 42))).toBe('8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8');
  });
});

describe('XChaCha20-Poly1305 (draft-irtf-cfrg-xchacha-03)', () => {
  const plaintext = utf8("Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.");
  const aad = hex('50515253c0c1c2c3c4c5c6c7');
  const key = hex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
  const nonce = hex('404142434445464748494a4b4c4d4e4f5051525354555657');
  const ciphertext = `
    bd6d179d3e83d43b9576579493c0e939 572a1700252bfaccbed2902c21396cbb
    731c7f1b0b4aa6440bf3a82f4eda7e39 ae64c6708c54c216cb96b72e1213b452
    2f8c9ba40db5d945b11b69b982c1bb9e 3f3fac2bc369488f76b2383565d3fff9
    21f9664c97637da9768812f615c68b13 b52e`;
  const tag = 'c0875924c1c7987947deafd8780acf49';

  it("gives the draft's example (A.1), and opens it again", () => {
    const sealed = xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
    expect(toHex(sealed)).toBe(toHex(hex(ciphertext)) + tag);
    expect(xchacha20poly1305(key, nonce, aad).decrypt(sealed)).toEqual(plaintext);
  });

  it("the tests' own second implementation gives the same example, and the draft's HChaCha20 example (2.2.1)", () => {
    expect(toHex(reference.xchachaEncrypt(key, nonce, aad, plaintext))).toBe(toHex(hex(ciphertext)) + tag);
    expect(toHex(reference.hchacha20(hex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'), hex('000000090000004a0000000031415927')))).toBe(
      '82413b4227b27bfed30e42508a877d73a0f9e4d58a74a853c12ec41326d3ecdc',
    );
  });

  it('notices one changed bit anywhere: in the text, the tag, the nonce or the associated data', () => {
    const sealed = xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
    for (const at of [0, 57, sealed.length - 17, sealed.length - 1]) {
      const changed = sealed.slice();
      changed[at]! ^= 1;
      expect(() => xchacha20poly1305(key, nonce, aad).decrypt(changed)).toThrow();
    }
    const otherNonce = nonce.slice();
    otherNonce[23]! ^= 1;
    expect(() => xchacha20poly1305(key, otherNonce, aad).decrypt(sealed)).toThrow();
    expect(() => xchacha20poly1305(key, nonce, hex('50515253c0c1c2c3c4c5c6c6')).decrypt(sealed)).toThrow();
  });
});

describe('sealing with a key both sides hold', () => {
  const key = hex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
  const nonce = hex('a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7');
  const text = utf8('{"password":"p0pcorn!Friday#night"}');

  it('lays a sealed piece out as the document says: 0x01, the nonce, then XChaCha20-Poly1305 with the purpose bound in', () => {
    const sealed = sealWithNonce(key, nonce, text, 'item');
    expect(sealed[0]).toBe(0x01);
    expect(sealed.subarray(1, 25)).toEqual(nonce);
    expect(sealed).toHaveLength(1 + 24 + text.length + 16);
    // The rest is what the second implementation makes of the same key, nonce and "homeport/vault/v1/item".
    expect(toHex(sealed.subarray(25))).toBe(toHex(reference.xchachaEncrypt(key, nonce, Buffer.from('homeport/vault/v1/item'), text)));
  });

  it('opens what it sealed, for every purpose, and never seals the same way twice', () => {
    for (const purpose of PURPOSES) {
      const a = seal(key, text, purpose);
      const b = seal(key, text, purpose);
      expect(a).not.toBe(b);
      expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(open(key, a, purpose)).toEqual(text);
      expect(open(key, b, purpose)).toEqual(text);
    }
  });

  it('opens what the second implementation sealed, and the other way round', () => {
    for (let i = 0; i < 20; i += 1) {
      const itemKey = newKey();
      const inside = utf8(`secret number ${i} `.repeat(i));
      expect(open(itemKey, reference.seal(itemKey, inside, 'item'), 'item')).toEqual(inside);
      expect(Uint8Array.from(reference.open(itemKey, seal(itemKey, inside, 'item'), 'item'))).toEqual(inside);
    }
  });

  it("doesn't open with another key, for another purpose, or once anything in it was changed", () => {
    const sealed = seal(key, text, 'item');
    expect(() => open(newKey(), sealed, 'item')).toThrow(DoesNotOpen);
    for (const purpose of PURPOSES.filter((one) => one !== 'item')) expect(() => open(key, sealed, purpose)).toThrow(DoesNotOpen);
    const bytes = fromBase64Url(sealed);
    for (let at = 0; at < bytes.length; at += 1) {
      const changed = bytes.slice();
      changed[at]! ^= 0x01;
      expect(() => open(key, toBase64Url(changed), 'item')).toThrow(DoesNotOpen);
    }
    expect(() => open(key, toBase64Url(bytes.subarray(0, bytes.length - 1)), 'item')).toThrow(DoesNotOpen);
  });

  it("doesn't open what isn't a sealed piece at all", () => {
    for (const bad of ['', 'AQ', 'not base64url!', 'sample-item-not-scrambled', toBase64Url(new Uint8Array(41))]) expect(() => open(key, bad, 'item')).toThrow(DoesNotOpen);
  });

  it('refuses a key or a nonce of the wrong size', () => {
    expect(() => seal(key.subarray(0, 31), text, 'item')).toThrow('32 bytes');
    expect(() => open(new Uint8Array(33), 'AQ', 'item')).toThrow('32 bytes');
    expect(() => sealWithNonce(key, nonce.subarray(0, 12), text, 'item')).toThrow('24 bytes');
  });

  it('seals an empty text too', () => {
    expect(open(key, seal(key, new Uint8Array(0), 'own-note'), 'own-note')).toEqual(new Uint8Array(0));
  });

  it("a failure says nothing about the key or the text", () => {
    try {
      open(key, seal(newKey(), text, 'item'), 'item');
      throw new Error('it opened');
    } catch (error) {
      expect(error).toBeInstanceOf(DoesNotOpen);
      expect((error as Error).message).toBe('DoesNotOpen: the wrong key, a changed text, or another purpose');
      expect(JSON.stringify(error)).not.toContain('p0pcorn');
    }
  });
});

describe('sealing for a person', () => {
  const alex = hex('5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb');
  const alexPublic = publicKeyOf(alex);
  const once = hex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a');
  const nonce = hex('a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7');
  const itemKey = hex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');

  it('lays it out as the document says, with the key worked out exactly as written there', () => {
    const sealed = sealForWith(once, nonce, alexPublic, itemKey, 'item-key');
    // 0x01 || E || nonce || ciphertext and tag: 105 bytes for a 32-byte key, 140 characters.
    expect(sealed).toHaveLength(105);
    expect(toBase64Url(sealed)).toHaveLength(140);
    expect(sealed[0]).toBe(0x01);
    const E = sealed.subarray(1, 33);
    expect(toHex(E)).toBe('8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a');
    expect(sealed.subarray(33, 57)).toEqual(nonce);
    // key = HKDF-SHA-256(input = X25519(e, P), salt = E || P, info = "homeport/vault/v1/" + purpose, 32 bytes),
    // worked out here with OpenSSL from RFC 7748's own shared secret for these two key pairs.
    const shared = hex('4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742');
    const info = Buffer.from('homeport/vault/v1/item-key');
    const key = Buffer.from(nodeCrypto.hkdfSync('sha256', shared, Buffer.concat([E, alexPublic]), info, 32));
    expect(toHex(sealed.subarray(57))).toBe(toHex(reference.xchachaEncrypt(key, nonce, info, itemKey)));
  });

  it('opens for the person it was sealed for, for every purpose, and looks different every time', () => {
    for (const purpose of PURPOSES) {
      const a = sealFor(alexPublic, itemKey, purpose);
      const b = sealFor(alexPublic, itemKey, purpose);
      expect(a).not.toBe(b);
      // Not even the one-time public key at the front is the same twice.
      expect(a.slice(0, 44)).not.toBe(b.slice(0, 44));
      expect(openMine(alex, a, purpose)).toEqual(itemKey);
    }
  });

  it('opens what the second implementation sealed, and the other way round', () => {
    for (let i = 0; i < 20; i += 1) {
      const person = newKeyPair();
      const share = Uint8Array.from({ length: 25 }, (_, at) => (at * 7 + i) & 0xff);
      expect(openMine(person.privateKey, reference.sealFor(person.publicKey, share, 'helper-share'), 'helper-share')).toEqual(share);
      expect(Uint8Array.from(reference.openMine(person.privateKey, sealFor(person.publicKey, share, 'helper-share'), 'helper-share'))).toEqual(share);
    }
  });

  it("doesn't open for anyone else, for another purpose, or once anything in it was changed", () => {
    const sealed = sealFor(alexPublic, itemKey, 'item-key');
    expect(() => openMine(newKeyPair().privateKey, sealed, 'item-key')).toThrow(DoesNotOpen);
    for (const purpose of PURPOSES.filter((one) => one !== 'item-key')) expect(() => openMine(alex, sealed, purpose)).toThrow(DoesNotOpen);
    const bytes = fromBase64Url(sealed);
    for (let at = 0; at < bytes.length; at += 1) {
      const changed = bytes.slice();
      changed[at]! ^= 0x01;
      // (The top bit of a public key is ignored by X25519 itself, but the key is also part of the salt.)
      expect(() => openMine(alex, toBase64Url(changed), 'item-key')).toThrow(DoesNotOpen);
    }
  });

  it("isn't opened by the key it was sealed with either: what is sealed for a person, only that person opens", () => {
    const sealed = fromBase64Url(sealFor(alexPublic, itemKey, 'item-key'));
    // Whoever sealed it threw the one-time private key away. Trying it as a shared-key piece opens nothing.
    expect(() => open(itemKey, toBase64Url(sealed), 'item-key')).toThrow(DoesNotOpen);
  });

  it('refuses a public key that would make everyone agree on the same key (all zeros, and the other small ones)', () => {
    const bad = [
      '0000000000000000000000000000000000000000000000000000000000000000',
      '0100000000000000000000000000000000000000000000000000000000000000',
      'e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800',
      '5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157',
      'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
    ];
    for (const key of bad) {
      expect(() => sealFor(hex(key), itemKey, 'item-key')).toThrow('this public key cannot be sealed for');
      // And a piece that names such a key as its one-time key doesn't open.
      const forged = new Uint8Array(105);
      forged[0] = 1;
      forged.set(hex(key), 1);
      expect(() => openMine(alex, toBase64Url(forged), 'item-key')).toThrow(DoesNotOpen);
    }
  });

  it('refuses a public key of the wrong size', () => {
    expect(() => sealFor(alexPublic.subarray(0, 31), itemKey, 'item-key')).toThrow('32 bytes');
  });

  it('makes key pairs whose public key anyone can work out again from the private key', () => {
    const pair = newKeyPair();
    expect(pair.privateKey).toHaveLength(32);
    expect(pair.publicKey).toEqual(publicKeyOf(pair.privateKey));
    expect(toHex(newKeyPair().privateKey)).not.toBe(toHex(pair.privateKey));
  });
});
