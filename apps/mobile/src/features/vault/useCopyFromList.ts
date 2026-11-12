import type { VaultItemRowResponse } from '@/api/generated/homeport';
import { words } from '@/words';

import { openItem } from './actions';
import { mainSecret } from './inside';
import { useCopy } from './useCopy';
import { useSecretAction } from './useSecretAction';

/**
 * The copy at the end of a row in a list: the item is opened, its main secret goes to the clipboard, and
 * what was opened is let go of again, without the item's page ever being shown. For an item that can't be
 * opened (a sample, one that waits for its key, one that is used up) it says why instead.
 */
export function useCopyFromList() {
  const { copy, say, said } = useCopy();
  const opening = useSecretAction();
  const { run } = opening;
  const copyFrom = (item: VaultItemRowResponse) => {
    const cant = words.vault.home.cantCopy;
    if (item.sample) return say(cant.sample);
    if (item.myState !== 'ready') return say(cant[item.myState]);
    void run(async () => {
      const opened = await openItem(item);
      const secret = mainSecret(opened.inside);
      opened.itemKey.fill(0);
      await copy(secret);
    });
  };
  return { copyFrom, said, error: opening.error };
}
