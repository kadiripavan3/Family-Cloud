import { fromBase32, hotp, totp, totpSecondsLeft, totpSecretFrom } from '../totp';

/** The secret of both RFCs' examples: the ASCII text "12345678901234567890". */
const SECRET = Uint8Array.from(Buffer.from('12345678901234567890', 'ascii'));
const SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('one-time codes', () => {
  it('HOTP gives the ten codes of RFC 4226, appendix D', () => {
    const codes = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    codes.forEach((code, count) => expect(hotp(SECRET, count)).toBe(code));
  });

  it('TOTP gives the SHA-1 codes of RFC 6238, appendix B (eight digits there)', () => {
    const VECTORS: [number, string][] = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ];
    for (const [seconds, code] of VECTORS) {
      expect(totp(SECRET_BASE32, seconds * 1000, 8)).toBe(code);
      // What the app shows is the same number's last six digits.
      expect(totp(SECRET_BASE32, seconds * 1000)).toBe(code.slice(2));
    }
  });

  it('changes every 30 seconds, on the half minute, and says how long the code still has', () => {
    const at = (seconds: number) => totp(SECRET_BASE32, seconds * 1000);
    expect(at(30)).toBe(at(59));
    expect(at(59)).not.toBe(at(60));
    expect(totpSecondsLeft(0)).toBe(30);
    expect(totpSecondsLeft(1_000)).toBe(29);
    expect(totpSecondsLeft(29_999)).toBe(1);
    expect(totpSecondsLeft(30_000)).toBe(30);
    expect(totpSecondsLeft(1_111_111_109_000)).toBe(1);
  });

  it('keeps the zeros at the front of a code', () => {
    expect(totp(SECRET_BASE32, 1111111109 * 1000, 8)).toBe('07081804');
    expect(hotp(SECRET, 1111111109 / 30 - (1111111109 % 30) / 30)).toHaveLength(6);
  });

  it('reads a secret the way sites show it: small letters, spaces, dashes, padding', () => {
    expect(fromBase32(SECRET_BASE32)).toEqual(SECRET);
    expect(fromBase32('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')).toEqual(SECRET);
    expect(fromBase32('GEZD-GNBV-GY3T-QOJQ-GEZD-GNBV-GY3T-QOJQ')).toEqual(SECRET);
    // RFC 4648's own examples.
    expect(Buffer.from(fromBase32('MZXW6YTBOI======')!).toString()).toBe('foobar');
    expect(Buffer.from(fromBase32('MZXW6YQ=')!).toString()).toBe('foob');
    expect(Buffer.from(fromBase32('MY')!).toString()).toBe('f');
  });

  it("says so when a secret isn't one, instead of showing a code that would be wrong", () => {
    for (const bad of ['', '   ', 'not base32!', 'GEZDGNBV1', 'GEZDGNBV0', 'A']) {
      expect(fromBase32(bad)).toBeNull();
      expect(totp(bad, 59_000)).toBeNull();
    }
  });

  it('takes the secret out of the link behind a QR code, and only the kind of code it can make', () => {
    expect(totpSecretFrom(`otpauth://totp/Netflix:linds.home%40example.com?secret=${SECRET_BASE32}&issuer=Netflix`)).toBe(SECRET_BASE32);
    expect(totpSecretFrom(`otpauth://totp/Netflix?issuer=Netflix&secret=${SECRET_BASE32.toLowerCase()}&algorithm=SHA1&digits=6&period=30`)).toBe(SECRET_BASE32);
    expect(totpSecretFrom(' gezd gnbv gy3t qojq gezd gnbv gy3t qojq ')).toBe(SECRET_BASE32);
    expect(totpSecretFrom(`otpauth://totp/X?secret=${SECRET_BASE32}&algorithm=SHA256`)).toBeNull();
    expect(totpSecretFrom(`otpauth://totp/X?secret=${SECRET_BASE32}&digits=8`)).toBeNull();
    expect(totpSecretFrom(`otpauth://totp/X?secret=${SECRET_BASE32}&period=60`)).toBeNull();
    expect(totpSecretFrom(`otpauth://hotp/X?secret=${SECRET_BASE32}&counter=1`)).toBeNull();
    expect(totpSecretFrom('otpauth://totp/X?issuer=X')).toBeNull();
    expect(totpSecretFrom('hunter2!')).toBeNull();
  });

  it('refuses a count that makes no sense', () => {
    expect(() => hotp(SECRET, -1)).toThrow('a count from 0 up');
    expect(() => hotp(SECRET, 1.5)).toThrow('a count from 0 up');
  });
});
