/**
 * For tests. A second implementation of docs/07-vault-protocol.md "The building blocks", written only from the document
 * and built on what Node has (OpenSSL), with none of the app's code and none of its libraries. The tests seal
 * with one implementation and open with the other: if both read the document the same way, each opens what
 * the other sealed.
 *
 * Node has no XChaCha20-Poly1305, so it is put together here from its parts, as the XChaCha draft describes:
 * HChaCha20 makes a subkey out of the key and the first 16 bytes of the nonce, and ChaCha20-Poly1305 does the
 * rest with the last 8.
 */
import nodeCrypto from 'node:crypto';

const INFO = 'homeport/vault/v1/';

/**
 * HChaCha20: the ChaCha20 rounds without the final addition, of which words 0 to 3 and 12 to 15 are kept.
 * OpenSSL's ChaCha20 block is "rounds + input", so taking the input away again gives the same eight words.
 */
export function hchacha20(key: Uint8Array, nonce16: Uint8Array): Buffer {
  const input = Buffer.from(nonce16);
  const block = nodeCrypto.createCipheriv('chacha20', key, input).update(Buffer.alloc(64));
  const constants = Buffer.from('expand 32-byte k', 'ascii');
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i += 1) {
    out.writeUInt32LE((block.readUInt32LE(4 * i) - constants.readUInt32LE(4 * i)) >>> 0, 4 * i);
    out.writeUInt32LE((block.readUInt32LE(48 + 4 * i) - input.readUInt32LE(4 * i)) >>> 0, 16 + 4 * i);
  }
  return out;
}

const innerNonce = (nonce24: Uint8Array) => Buffer.concat([Buffer.alloc(4), Buffer.from(nonce24.subarray(16))]);

export function xchachaEncrypt(key: Uint8Array, nonce24: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Buffer {
  const cipher = nodeCrypto.createCipheriv('chacha20-poly1305', hchacha20(key, nonce24.subarray(0, 16)), innerNonce(nonce24), { authTagLength: 16 });
  cipher.setAAD(aad, { plaintextLength: plaintext.length });
  return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
}

export function xchachaDecrypt(key: Uint8Array, nonce24: Uint8Array, aad: Uint8Array, sealed: Uint8Array): Buffer {
  const decipher = nodeCrypto.createDecipheriv('chacha20-poly1305', hchacha20(key, nonce24.subarray(0, 16)), innerNonce(nonce24), { authTagLength: 16 });
  decipher.setAAD(aad, { plaintextLength: sealed.length - 16 });
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  return Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
}

/** X25519 with keys as the 32 raw bytes the protocol sends. */
export function x25519(privateKey: Uint8Array, publicKey: Uint8Array): Buffer {
  return nodeCrypto.diffieHellman({
    privateKey: nodeCrypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), privateKey]), format: 'der', type: 'pkcs8' }),
    publicKey: nodeCrypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), publicKey]), format: 'der', type: 'spki' }),
  });
}

export function publicKey(privateKey: Uint8Array): Buffer {
  const base = Buffer.alloc(32);
  base[0] = 9;
  return x25519(privateKey, base);
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const bytes = (text: string) => Buffer.from(text, 'base64url');
const info = (purpose: string) => Buffer.from(INFO + purpose, 'utf8');

/** sealed = 0x01 || nonce || XChaCha20-Poly1305(key, nonce, plaintext, associated data) */
export function seal(key: Uint8Array, plaintext: Uint8Array, purpose: string): string {
  const nonce = nodeCrypto.randomBytes(24);
  return b64(Buffer.concat([Buffer.of(1), nonce, xchachaEncrypt(key, nonce, info(purpose), plaintext)]));
}

export function open(key: Uint8Array, sealed: string, purpose: string): Buffer {
  const all = bytes(sealed);
  if (all[0] !== 1) throw new Error('an unknown version');
  return xchachaDecrypt(key, all.subarray(1, 25), info(purpose), all.subarray(25));
}

/** sealed = 0x01 || E || nonce || XChaCha20-Poly1305(HKDF(X25519(e, P), salt = E || P, info), nonce, plaintext, info) */
export function sealFor(recipientPublic: Uint8Array, plaintext: Uint8Array, purpose: string): string {
  const e = nodeCrypto.randomBytes(32);
  const E = publicKey(e);
  const key = Buffer.from(nodeCrypto.hkdfSync('sha256', x25519(e, recipientPublic), Buffer.concat([E, recipientPublic]), info(purpose), 32));
  const nonce = nodeCrypto.randomBytes(24);
  return b64(Buffer.concat([Buffer.of(1), E, nonce, xchachaEncrypt(key, nonce, info(purpose), plaintext)]));
}

export function openMine(privateKey: Uint8Array, sealed: string, purpose: string): Buffer {
  const all = bytes(sealed);
  if (all[0] !== 1) throw new Error('an unknown version');
  const E = all.subarray(1, 33);
  const key = Buffer.from(nodeCrypto.hkdfSync('sha256', x25519(privateKey, E), Buffer.concat([E, publicKey(privateKey)]), info(purpose), 32));
  return xchachaDecrypt(key, all.subarray(33, 57), info(purpose), all.subarray(57));
}

/** wrapping key = scrypt(Vault key, salt, N, r, p, 32 bytes) */
export function scrypt(secret: string, salt: Uint8Array, kdf: { n: number; r: number; p: number }): Buffer {
  return nodeCrypto.scryptSync(Buffer.from(secret, 'utf8'), salt, 32, { N: kdf.n, r: kdf.r, p: kdf.p, maxmem: 256 * 1024 * 1024 });
}

/**
 * What stands in for `expo-crypto` in a test: the real thing's two functions the Vault uses, on Node's own
 * secure generator. (Jest's stand-in for the phone's module fills nothing in, and a key made of zeros would
 * make every test pass for the wrong reason.) Use it as
 * `jest.mock('expo-crypto', () => require('@/test/vaultReference').expoCrypto)`.
 */
export const expoCrypto = {
  getRandomValues: <T extends ArrayBufferView>(into: T): T => {
    nodeCrypto.webcrypto.getRandomValues(into as unknown as Uint8Array<ArrayBuffer>);
    return into;
  },
  randomUUID: () => nodeCrypto.randomUUID(),
};
