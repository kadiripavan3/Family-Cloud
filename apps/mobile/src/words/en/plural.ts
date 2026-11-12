/**
 * How English counts. Other languages count differently (one, few, many…), so these stay inside this catalog:
 * a screen asks for the whole sentence, never for a plural.
 */

/** "1 photo", "3 photos"; "1 person", "3 people" when the second word is given. */
export function plural(count: number, one: string, many: string = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** 1200 becomes "1.2k". */
export function compact(count: number): string {
  if (count < 1000) return String(count);
  const thousands = count / 1000;
  return `${thousands >= 10 ? Math.round(thousands) : Math.round(thousands * 10) / 10}k`;
}

/** "four" for 4: small numbers read better as words. Beyond ten, the figure. */
export function spelled(count: number): string {
  return ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][count] ?? String(count);
}

/** "Mia", "Mia and Leo", "Mia, Leo and Alex": names in a row, with the language's own last word. */
export function formatList(names: readonly string[], last: 'and' | 'or' = 'and'): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${last} ${names[names.length - 1]}`;
}
