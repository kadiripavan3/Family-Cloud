import nodeCrypto from 'node:crypto';

import { words } from '@/words';

import { checkNumbers } from '../checkWords';

describe('the check words of a recovery', () => {
  const key = Buffer.from('8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a', 'hex');

  it('are picked by the first bytes of the SHA-256 of the temporary public key', () => {
    const digest = nodeCrypto.createHash('sha256').update(key).digest();
    expect(checkNumbers(key.toString('base64url'))).toEqual([digest[0], digest[1], digest[2]]);
    expect(checkNumbers(key.toString('base64url'), 5)).toEqual([...digest.subarray(0, 5)]);
  });

  it('are the same on both phones for one key, and other words for another', () => {
    const other = Buffer.from(key);
    other[0]! ^= 1;
    expect(checkNumbers(key.toString('base64url'))).toEqual(checkNumbers(key.toString('base64url')));
    expect(checkNumbers(other.toString('base64url'))).not.toEqual(checkNumbers(key.toString('base64url')));
  });

  it("refuse what isn't a public key", () => {
    expect(() => checkNumbers('AAAA')).toThrow('32 bytes');
    expect(() => checkNumbers('not a key!')).toThrow();
  });

  it('the catalog has exactly one word for each value a byte can have, all different, all plain', () => {
    const list = words.vault.checkWords;
    expect(list).toHaveLength(256);
    expect(new Set(list).size).toBe(256);
    for (const word of list) expect(word).toMatch(/^[a-z]{3,10}$/);
  });
});
