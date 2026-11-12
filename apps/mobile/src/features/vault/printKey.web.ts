export type Printed = 'printed' | 'blocked' | 'not-here';

/** What the printed page says, from the catalog, and the key in its groups. */
export type Page = { title: string; body: string; made: string; key: string };

const escape = (text: string) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/**
 * "Save as PDF" in a browser: a page of its own with nothing on it but the key and two sentences, handed to
 * the browser's print dialog, which saves as a PDF or prints. The page lives in a hidden frame for as long as
 * the dialog is open and is removed afterwards: the key is written nowhere else, and nothing is sent anywhere.
 */
export async function printVaultKey(page: Page): Promise<Printed> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(page.title)}</title><style>
    body { font: 16px/1.5 system-ui, sans-serif; color: #000; margin: 48px; }
    h1 { font-size: 24px; margin: 0 0 12px; }
    .key { font: 500 26px/1.8 ui-monospace, Menlo, Consolas, monospace; letter-spacing: .06em; margin: 28px 0; padding: 20px 24px; border: 2px solid #000; border-radius: 14px; display: inline-block; }
    small { color: #444; }
  </style></head><body><h1>${escape(page.title)}</h1><p>${escape(page.body)}</p><div class="key">${escape(page.key)}</div><p><small>${escape(page.made)}</small></p></body></html>`;
  const loaded = new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), { once: true }));
  document.body.appendChild(frame);
  await loaded;
  const inside = frame.contentWindow;
  if (!inside) {
    frame.remove();
    return 'blocked';
  }
  try {
    const done = () => frame.remove();
    inside.addEventListener('afterprint', done, { once: true });
    // Should the browser never say it has finished, the frame and the key in it still go.
    setTimeout(done, 5 * 60_000);
    inside.focus();
    inside.print();
    return 'printed';
  } catch {
    frame.remove();
    return 'blocked';
  }
}
