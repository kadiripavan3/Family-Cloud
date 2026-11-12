import type { LocalSound } from './soundFile';

/** Sound in a browser: a picked sound file stands in for the microphone, and the browser plays recordings back. */
export const sound = { canAdd: true, canPlay: true };

/** How long a sound file is, in whole seconds, or null when the browser can't tell. */
function lengthOf(uri: string): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const done = (seconds: number | null) => {
      clearTimeout(timer);
      resolve(seconds);
    };
    const timer = setTimeout(() => done(null), 4000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.max(1, Math.round(audio.duration)) : null);
    audio.onerror = () => done(null);
    audio.src = uri;
  });
}

/** Opens the browser's file chooser for one sound file. Null when the person closes it without choosing. */
export function pickSound(): Promise<LocalSound | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.style.display = 'none';
    const finish = (picked: LocalSound | null) => {
      input.remove();
      resolve(picked);
    };
    input.addEventListener('cancel', () => finish(null));
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      const uri = URL.createObjectURL(file);
      void lengthOf(uri).then((seconds) => finish({ uri, contentType: file.type || 'audio/mpeg', seconds, name: file.name }));
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** Plays a recording and says when it has ended (or couldn't be played). Returns how to stop it. */
export function playSound(url: string, onEnd: () => void): () => void {
  const audio = new Audio(url);
  let over = false;
  const end = () => {
    if (over) return;
    over = true;
    onEnd();
  };
  audio.onended = end;
  audio.onerror = end;
  void audio.play().catch(end);
  return () => {
    audio.pause();
    end();
  };
}
