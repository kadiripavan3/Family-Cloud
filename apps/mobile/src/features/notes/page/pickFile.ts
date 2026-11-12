/** A file the person chose, to send up: where it is on the phone, what it is called and what kind of file it is. */
export type PickedFile = { uri: string; name: string; contentType: string; bytes: number | null };

/**
 * Opens the phone's own way to choose a file. On a phone that takes a file picker the app doesn't carry
 * yet (it arrives with the Library, which needs the same one): until then this says so, by answering
 * "unavailable", and the screen tells the person. The browser's twin (`pickFile.web.ts`) opens the browser's
 * own chooser. Null when the person cancels.
 */
export async function pickFile(): Promise<PickedFile | null | 'unavailable'> {
  return 'unavailable';
}
