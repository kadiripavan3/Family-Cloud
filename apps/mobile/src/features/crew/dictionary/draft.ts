/**
 * What was typed into the box "A new word, and what it means", as its two halves. People write the two with
 * a colon, a dash or an equals sign between them ("gate cardio: the sprint to boarding"); without one, all
 * of it is the word and the meaning is asked for next. The API keeps a word to 80 letters and a meaning to 500.
 */
export function splitDraft(typed: string): { word: string; meaning: string } {
  const text = typed.trim();
  const cut = /\s*(?::|=|\s[-–—]\s)\s*/.exec(text);
  if (!cut || cut.index === 0) return { word: text.slice(0, 80), meaning: '' };
  return { word: text.slice(0, cut.index).trim().slice(0, 80), meaning: text.slice(cut.index + cut[0].length).trim().slice(0, 500) };
}
