import { digest, CryptoDigestAlgorithm } from 'expo-crypto';

/** A photo, a video or a document chosen from this device, not uploaded yet. */
export type Picked = {
  /** Where its bytes are, for as long as the app runs: a file on the phone, or a file the browser holds. */
  uri: string;
  /** What it is called on the device. */
  name: string;
  /** "image/jpeg", "video/mp4", "application/pdf". */
  contentType: string;
  /** What it goes up as. A scan that is a picture is a photo here, and is said to be a document when it is added. */
  kind: 'photo' | 'video' | 'file';
  /** How big it is, when the device says. */
  bytes: number | null;
  /** A video's length, in whole seconds. */
  durationSeconds?: number;
  /** When it was taken, with the offset of the clock it was taken by. */
  takenAt?: string;
  lat?: number;
  lng?: number;
};

/** What a photo goes up as. Anything else has to be made into one of these on the device first. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png'];
/** The videos the Library keeps. */
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
/** What a document may be: a picture of it, or a PDF. */
export const DOCUMENT_TYPES = [...PHOTO_TYPES, 'application/pdf'];

/** What a file is, by its type: a photo, a video, or neither (null). */
export function kindOfType(contentType: string): 'photo' | 'video' | null {
  if (contentType.startsWith('image/')) return 'photo';
  if (contentType.startsWith('video/')) return 'video';
  return null;
}

/** A file's fingerprint: the SHA-256 of its bytes, in hex. The same file gives the same one on every device. */
export async function fingerprint(bytes: Uint8Array): Promise<string> {
  const hashed = new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, bytes as unknown as BufferSource));
  return Array.from(hashed, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** "Mia's passport" from "Mia's passport.jpg": a name to start a document with. */
export function nameWithoutEnding(fileName: string): string {
  return fileName.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim();
}
