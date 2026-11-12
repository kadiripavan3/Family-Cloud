import { gcm } from '@noble/ciphers/aes.js';
import fs from 'node:fs';
import nodeCrypto from 'node:crypto';
import path from 'node:path';

import { fromBase64Url, toBase64Url, utf8 } from '../bytes';
import { guestLink, sealForGuest, sealForGuestWith } from '../guest';

jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);

const hex = (text: string) => Uint8Array.from(Buffer.from(text, 'hex'));
const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

/** The guest page's own script, as the API serves it at /share/guest.js. */
const GUEST_SCRIPT = fs.readFileSync(path.join(__dirname, '../../../../../../api/src/main/resources/static/share/guest.js'), 'utf8');

type Card = { secret: string; problem: string; told: string[]; tap: () => Promise<void> };

/**
 * Runs the API's guest page script on a page with one sealed card, the way a guest's browser does: the key is
 * whatever follows the # of the link, and the card is opened with the browser's own Web Crypto when its button
 * is tapped. Returns what the page shows.
 */
function guestPage(link: string, sealed: string, once = false): Card {
  const piece = (extra: object = {}) => ({ hidden: true, textContent: '', disabled: false, ...extra });
  let onTap: () => void = () => undefined;
  const button = piece({ addEventListener: (_: string, heard: () => void) => (onTap = heard) });
  const secret = piece();
  const problem = piece();
  const others = piece();
  const attributes: Record<string, string> = { 'data-sealed': sealed, 'data-once': String(once), 'data-card': 'card-1' };
  const card = {
    querySelector: (selector: string) => (selector === 'button' ? button : selector === '.secret' ? secret : selector === '.problem' ? problem : others),
    getAttribute: (name: string) => attributes[name] ?? null,
    removeAttribute: (name: string) => delete attributes[name],
  };
  const told: string[] = [];
  const page = {
    location: { hash: link.includes('#') ? link.slice(link.indexOf('#')) : '', pathname: '/g/some-token', reload: () => undefined },
    document: { querySelector: () => null, querySelectorAll: () => [card] },
    crypto: nodeCrypto.webcrypto,
    fetch: async (address: string) => {
      told.push(address);
      return { ok: true };
    },
  };
  const window = { addEventListener: () => undefined, crypto: page.crypto, TextDecoder };
  // On purpose: the API's own script, run the way a browser runs it.
  // The script hides a card again after half a minute. No test waits that long, so its timer is never started.
  new Function('window', 'location', 'document', 'crypto', 'fetch', 'setTimeout', 'clearTimeout', GUEST_SCRIPT)(window, page.location, page.document, page.crypto, page.fetch, () => 0, () => undefined);
  return {
    get secret() {
      return secret.hidden ? '' : secret.textContent;
    },
    get problem() {
      return problem.hidden ? '' : problem.textContent;
    },
    told,
    tap: async () => {
      onTap();
      // The script answers in promises of its own: wait until it shows the card or says why not.
      for (let i = 0; i < 400 && secret.hidden && problem.hidden; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    },
  };
}

describe('AES-256-GCM, what a guest pass is sealed with', () => {
  it("gives the standard's test case 14: a zero key, a zero nonce, sixteen zero bytes", () => {
    const sealed = gcm(new Uint8Array(32), new Uint8Array(12)).encrypt(new Uint8Array(16));
    expect(toHex(sealed)).toBe('cea7403d4d606b6e074ec5d3baf39d18' + 'd0d1c8a799996bf0265b98b5d48ab919');
  });

  it('agrees with OpenSSL', () => {
    const key = hex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
    const nonce = hex('a0a1a2a3a4a5a6a7a8a9aaab');
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, nonce);
    const expected = Buffer.concat([nonce, cipher.update('4821, then the star key', 'utf8'), cipher.final(), cipher.getAuthTag()]);
    expect(toHex(sealForGuestWith(key, nonce, '4821, then the star key'))).toBe(expected.toString('hex'));
  });
});

