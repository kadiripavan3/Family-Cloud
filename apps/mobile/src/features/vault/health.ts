import type { VaultHealth } from '@/api/generated/homeport';

/**
 * The phone's verdict on a password, which is all the API ever learns about it: `ok`, `weak` or `reused`.
 * (`leaked` exists as a word, and nothing sets it: no leak check is connected.)
 *
 * Weak is judged by length and variety only, on purpose: a rule a person can read and check.
 *  - shorter than 10 characters; or
 *  - shorter than 16 and made of fewer than three of: small letters, capital letters, digits, anything else; or
 *  - fewer than five different characters, however long.
 */
export const SHORT = 10;
export const LONG_ENOUGH = 16;
export const FEW_DIFFERENT = 5;

/** How many kinds of character a password uses: small letters, capital letters, digits, anything else. 0 to 4. */
export function variety(password: string): number {
  return [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{Ll}\p{Lu}\p{Nd}]/u].filter((kind) => kind.test(password)).length;
}

export function isWeak(password: string): boolean {
  const length = [...password].length;
  if (length < SHORT) return true;
  if (length < LONG_ENOUGH && variety(password) < 3) return true;
  return new Set(password).size < FEW_DIFFERENT;
}

/**
 * The word that is saved with the item. `usedElsewhere` is true when the same password is in another item
 * this person opened since unlocking. No password at all (a card, an ID) is `ok`: there is nothing to judge.
 */
export function healthOf(password: string | null, usedElsewhere: boolean): VaultHealth {
  if (!password) return 'ok';
  if (usedElsewhere) return 'reused';
  return isWeak(password) ? 'weak' : 'ok';
}
