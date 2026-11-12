import type { PickedText } from './pickText';

/** In the browser a text file can be picked: it stands in for what a phone's share sheet hands over. */
export const canPickText = true;

/** How much of a file is read: a letter, not a book. (The API reads 20,000 characters at most.) */
const MOST = 20_000;

/** Opens the browser's own file chooser. Null when nothing was picked; it throws when the file can't be read as text. */
export function pickText(): Promise<PickedText | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,.eml,text/plain';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(
        (text) => resolve({ name: file.name, text: text.slice(0, MOST) }),
        (error: unknown) => reject(error instanceof Error ? error : new Error('unreadable')),
      );
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
