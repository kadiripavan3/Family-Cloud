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
export function useCopy(): { copy: (text: string | null) => Promise<boolean>; said: string | null } {
  const [said, setSaid] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = useCallback(async (text: string | null) => {
    vaultUsed();
    const copied = text ? await copySecret(text) : false;
    const says = words.vault.item;
    setSaid(!text ? says.nothingToCopy : copied ? says.copied[Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web'] : says.notCopied);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaid(null), SAID_FOR_MS);
    return copied;
  }, []);
  return { copy, said };
}
