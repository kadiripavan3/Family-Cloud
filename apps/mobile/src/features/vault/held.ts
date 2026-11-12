import type { ItemDraft } from './actions';

/**
 * A draft from the words Jot held back because they looked like a code ("Gate code 4471"): a code whose
 * last word is the code itself and whose other words are its title. One word alone is the code, and the
 * title is left to be typed. The person sees both in the form and puts right what was guessed wrong.
 */
export function draftFromHeld(words: string): ItemDraft {
  const parts = words.trim().split(/\s+/).filter(Boolean);
  const code = parts.pop() ?? '';
  return { category: 'code', title: parts.join(' '), site: '', fields: code ? { code } : {}, expiresOn: null };
}
