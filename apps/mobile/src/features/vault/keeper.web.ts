import { unwrapWith, type Wrapped, wrapWith } from './crypto/vaultKey';

/**
 * Where the private key is kept between unlocks in the browser preview. A browser has no secure storage and
 * no Face ID, so there is one way only: wrapped with a key made from a passcode the person chooses (scrypt,
 * then sealed for "this-device"), in the browser's own storage.
 *
 * That is for trying things out, not for real secrets, and the screens say so: whoever can read this
 * browser's storage can try passcodes for as long as they like, and a page in a browser can be read by any
 * script that gets into it. The phone's twin is `keeper.ts`.
 */
export type KeptHow = 'device' | 'passcode';

const entry = (account: string) => `homeport.vault.passcode.${account}`;

/** A browser can't ask for Face ID. */
export function canAskThePhone(): boolean {
  return false;
}

function read(account: string): Wrapped | null {
  try {
    const kept = globalThis.localStorage?.getItem(entry(account));
    return kept ? (JSON.parse(kept) as Wrapped) : null;
  } catch {
    return null;
  }
}

export async function keptHow(account: string): Promise<KeptHow | null> {
  return read(account) ? 'passcode' : null;
}

export async function keepBehindDevice(): Promise<void> {
  throw new Error('a browser has no Face ID');
}

export async function takeFromDevice(): Promise<Uint8Array> {
  throw new Error('a browser has no Face ID');
}

export async function keepBehindPasscode(account: string, privateKey: Uint8Array, passcode: string, onProgress?: (done: number) => void): Promise<void> {
  const wrapped = await wrapWith(passcode, privateKey, 'this-device', onProgress);
  globalThis.localStorage?.setItem(entry(account), JSON.stringify(wrapped));
}

export async function takeWithPasscode(account: string, passcode: string, onProgress?: (done: number) => void): Promise<Uint8Array> {
  const kept = read(account);
  if (!kept) throw new Error('this browser no longer holds the key');
  return unwrapWith(passcode, kept, 'this-device', onProgress);
}

export async function forgetKept(account: string): Promise<void> {
  try {
    globalThis.localStorage?.removeItem(entry(account));
  } catch {
    // Nothing useful to do.
  }
  await forgetRecovery();
}

// ---------- the temporary key of a recovery ----------

export type KeptRecovery = { id: string; privateKey: Uint8Array };

/**
 * In the browser the temporary private key of a recovery is held in memory only: there is nowhere safe to
 * write it. Closing or reloading the page forgets it, and the recovery has to be cancelled and started again.
 * The screen says so.
 */
let recovery: (KeptRecovery & { account: string }) | null = null;

/** Keeps a copy of its own: whoever hands the key in overwrites theirs. */
export async function keepRecovery(account: string, kept: KeptRecovery): Promise<void> {
  recovery?.privateKey.fill(0);
  recovery = { id: kept.id, privateKey: kept.privateKey.slice(), account };
}

/** Hands out a copy, as the phone's storage does: whoever takes it overwrites it when they are done. */
export async function takeRecovery(account: string): Promise<KeptRecovery | null> {
  return recovery && recovery.account === account ? { id: recovery.id, privateKey: recovery.privateKey.slice() } : null;
}

export async function forgetRecovery(): Promise<void> {
  recovery?.privateKey.fill(0);
  recovery = null;
}
