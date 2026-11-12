import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { words } from '@/words';

import { copySecret } from './clipboard';
import { vaultUsed } from './session';

/** How long the line about the copy stays on screen. */
const SAID_FOR_MS = 5000;

/**
 * Copying something secret from a Vault screen: `copy(text)` puts it on the clipboard (from where it is
 * cleared after a minute, where the platform allows), and `said` is the sentence to show for a few seconds:
 * that it was copied and when it is cleared, or that it wasn't.
 */
export function useCopy(): { copy: (text: string | null) => Promise<boolean>; say: (text: string) => void; said: string | null } {
  const [said, setSaid] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  /** Shows a sentence in the same place for the same few seconds: why nothing was copied. */
  const say = useCallback((text: string) => {
    setSaid(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaid(null), SAID_FOR_MS);
  }, []);
  const copy = useCallback(
    async (text: string | null) => {
      vaultUsed();
      const copied = text ? await copySecret(text) : false;
      const says = words.vault.item;
      say(!text ? says.nothingToCopy : copied ? says.copied[Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web'] : says.notCopied);
      return copied;
    },
    [say],
  );
  return { copy, say, said };
}
