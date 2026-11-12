/**
 * A code or a password that Jot held back, on its way to the Vault. It is handed over in memory and never
 * in an address: an address ends up in the phone's history and in logs.
 *
 * Jot calls `handToVault(...)` and opens `/new/password`. The Vault's screen calls `takeHeldCode()` when it
 * opens, starts with `words` in its box, and calls `kept()` once the item is saved: that undoes the jot, so
 * the API forgets the words it was keeping in the clear. Until then the jot stays held back, and "What was
 * filed" still offers both choices.
 */
export type HeldCode = {
  /** The words that looked like a code: "Gate code 4471". */
  words: string;
  circleId: string;
  /** Call after the Vault has saved it. */
  kept: () => Promise<void>;
};

let held: HeldCode | null = null;

export function handToVault(code: HeldCode): void {
  held = code;
}

/** What Jot handed over, once. Null when the screen was opened any other way. */
export function takeHeldCode(): HeldCode | null {
  const code = held;
  held = null;
  return code;
}
