/**
 * "Save as PDF", on a phone. Making a PDF needs a part of the phone build that isn't in the app yet, so this
 * says it couldn't, and the screen says why. The browser's twin (`printKey.web.ts`) opens the print dialog,
 * which saves as a PDF.
 */
export type Printed = 'printed' | 'blocked' | 'not-here';

/** What the printed page says, from the catalog, and the key in its groups. */
export type Page = { title: string; body: string; made: string; key: string };

export async function printVaultKey(_page: Page): Promise<Printed> {
  return 'not-here';
}
