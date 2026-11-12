import { readTaken, withOffset } from './exif';
import { DOCUMENT_TYPES, kindOfType, type Picked } from './picked';

/** Opens the browser's own file chooser and gives back what was chosen (nothing when it was closed). */
function chooseFiles(accept: string, many: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = many;
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = () => {
      resolve(Array.from(input.files ?? []));
      input.remove();
    };
    input.addEventListener('change', done);
    input.addEventListener('cancel', done);
    input.click();
  });
}

/** How long a video is, in whole seconds, as the browser reads it from the file. Undefined when it can't. */
function videoLength(uri: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) && video.duration > 0 ? Math.max(1, Math.round(video.duration)) : undefined);
    video.onerror = () => resolve(undefined);
    video.src = uri;
  });
}

async function asPicked(file: File, kind: Picked['kind']): Promise<Picked> {
  const uri = URL.createObjectURL(file);
  const picked: Picked = { uri, name: file.name, contentType: file.type || 'application/octet-stream', kind, bytes: file.size };
  if (kind === 'video') return { ...picked, durationSeconds: await videoLength(uri), takenAt: withOffset(new Date(file.lastModified)) };
  if (kind !== 'photo') return picked;
  // A JPEG says when and where it was taken. One that doesn't is as old as the file is.
  const taken = file.type === 'image/jpeg' ? readTaken(new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer())) : {};
  return { ...picked, ...taken, takenAt: taken.takenAt ?? withOffset(new Date(file.lastModified)) };
}

/**
 * Photos and videos to add to the Library. In a browser the file chooser stands in for the camera roll: any
 * number of pictures and videos from this computer.
 */
export async function pickForLibrary(): Promise<Picked[]> {
  const files = await chooseFiles('image/jpeg,image/png,video/*', true);
  return Promise.all(files.map((file) => asPicked(file, kindOfType(file.type) ?? 'file')));
}

/** A document to add: one picture or one PDF. In a browser a chosen file stands in for scanning with the camera. Null when nothing was chosen. */
export async function pickDocument(): Promise<Picked | null> {
  const [file] = await chooseFiles(DOCUMENT_TYPES.join(','), false);
  if (!file) return null;
  const picked = await asPicked(file, file.type.startsWith('image/') ? 'photo' : 'file');
  // A document isn't a moment: when its picture was taken is not sent.
  return { ...picked, takenAt: undefined, lat: undefined, lng: undefined };
}

/** The bytes of a chosen file, to take its fingerprint from. */
export async function bytesOf(picked: Picked): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(picked.uri)).arrayBuffer());
}

/**
 * A still from a video, as a JPEG the browser holds: the frame a second in, or the first one of a shorter
 * clip. Null when the browser can't play the file.
 */
export function stillOf(picked: Picked): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const giveUp = setTimeout(() => resolve(null), 8000);
    const finish = (still: string | null) => {
      clearTimeout(giveUp);
      resolve(still);
    };
    video.muted = true;
    video.preload = 'auto';
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, (video.duration || 0) / 2);
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        canvas.toBlob((blob) => finish(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.85);
      } catch {
        finish(null);
      }
    };
    video.onerror = () => finish(null);
    video.src = picked.uri;
  });
}
