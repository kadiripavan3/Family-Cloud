/** A file kept in the Library, to save a copy of: where it is, and what it is called. */
export type Saved = { url: string; name?: string | null };

/** What a file is called when nobody said: the end of its address. */
function nameOf(file: Saved): string {
  return file.name?.trim() || decodeURIComponent(file.url.split('?')[0]!.split('/').pop() ?? '') || 'file';
}

/**
 * Saves copies of files to this computer's downloads, one after the other. A file the browser may not
 * fetch is opened in a new tab instead, to be saved from there. Says what happened: "saved", "opened", or
 * "failed".
 */
export async function saveFiles(files: readonly Saved[]): Promise<'saved' | 'opened' | 'failed'> {
  if (files.length === 0) return 'failed';
  try {
    for (const file of files) {
      const answer = await fetch(file.url);
      if (!answer.ok) throw new Error('The file was not served');
      const held = URL.createObjectURL(await answer.blob());
      const link = document.createElement('a');
      link.href = held;
      link.download = nameOf(file);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(held), 30_000);
    }
    return 'saved';
  } catch {
    return (await openFile(files[0]!.url)) ? 'opened' : 'failed';
  }
}

/** Opens a file in a new tab: the browser plays a video and shows a PDF by itself. */
export async function openFile(url: string): Promise<boolean> {
  try {
    return globalThis.open?.(url, '_blank', 'noopener') !== undefined;
  } catch {
    return false;
  }
}
