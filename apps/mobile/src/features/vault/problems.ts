import { ApiError, messageFor } from '@/api/fetcher';
import { words } from '@/words';

import { DoesNotOpen } from './crypto/seal';
import { NotReadable } from './inside';
import { VaultLocked } from './session';

/**
 * The sentence for something that went wrong with keys. `wrong` is what "it doesn't open" means where it
 * happened (a wrong Vault key, a wrong passcode). Never anything from the error itself, except the API's own
 * sentence: an error from the cryptography says nothing a person could use.
 */
export function problemOf(error: unknown, wrong: string = words.vault.item.cantOpen): string {
  if (error instanceof DoesNotOpen) return wrong;
  if (error instanceof VaultLocked) return words.vault.problems.locked;
  if (error instanceof NotReadable) return words.vault.item.notReadable;
  if (error instanceof ApiError) return messageFor(error);
  return words.vault.problems.unknown;
}
