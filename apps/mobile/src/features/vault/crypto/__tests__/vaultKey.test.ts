import { scrypt } from '@noble/hashes/scrypt.js';

import * as reference from '@/test/vaultReference';

import { fromBase64Url, toBase64Url, utf8 } from '../bytes';
import { DoesNotOpen, newKeyPair, open } from '../seal';
import { acceptableKdf, belongsTo, grouped, KDF, newVaultKey, normalizeVaultKey, stretch, unwrapPrivateKey, unwrapWith, VAULT_KEY_ALPHABET, wrapPrivateKey, wrapWith } from '../vaultKey';

jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);

const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

describe('scrypt (RFC 7914, section 12)', () => {
  it('gives the first three test vectors', () => {
    expect(toHex(scrypt('', '', { N: 16, r: 1, p: 1, dkLen: 64 }))).toBe(
      '77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906',
    );
    expect(toHex(scrypt('password', 'NaCl', { N: 1024, r: 8, p: 16, dkLen: 64 }))).toBe(
      'fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b3731622eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640',
    );
    expect(toHex(scrypt('pleaseletmein', 'SodiumChloride', { N: 16384, r: 8, p: 1, dkLen: 64 }))).toBe(
      '7023bdcb3afd7348461c06cd81fd38ebfda8fbba904f8e3ea9b543f6545da1f2d5432955613f0fcf62d49705242a9af9e61e85dc0d651e40dfcf017b45575887',
    );
  });

  it("the app's own way of calling it gives the third vector's first 32 bytes, in slices that let the screen draw", async () => {
    const heard: number[] = [];
    const key = await stretch('pleaseletmein', utf8('SodiumChloride'), { n: 16384, r: 8, p: 1 }, (done) => heard.push(done));
    expect(toHex(key)).toBe('7023bdcb3afd7348461c06cd81fd38ebfda8fbba904f8e3ea9b543f6545da1f2');
    // It said how far it was, more than once, and ended at 1.
    expect(heard.length).toBeGreaterThan(1);
    expect(heard[heard.length - 1]).toBe(1);
  });

  it("with the document's numbers it agrees with OpenSSL, in well under ten seconds", async () => {
    const salt = fromBase64Url('c2FsdHNhbHRzYWx0c2FsdA');
    const started = Date.now();
    const key = await stretch('KT4M9QXZPL2A77HDVB3NE8RW', salt, KDF);
    const took = Date.now() - started;
    expect(toHex(key)).toBe(toHex(reference.scrypt('KT4M9QXZPL2A77HDVB3NE8RW', salt, KDF)));
    // About a quarter of a second under jest on the machine this was written on. Ten seconds would be a broken build.
    expect(took).toBeLessThan(10_000);
    expect(KDF).toEqual({ n: 32768, r: 8, p: 1 });
  });

  it('lets other work run while it is busy', async () => {
    let ticks = 0;
    const timer = setInterval(() => (ticks += 1), 1);
    await stretch('KT4M9QXZPL2A77HDVB3NE8RW', utf8('0123456789abcdef'), KDF);
    clearInterval(timer);
    // A sum that held on to the thread from start to end would let no timer fire in between.
    expect(ticks).toBeGreaterThan(2);
  });

  it('refuses numbers a record could carry to freeze the phone, and anything below what the API takes', async () => {
    expect(acceptableKdf(KDF)).toBe(true);
    expect(acceptableKdf({ n: 16384, r: 8, p: 1 })).toBe(true);
    expect(acceptableKdf({ n: 131072, r: 8, p: 1 })).toBe(true);
    for (const bad of [null, undefined, {}, { n: 32768, r: 8 }, { n: 8192, r: 8, p: 1 }, { n: 32767, r: 8, p: 1 }, { n: 4194304, r: 8, p: 1 }, { n: 32768, r: 32, p: 16 }, { n: 32768, r: 0, p: 1 }, { n: 32768, r: 8, p: 0 }, { n: 32768.5, r: 8, p: 1 }, { n: 32768, r: 8, p: 16 }]) {
      expect(acceptableKdf(bad)).toBe(false);
    }
    await expect(stretch('x', utf8('salt'), { n: 4194304, r: 8, p: 1 })).rejects.toThrow('refused');
  });
});

