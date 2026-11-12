import { randomBytes } from './crypto/random';

/**
 * A generated password: characters picked one by one with the phone's secure random source, with at least
 * one small letter, one capital, one digit and one symbol. The look-alikes (l, I, O, 0, 1) are left out, so
 * it can be read out and typed on a TV remote.
 */
const SMALL = 'abcdefghijkmnopqrstuvwxyz';
const CAPITAL = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SYMBOL = '!#$%&*+-=?@^_';
const ALL = SMALL + CAPITAL + DIGIT + SYMBOL;

export const PASSWORD_LENGTH = 20;

/** One character of an alphabet, each as likely as any other: a random byte that would favour the first few is thrown away. */
function pick(alphabet: string): string {
  const fair = Math.floor(256 / alphabet.length) * alphabet.length;
  for (;;) {
    for (const byte of randomBytes(16)) if (byte < fair) return alphabet[byte % alphabet.length]!;
  }
}

export function generatePassword(length = PASSWORD_LENGTH): string {
  if (!Number.isInteger(length) || length < 8 || length > 64) throw new Error('between 8 and 64 characters');
  for (;;) {
    let password = '';
    for (let i = 0; i < length; i += 1) password += pick(ALL);
    // Starting over until every kind is in it favours no password among those that have all four.
    if ([SMALL, CAPITAL, DIGIT, SYMBOL].every((kind) => [...password].some((character) => kind.includes(character)))) return password;
  }
}
