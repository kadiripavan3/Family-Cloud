import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { coordinate, pointFrom, takenAtFrom } from './exif';
import { PHOTO_TYPES, type Picked } from './picked';

/** A photo the phone keeps in a format the Library doesn't (an iPhone's HEIC, mostly), made into a JPEG beside it. */
async function asJpeg(uri: string): Promise<string> {
  const rendered = await ImageManipulator.manipulate(uri).renderAsync();
  return (await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 })).uri;
}

async function fromAsset(asset: ImagePicker.ImagePickerAsset): Promise<Picked> {
  const name = asset.fileName ?? asset.uri.split('/').pop() ?? '';
  if (asset.type === 'video') {
    // The phone gives a video's length in milliseconds.
    const seconds = asset.duration == null ? NaN : asset.duration / 1000;
    return { uri: asset.uri, name, contentType: asset.mimeType ?? 'video/mp4', kind: 'video', bytes: asset.fileSize ?? null, durationSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.round(seconds)) : undefined };
  }
  const exif = asset.exif ?? {};
  const point = pointFrom(coordinate(exif.GPSLatitude, exif.GPSLatitudeRef, 'S'), coordinate(exif.GPSLongitude, exif.GPSLongitudeRef, 'W'));
  const taken = { takenAt: takenAtFrom(exif.DateTimeOriginal ?? exif.DateTimeDigitized ?? exif.DateTime, exif.OffsetTimeOriginal), ...point };
  const type = asset.mimeType ?? 'image/jpeg';
  if (PHOTO_TYPES.includes(type)) return { uri: asset.uri, name, contentType: type, kind: 'photo', bytes: asset.fileSize ?? null, ...taken };
  return { uri: await asJpeg(asset.uri), name: name.replace(/\.[A-Za-z0-9]{1,5}$/, '.jpg'), contentType: 'image/jpeg', kind: 'photo', bytes: null, ...taken };
}

/** Photos and videos to add to the Library, from the phone's own photo picker: as many as the person ticks. */
export async function pickForLibrary(): Promise<Picked[]> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 1, exif: true });
  if (result.canceled) return [];
  return Promise.all(result.assets.map(fromAsset));
}

/**
 * A document to add: a picture of it, from the phone's photos. (Scanning with the camera, reading the words
 * by itself and picking a PDF from the phone's files are a phone build's work, still to come.) Null when
 * nothing was chosen.
 */
export async function pickDocument(): Promise<Picked | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const picked = await fromAsset(asset);
  return { ...picked, takenAt: undefined, lat: undefined, lng: undefined };
}

/** The bytes of a chosen file, to take its fingerprint from. */
export async function bytesOf(picked: Picked): Promise<Uint8Array> {
  return new Uint8Array(await new File(picked.uri).arrayBuffer());
}

/** A still from a video. A phone needs a part the app doesn't have yet to make one, so a video goes up without. */
export async function stillOf(_picked: Picked): Promise<string | null> {
  return null;
}
