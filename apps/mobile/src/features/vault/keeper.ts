import * as SecureStore from 'expo-secure-store';

import { fromBase64Url, toBase64Url } from './crypto/bytes';
import { unwrapWith, type Wrapped, wrapWith } from './crypto/vaultKey';

/**
 * Where the private key is kept between unlocks, on a phone. Never in the clear outside the phone's secure
 * storage, and never anywhere the app's own files or the API can read it. Two ways:
 *
 *  - `device`: in the phone's secure storage (Keychain / Keystore) with the option that requires
 *    authentication, so the phone asks for Face ID or a fingerprint before it hands the key back. When the
 *    faces or fingerprints on the phone change, the phone throws the key away, and the person types their
 *    Vault key again.
 *  - `passcode`: wrapped with a key made from a passcode the person chose (scrypt, then sealed for
 *    "this-device"), for a phone without Face ID or a fingerprint set up, and for Expo Go on an iPhone, which
 *    can't ask for Face ID. The wrapped key is in the secure storage too.
 *
 * The browser preview has its own twin, `keeper.web.ts`, which only knows the passcode way.
 */
export type KeptHow = 'device' | 'passcode';

/** Authenticated entries get a keychain service of their own, as the secure storage asks. */
const BEHIND_DEVICE = { requireAuthentication: true, keychainService: 'homeport.vault.device' } as const;
const PLAIN = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY } as const;

const deviceEntry = (account: string) => `homeport.vault.device.${account}`;
const passcodeEntry = (account: string) => `homeport.vault.passcode.${account}`;
const howEntry = (account: string) => `homeport.vault.how.${account}`;
const recoveryEntry = (account: string) => `homeport.vault.recovery.${account}`;

/** True when this phone can ask for Face ID or a fingerprint before it gives a stored value back. */
export function canAskThePhone(): boolean {
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

/** How this phone keeps the key for this account, or null when it keeps none (a new phone). */
export async function keptHow(account: string): Promise<KeptHow | null> {
  try {
    const how = await SecureStore.getItemAsync(howEntry(account), PLAIN);
    return how === 'device' || how === 'passcode' ? how : null;
  } catch {
    return null;
  }
}

/** Keeps the key behind Face ID or a fingerprint. */
export async function keepBehindDevice(account: string, privateKey: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync(deviceEntry(account), toBase64Url(privateKey), BEHIND_DEVICE);
  await SecureStore.deleteItemAsync(passcodeEntry(account), PLAIN).catch(() => undefined);
  await SecureStore.setItemAsync(howEntry(account), 'device', PLAIN);
}

/**
 * Asks the phone for the key: it shows Face ID (or the fingerprint sheet) with `prompt`. Throws when the
 * person cancels, and when the phone has thrown the key away.
 */
export async function takeFromDevice(account: string, prompt: string): Promise<Uint8Array> {
  const kept = await SecureStore.getItemAsync(deviceEntry(account), { ...BEHIND_DEVICE, authenticationPrompt: prompt });
  if (!kept) throw new Error('this phone no longer holds the key');
  return fromBase64Url(kept);
}

/** Keeps the key wrapped with a key made from a passcode. */
export async function keepBehindPasscode(account: string, privateKey: Uint8Array, passcode: string, onProgress?: (done: number) => void): Promise<void> {
  const wrapped = await wrapWith(passcode, privateKey, 'this-device', onProgress);
  await SecureStore.setItemAsync(passcodeEntry(account), JSON.stringify(wrapped), PLAIN);
  await SecureStore.deleteItemAsync(deviceEntry(account), BEHIND_DEVICE).catch(() => undefined);
  await SecureStore.setItemAsync(howEntry(account), 'passcode', PLAIN);
}

/** Unwraps the key with the passcode. Throws `DoesNotOpen` when the passcode is wrong. */
export async function takeWithPasscode(account: string, passcode: string, onProgress?: (done: number) => void): Promise<Uint8Array> {
  const kept = await SecureStore.getItemAsync(passcodeEntry(account), PLAIN);
  if (!kept) throw new Error('this phone no longer holds the key');
  return unwrapWith(passcode, JSON.parse(kept) as Wrapped, 'this-device', onProgress);
}

/** Removes the key from this phone: a Vault that was never made after all, or one that is started over. */
export async function forgetKept(account: string): Promise<void> {
  await SecureStore.deleteItemAsync(deviceEntry(account), BEHIND_DEVICE).catch(() => undefined);
  await SecureStore.deleteItemAsync(passcodeEntry(account), PLAIN).catch(() => undefined);
  await SecureStore.deleteItemAsync(howEntry(account), PLAIN).catch(() => undefined);
  await forgetRecovery(account);
}

// ---------- the temporary key of a recovery ----------

/** A recovery this phone started: its id and the private half of the temporary key pair made for it. */
export type KeptRecovery = { id: string; privateKey: Uint8Array };

/**
 * A recovery can take days: the helpers answer when they can. Until it ends, the temporary private key
 * stays in the phone's secure storage (there is no Vault key and no Face ID entry to put it behind yet).
 */
export async function keepRecovery(account: string, recovery: KeptRecovery): Promise<void> {
  await SecureStore.setItemAsync(recoveryEntry(account), JSON.stringify({ id: recovery.id, privateKey: toBase64Url(recovery.privateKey) }), PLAIN);
}

export async function takeRecovery(account: string): Promise<KeptRecovery | null> {
  try {
    const kept = await SecureStore.getItemAsync(recoveryEntry(account), PLAIN);
    if (!kept) return null;
    const { id, privateKey } = JSON.parse(kept) as { id: string; privateKey: string };
    return { id, privateKey: fromBase64Url(privateKey) };
  } catch {
    return null;
  }
}

export async function forgetRecovery(account: string): Promise<void> {
  await SecureStore.deleteItemAsync(recoveryEntry(account), PLAIN).catch(() => undefined);
}

