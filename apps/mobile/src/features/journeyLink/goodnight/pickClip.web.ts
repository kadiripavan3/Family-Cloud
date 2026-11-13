/** A video chosen on this device, not sent yet. */
export type Clip = { uri: string; name: string; contentType: string; durationSeconds?: number };

/** How long a video is, in whole seconds, as the browser reads it from the file. Undefined when it can't. */
function lengthOf(uri: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const giveUp = setTimeout(() => resolve(undefined), 5000);
    const finish = (seconds: number | undefined) => {
      clearTimeout(giveUp);
      resolve(seconds);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) && video.duration > 0 ? Math.max(1, Math.round(video.duration)) : undefined);
    video.onerror = () => finish(undefined);
    video.src = uri;
  });
}

/** One video file from this computer: in a browser the file chooser stands in for the phone's library. Null when nothing was chosen. */
export function chooseClip(): Promise<Clip | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      const uri = URL.createObjectURL(file);
      void lengthOf(uri).then((durationSeconds) => resolve({ uri, name: file.name, contentType: file.type || 'video/mp4', durationSeconds }));
    };
    input.addEventListener('change', done);
    input.addEventListener('cancel', done);
    input.click();
  });
}

/** A browser has no camera the app records with: recording is a phone's work. */
export function recordClip(): Promise<Clip | null | 'unavailable'> {
  return Promise.resolve('unavailable');
}