describe('the Vault key', () => {
  it('is 24 characters without I, O, 0 and 1, shown in six groups of four', () => {
    const key = newVaultKey();
    expect(key).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{24}$/);
    expect(grouped(key)).toMatch(/^([A-Z2-9]{4} ){5}[A-Z2-9]{4}$/);
    expect(grouped('KT4M9QXZPL2A77HDVB3NE8RW')).toBe('KT4M 9QXZ PL2A 77HD VB3N E8RW');
    expect(VAULT_KEY_ALPHABET).toHaveLength(32);
    expect(new Set(VAULT_KEY_ALPHABET).size).toBe(32);
  });

  it('is different every time, and uses every character about as often as any other', () => {
    const counts = new Map<string, number>();
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i += 1) {
      const key = newVaultKey();
      seen.add(key);
      for (const character of key) counts.set(character, (counts.get(character) ?? 0) + 1);
    }
    expect(seen.size).toBe(2000);
    expect(counts.size).toBe(32);
    // 48,000 characters, 1,500 expected of each. Chi-squared with 31 degrees of freedom is above 80 less than once in a million runs.
    const chi = [...counts.values()].reduce((sum, count) => sum + (count - 1500) ** 2 / 1500, 0);
    expect(chi).toBeLessThan(80);
  });

  it('is read the same however it was typed: small letters, spaces, a line break in the middle', () => {
    expect(normalizeVaultKey('KT4M 9QXZ PL2A 77HD VB3N E8RW')).toBe('KT4M9QXZPL2A77HDVB3NE8RW');
    expect(normalizeVaultKey('kt4m 9qxz pl2a\n77hd vb3n e8rw ')).toBe('KT4M9QXZPL2A77HDVB3NE8RW');
    expect(normalizeVaultKey('KT4M9QXZPL2A77HDVB3NE8RW')).toBe('KT4M9QXZPL2A77HDVB3NE8RW');
  });

  it("isn't taken for one when it is too short, too long, or has a character the alphabet leaves out", () => {
    for (const bad of ['', 'KT4M 9QXZ', 'KT4M 9QXZ PL2A 77HD VB3N E8RW A', 'KT4M 9QXZ PL2A 77HD VB3N E8R0', 'KT4M 9QXZ PL2A 77HD VB3N E8RI', 'KT4M-9QXZ-PL2A-77HD-VB3N-E8RW']) {
      expect(normalizeVaultKey(bad)).toBeNull();
    }
  });
});

