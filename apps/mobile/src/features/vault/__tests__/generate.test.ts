import { generatePassword, PASSWORD_LENGTH } from '../generate';
import { isWeak, variety } from '../health';

jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);

describe('a generated password', () => {
  it('is 20 characters with a small letter, a capital, a digit and a symbol, and none of the look-alikes', () => {
    for (let i = 0; i < 200; i += 1) {
      const password = generatePassword();
      expect(password).toHaveLength(PASSWORD_LENGTH);
      expect(variety(password)).toBe(4);
      expect(password).toMatch(/^[a-km-zA-HJ-NP-Z2-9!#$%&*+\-=?@^_]+$/);
      expect(isWeak(password)).toBe(false);
    }
  });

  it('is different every time and uses every character of its alphabet', () => {
    const seen = new Set<string>();
    const used = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const password = generatePassword();
      seen.add(password);
      for (const character of password) used.add(character);
    }
    expect(seen.size).toBe(500);
    expect(used.size).toBe(25 + 24 + 8 + 13);
  });

  it('never comes from Math.random', () => {
    const insecure = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random was used for a password');
    });
    expect(generatePassword(32)).toHaveLength(32);
    expect(insecure).not.toHaveBeenCalled();
    insecure.mockRestore();
  });

  it('refuses a length that makes no sense', () => {
    for (const bad of [0, 7, 65, 12.5]) expect(() => generatePassword(bad)).toThrow('between 8 and 64');
  });
});
