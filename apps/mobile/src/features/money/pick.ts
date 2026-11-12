import * as ImagePicker from 'expo-image-picker';

import { addToLibrary, type Audience, linkThings, type ReadRequest } from '@/api/generated/homeport';
import { type LocalPhoto, uploadPhoto } from '@/api/upload';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';

/** Opens the phone's photo library for one picture of a paper: a letter, a receipt. Null when the person cancels. */
export async function pickPaper(): Promise<LocalPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
}

type Letter = { photo: LocalPhoto; billId: string; circleId: string; title: string; text?: string; audience?: Audience };

/**
 * Keeps the picture of a letter with its bill: the picture goes up, becomes a document in the circle's
 * Library, and is linked to the bill, which then shows it as its invoice. `clientId` makes a second try
 * find the document the first one made.
 */
export async function keepLetter({ photo, billId, circleId, title, text, audience }: Letter, clientId: string = newClientId()): Promise<void> {
  const mediaId = await uploadPhoto(photo);
  const added = await addToLibrary({ circleId, items: [{ clientId, mediaId, kind: 'document', title, text: text || undefined, audience }] });
  const documentId = added.items[0]?.item?.id;
  if (documentId) await linkThings(billId, documentId);
}

/**
 * What the bill reader is sent: the lines of the paper, top to bottom, without the empty ones.
 *
 * The API's description has two requests called `ReadRequest`: Jot's (one `text`) and the bill reader's (a
 * list of `lines`). Only Jot's made it into the generated client, so this sends both: the reader takes the
 * lines and ignores the text. When the description tells the two apart, `text` can go.
 */
export function readRequest(typed: string): ReadRequest & { lines: string[] } {
  const lines = typed
    .split('\n')
    .map((line) => line.trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, 400);
  return { text: lines.join('\n'), lines, day: today() };
}
