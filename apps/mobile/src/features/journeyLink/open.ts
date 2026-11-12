import { useCallback } from 'react';
import { Linking, Platform } from 'react-native';

import { words } from '@/words';

/** What came of trying to open the other app: it opened, this is a browser (no app to hop to), or it isn't on this phone. */
export type Opened = 'opened' | 'browser' | 'missing';

/**
 * Opens a link into the Journey app (`journey://journey/<id>`, `journey://profile/<username>`), as the API
 * hands them out. Only a phone that has both apps can: a browser has no app to hop to, and a phone
 * without Journey refuses the link. It says which, so the screen can say so too.
 */
export async function openInJourney(url: string | null | undefined): Promise<Opened> {
  if (Platform.OS === 'web') return 'browser';
  if (!url) return 'missing';
  try {
    await Linking.openURL(url);
    return 'opened';
  } catch {
    return 'missing';
  }
}

/**
 * "Open in Journey" for a screen: `const openJourney = useOpenJourney(say)`, then `openJourney(journey.openUrl)`.
 * When the app can't be opened, `say` gets the sentence that says why.
 */
export function useOpenJourney(say: (text: string) => void): (url: string | null | undefined) => void {
  return useCallback(
    (url) => {
      void openInJourney(url).then((how) => {
        if (how !== 'opened') say(how === 'browser' ? words.together.open.browser : words.together.open.missing);
      });
    },
    [say],
  );
}
