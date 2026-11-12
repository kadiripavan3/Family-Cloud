/** A text file's name and words, as the person picked it. */
export type PickedText = { name: string; text: string };

/**
 * Whether a text file can be picked here. On a phone the share sheet hands a letter over (see
 * native/jot/README.md), so there is nothing to pick; in the browser, picking a file stands in for it
 * (`pickText.web.ts`).
 */
export const canPickText = false;

export async function pickText(): Promise<PickedText | null> {
  return null;
}
