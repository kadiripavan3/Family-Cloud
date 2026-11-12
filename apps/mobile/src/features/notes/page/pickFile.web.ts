import type { PickedFile } from './pickFile';

/**
 * Opens the browser's own file chooser (the web preview's stand-in for the phone's). Null when the person
 * cancels. The file stays in the browser's memory until it has gone up.
 */
export function pickFile(): Promise<PickedFile | null | 'unavailable'> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    const done = (picked: PickedFile | null) => {
      input.remove();
      resolve(picked);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      done(file ? { uri: URL.createObjectURL(file), name: file.name, contentType: file.type || 'application/octet-stream', bytes: file.size } : null);
    });
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}
