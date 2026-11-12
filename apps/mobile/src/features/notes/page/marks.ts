import type { Mark } from '@/api/generated/homeport';

/** Someone a text can name: a member of the circle, by the name they are called ("Alex") and their whole name. */
export type Named = { memberId: string; name: string; first: string };

/**
 * The text of a block is plain words with marks over them: from where to where it is bold, slanted, struck
 * through, a link, or someone's name. A phone's box to type in has no such thing, so while a block is being
 * typed in, its marks are written the way people write them in a message:
 *
 *     *bold*   _slanted_   ~struck~   https://a.link   [words](https://a.link)   @Alex
 *
 * `toTyped` writes a block's text that way; `fromTyped` reads what was typed back into words and marks.
 */

const SIGN = { bold: '*', italic: '_', strike: '~' } as const;
const KIND: Record<string, 'bold' | 'italic' | 'strike'> = { '*': 'bold', _: 'italic', '~': 'strike' };

const letter = (char: string | undefined) => !!char && /[A-Za-z0-9À-ɏ]/.test(char);
const space = (char: string | undefined) => !char || /\s/.test(char);

/** A block's words with its marks written out, to be typed in. */
export function toTyped(text: string, marks: readonly Mark[] | undefined): string {
  type Put = { at: number; what: string; closes: boolean; width: number };
  const puts: Put[] = [];
  for (const mark of marks ?? []) {
    const start = mark.start ?? 0;
    const end = mark.end ?? 0;
    if (end <= start || end > text.length) continue;
    const width = end - start;
    if (mark.kind === 'bold' || mark.kind === 'italic' || mark.kind === 'strike') {
      puts.push({ at: start, what: SIGN[mark.kind], closes: false, width }, { at: end, what: SIGN[mark.kind], closes: true, width });
    } else if (mark.kind === 'link' && mark.url && text.slice(start, end) !== mark.url) {
      puts.push({ at: start, what: '[', closes: false, width }, { at: end, what: `](${mark.url})`, closes: true, width });
    }
    // A link that is its own address, and a name, are typed as they read.
  }
  // From the end of the text backwards, so the places before stay where they are. Where one mark ends and
  // another begins, the ending one closes first; of two that begin together, the longer one opens first.
  puts.sort((a, b) => b.at - a.at || Number(a.closes) - Number(b.closes) || (a.closes ? b.width - a.width : a.width - b.width));
  let typed = text;
  for (const put of puts) typed = typed.slice(0, put.at) + put.what + typed.slice(put.at);
  return typed;
}

/** What was typed, read back: the plain words, and the marks over them. */
export function fromTyped(typed: string, people: readonly Named[] = []): { text: string; marks: Mark[] } {
  let text = '';
  const marks: Mark[] = [];
  // The longest name first: "@Alex Strand" is one name, not "@Alex" and a word.
  const names = people.flatMap((person) => [person.name, person.first].filter(Boolean).map((name) => ({ name, memberId: person.memberId }))).sort((a, b) => b.name.length - a.name.length);
  let at = 0;
  while (at < typed.length) {
    const char = typed[at]!;
    const fresh = !letter(typed[at - 1]);

    // *bold*, _slanted_, ~struck~: on one line, hugging the words inside, not in the middle of a word.
    if (KIND[char] && fresh && !space(typed[at + 1])) {
      let close = -1;
      for (let end = at + 2; end < typed.length && typed[end] !== '\n'; end += 1) {
        if (typed[end] === char && !space(typed[end - 1]) && !letter(typed[end + 1])) {
          close = end;
          break;
        }
      }
      if (close > 0) {
        const inside = fromTyped(typed.slice(at + 1, close), people);
        marks.push({ start: text.length, end: text.length + inside.text.length, kind: KIND[char] });
        for (const mark of inside.marks) marks.push({ ...mark, start: (mark.start ?? 0) + text.length, end: (mark.end ?? 0) + text.length });
        text += inside.text;
        at = close + 1;
        continue;
      }
    }

    // [words](https://a.link)
    if (char === '[') {
      const link = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/i.exec(typed.slice(at));
      if (link) {
        marks.push({ start: text.length, end: text.length + link[1]!.length, kind: 'link', url: link[2] });
        text += link[1];
        at += link[0].length;
        continue;
      }
    }

    // An address by itself is a link to itself. A full stop or a bracket after it is the sentence's, not the address's.
    if ((char === 'h' || char === 'H') && fresh) {
      const address = /^https?:\/\/[^\s<>]+/i.exec(typed.slice(at))?.[0].replace(/[.,;:!?)\]'"]+$/, '');
      if (address && address.length > 'https://'.length) {
        marks.push({ start: text.length, end: text.length + address.length, kind: 'link', url: address });
        text += address;
        at += address.length;
        continue;
      }
    }

    // @Alex: someone of the circle, by the name they are called or their whole name.
    if (char === '@' && fresh) {
      const named = names.find((one) => typed.startsWith(one.name, at + 1) && !letter(typed[at + 1 + one.name.length]));
      if (named) {
        marks.push({ start: text.length, end: text.length + named.name.length + 1, kind: 'mention', memberId: named.memberId });
        text += `@${named.name}`;
        at += named.name.length + 1;
        continue;
      }
    }

    text += char;
    at += 1;
  }
  marks.sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || (a.end ?? 0) - (b.end ?? 0));
  return { text, marks };
}

/** A block's words cut where its marks begin and end, each piece with the marks that lie over it: how the text is drawn. */
export function pieces(text: string, marks: readonly Mark[] | undefined): { text: string; marks: Mark[] }[] {
  const within = (marks ?? []).filter((mark) => (mark.end ?? 0) > (mark.start ?? 0) && (mark.start ?? 0) < text.length);
  const cuts = [...new Set([0, text.length, ...within.flatMap((mark) => [mark.start ?? 0, Math.min(mark.end ?? 0, text.length)])])].sort((a, b) => a - b);
  const out: { text: string; marks: Mark[] }[] = [];
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const from = cuts[index]!;
    const to = cuts[index + 1]!;
    if (to > from) out.push({ text: text.slice(from, to), marks: within.filter((mark) => (mark.start ?? 0) <= from && (mark.end ?? 0) >= to) });
  }
  return out;
}
