import { concat, fromBase64Url, fromUtf8, sameBytes, toBase64Url, utf8, wipe } from '../bytes';

const hex = (text: string) => Uint8Array.from(Buffer.from(text, 'hex'));

describe('base64url without padding', () => {
  // RFC 4648, section 10, without the padding.
  const VECTORS: [string, string][] = [
    ['', ''],
    ['f', 'Zg'],
    ['fo', 'Zm8'],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg'],
    ['fooba', 'Zm9vYmE'],
    ['foobar', 'Zm9vYmFy'],
  ];

  it("writes and reads the RFC's examples", () => {
    for (const [plain, encoded] of VECTORS) {
      expect(toBase64Url(utf8(plain))).toBe(encoded);
      expect(fromUtf8(fromBase64Url(encoded))).toBe(plain);
    }
  });

  it('uses - and _ where plain base64 has + and /', () => {
    expect(toBase64Url(hex('fbff'))).toBe('-_8');
    expect(fromBase64Url('-_8')).toEqual(hex('fbff'));
  });

  it('agrees with Node for every length up to 300 bytes', () => {
    for (let length = 0; length <= 300; length += 1) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 131 + length * 7) & 0xff);
      const text = Buffer.from(bytes).toString('base64url');
      expect(toBase64Url(bytes)).toBe(text);
      expect(fromBase64Url(text)).toEqual(bytes);
    }
  });

  it('refuses padding, plain base64, white space, and anything else outside the alphabet', () => {
    for (const bad of ['Zg==', 'Zm9v+A', 'Zm9v/A', 'Zm 9v', 'Zm9v\n', 'Zm9vé', 'Z', 'Zm9vY']) {
      expect(() => fromBase64Url(bad)).toThrow('not base64url');
    }
  });

  it('refuses a second spelling of the same bytes (bits left over at the end)', () => {
    // 'Zg' is "f". 'Zh' would decode to the same byte if the last four bits were ignored.
    expect(() => fromBase64Url('Zh')).toThrow('bits left over');
    expect(() => fromBase64Url('Zm9')).toThrow('bits left over');
  });
});

describe('UTF-8', () => {
  it('writes and reads every kind of character', () => {
    for (const text of ['', 'p0pcorn!Friday#night', 'smørrebrød', 'пароль', '密码', 'a🔐b', 'Wi‑Fi “home”']) {
      expect(Buffer.from(utf8(text)).toString('utf8')).toBe(text);
      expect(fromUtf8(utf8(text))).toBe(text);
      expect(utf8(text)).toEqual(Uint8Array.from(Buffer.from(text, 'utf8')));
    }
  });

  it('refuses bytes that are not well-formed UTF-8', () => {
    for (const bad of ['ff', 'c0af', 'e080af', 'c3', 'e282', 'eda080', 'f4908080', '80', 'f8888080']) {
      expect(() => fromUtf8(hex(bad))).toThrow('not UTF-8');
    }
  });

  it('turns a lone half of a pair into the replacement character, like every encoder', () => {
    expect(utf8('\ud83d')).toEqual(hex('efbfbd'));
    expect(utf8('\udc00x')).toEqual(hex('efbfbd78'));
  });
});

describe('the small pieces', () => {
  it('concat puts pieces end to end', () => {
    expect(concat(hex('01'), hex(''), hex('0203'))).toEqual(hex('010203'));
  });

  it('sameBytes is true only for the same bytes', () => {
    expect(sameBytes(hex('0102'), hex('0102'))).toBe(true);
    expect(sameBytes(hex('0102'), hex('0103'))).toBe(false);
    expect(sameBytes(hex('0102'), hex('010203'))).toBe(false);
  });

  it('wipe overwrites what it is given, and takes nothing for an answer', () => {
    const key = hex('0102030405');
    wipe(key, null, undefined);
    expect(key).toEqual(new Uint8Array(5));
  });
});