describe('a door code on a guest pass', () => {
  it('is a 12-byte nonce, the text scrambled, and a 16-byte tag, as base64url; the key is 32 bytes', () => {
    const { ciphertext, key } = sealForGuest('4821, then the star key');
    expect(ciphertext).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(ciphertext)).toHaveLength(12 + utf8('4821, then the star key').length + 16);
    expect(fromBase64Url(key)).toHaveLength(32);
    expect(key).toHaveLength(43);
  });

  it("is opened by the API's own guest page script with the key from the link, and by nothing else", async () => {
    const { ciphertext, key } = sealForGuest('4821, then the star key');
    const link = guestLink('http://localhost:8095/g/some-token', key);
    expect(link).toBe(`http://localhost:8095/g/some-token#${key}`);

    const page = guestPage(link, ciphertext);
    expect(page.secret).toBe('');
    await page.tap();
    expect(page.secret).toBe('4821, then the star key');
    expect(page.problem).toBe('');
    // The script told the API the card was shown, at the pass's own address. The key went nowhere.
    expect(page.told).toEqual(['/g/some-token/cards/card-1/shown']);
    expect(page.told.join(' ')).not.toContain(key);
  });

  it('opens with every kind of character in it', async () => {
    const text = 'Network Lind‑Home, password smørrebrød-and-rain 🔑 “4821”';
    const { ciphertext, key } = sealForGuest(text);
    const page = guestPage(`https://homeport.example/g/t#${key}`, ciphertext);
    await page.tap();
    expect(page.secret).toBe(text);
  });

  it('a show-once card is shown after the script has told the API', async () => {
    const { ciphertext, key } = sealForGuest('4821');
    const page = guestPage(`https://homeport.example/g/t#${key}`, ciphertext, true);
    await page.tap();
    expect(page.told).toHaveLength(1);
    expect(page.secret).toBe('4821');
  });

  it("the page says the link is incomplete with another pass's key, a changed card, or no key at all", async () => {
    const { ciphertext } = sealForGuest('4821, then the star key');
    const other = sealForGuest('something else');
    const wrongKey = guestPage(`https://homeport.example/g/t#${other.key}`, ciphertext);
    await wrongKey.tap();
    expect(wrongKey.secret).toBe('');
    expect(wrongKey.problem).toContain('This link is incomplete');

    const bytes = fromBase64Url(other.ciphertext);
    bytes[14]! ^= 1;
    const changed = guestPage(`https://homeport.example/g/t#${other.key}`, toBase64Url(bytes));
    await changed.tap();
    expect(changed.secret).toBe('');
    expect(changed.problem).toContain('This link is incomplete');

    const noKey = guestPage('https://homeport.example/g/t', ciphertext);
    expect(noKey.problem).toContain('This link is incomplete');
  });

  it('seals a second card of the same pass with the same key, and never the same way twice', async () => {
    const door = sealForGuest('4821');
    const wifi = sealForGuest('sm0rrebrod-and-rain', door.key);
    expect(wifi.key).toBe(door.key);
    expect(sealForGuest('4821', door.key).ciphertext).not.toBe(door.ciphertext);
    const page = guestPage(`https://homeport.example/g/t#${door.key}`, wifi.ciphertext);
    await page.tap();
    expect(page.secret).toBe('sm0rrebrod-and-rain');
  });

  it('a new pass gets a new key', () => {
    expect(sealForGuest('4821').key).not.toBe(sealForGuest('4821').key);
  });

  it('refuses a key or a nonce of the wrong size', () => {
    expect(() => sealForGuestWith(new Uint8Array(16), new Uint8Array(12), 'x')).toThrow('32 bytes');
    expect(() => sealForGuestWith(new Uint8Array(32), new Uint8Array(24), 'x')).toThrow('12 bytes');
    expect(() => sealForGuest('x', 'not a key!')).toThrow();
  });

  it('puts the key after the #, once, whatever the address already ends in', () => {
    expect(guestLink('https://homeport.example/g/t#old', 'KEY')).toBe('https://homeport.example/g/t#KEY');
  });
});