describe('the private key, wrapped with the Vault key', () => {
  const pair = newKeyPair();
  const vaultKey = newVaultKey();
  const record = async (key = vaultKey) => ({ publicKey: toBase64Url(pair.publicKey), ...(await wrapPrivateKey(key, pair.privateKey)) });

  it('travels with a 16-byte salt and the numbers, as base64url, and comes back out with the same Vault key', async () => {
    const wrapped = await record();
    expect(fromBase64Url(wrapped.salt)).toHaveLength(16);
    expect(wrapped.kdf).toEqual({ n: 32768, r: 8, p: 1 });
    // 0x01 + 24 + 32 + 16 bytes: 98 characters. Within the API's 512.
    expect(wrapped.wrappedPrivateKey).toMatch(/^[A-Za-z0-9_-]{98}$/);
    expect(await unwrapPrivateKey(vaultKey, wrapped)).toEqual(pair.privateKey);
    // Typed the way a person types it.
    expect(await unwrapPrivateKey(grouped(vaultKey).toLowerCase(), wrapped)).toEqual(pair.privateKey);
  });

  it('is wrapped exactly as the document says: scrypt of the 24 characters, then sealed as "private-key"', async () => {
    const wrapped = await record();
    const wrappingKey = Uint8Array.from(reference.scrypt(vaultKey, fromBase64Url(wrapped.salt), wrapped.kdf));
    expect(open(wrappingKey, wrapped.wrappedPrivateKey, 'private-key')).toEqual(pair.privateKey);
    expect(Uint8Array.from(reference.open(wrappingKey, wrapped.wrappedPrivateKey, 'private-key'))).toEqual(pair.privateKey);
  });

  it('never looks the same twice, and holds neither key in the clear', async () => {
    const a = await record();
    const b = await record();
    expect(a.salt).not.toBe(b.salt);
    expect(a.wrappedPrivateKey).not.toBe(b.wrappedPrivateKey);
    const sent = JSON.stringify(a);
    for (const secret of [vaultKey, grouped(vaultKey), toBase64Url(pair.privateKey), Buffer.from(pair.privateKey).toString('hex'), Buffer.from(pair.privateKey).toString('base64')]) {
      expect(sent).not.toContain(secret);
    }
  });

  it("doesn't open with any other Vault key: there is no \"forgot my key\"", async () => {
    const wrapped = await record();
    await expect(unwrapPrivateKey(newVaultKey(), wrapped)).rejects.toThrow(DoesNotOpen);
    await expect(unwrapPrivateKey('not a key', wrapped)).rejects.toThrow(DoesNotOpen);
  });

  it('stops when the key that comes out is not the one the public key belongs to', async () => {
    const wrapped = await record();
    const swapped = { ...wrapped, publicKey: toBase64Url(newKeyPair().publicKey) };
    await expect(unwrapPrivateKey(vaultKey, swapped)).rejects.toThrow(DoesNotOpen);
    expect(belongsTo(pair.privateKey, wrapped.publicKey)).toBe(true);
    expect(belongsTo(pair.privateKey, swapped.publicKey)).toBe(false);
    expect(belongsTo(pair.privateKey, 'not a key')).toBe(false);
  });

  it('stops at a record whose numbers would freeze the phone, before doing any of the sum', async () => {
    const wrapped = await record();
    await expect(unwrapPrivateKey(vaultKey, { ...wrapped, kdf: { n: 4194304, r: 32, p: 16 } })).rejects.toThrow('refused');
    await expect(unwrapPrivateKey(vaultKey, { ...wrapped, kdf: null })).rejects.toThrow('refused');
  });

  it("doesn't wrap with something that isn't a Vault key", async () => {
    await expect(wrapPrivateKey('password123', pair.privateKey)).rejects.toThrow('not a Vault key');
  });

  it('with a new Vault key the same private key is wrapped afresh, and the old key stops working on the new record', async () => {
    const next = newVaultKey();
    const rewrapped = await record(next);
    expect(await unwrapPrivateKey(next, rewrapped)).toEqual(pair.privateKey);
    await expect(unwrapPrivateKey(vaultKey, rewrapped)).rejects.toThrow(DoesNotOpen);
  });
});

describe('the private key as this phone keeps it between unlocks, behind a passcode', () => {
  it('comes back out with the passcode, not with another, and not as anything the API stores', async () => {
    const pair = newKeyPair();
    const kept = await wrapWith('correct horse', pair.privateKey, 'this-device');
    expect(await unwrapWith('correct horse', kept, 'this-device')).toEqual(pair.privateKey);
    await expect(unwrapWith('Correct horse', kept, 'this-device')).rejects.toThrow(DoesNotOpen);
    // What is kept on the phone doesn't open as a Vault record, and the other way round.
    await expect(unwrapWith('correct horse', kept, 'private-key')).rejects.toThrow(DoesNotOpen);
    await expect(unwrapWith('correct horse', { ...kept, salt: 'not base64url!' }, 'this-device')).rejects.toThrow(DoesNotOpen);
  });
});
