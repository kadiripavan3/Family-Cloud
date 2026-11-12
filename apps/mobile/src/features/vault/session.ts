import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { beforeSignOut } from '@/auth/beforeSignOut';

import { toBase64Url, utf8, wipe } from './crypto/bytes';
import { randomBytes } from './crypto/random';

/**
 * The unlocked Vault: the one place the private key lives after unlocking, and only in memory.
 *
 * It is dropped (overwritten, then let go) when the Vault locks: after two minutes without use, when the app
 * goes to the background, when the person locks it by hand, and when they sign out. Nothing in here is ever
 * written anywhere: not to the query cache, not to what is kept on the phone (`api/kept`), not to a log.
 * Between unlocks the key is kept wrapped by `keeper`.
 *
 * There is no React in here. Screens read whether it is unlocked with `useVaultLock()`.
 */

/** How long the Vault stays open without being used. */
export const LOCK_AFTER_MS = 2 * 60 * 1000;

/** Asked for the key while the Vault is locked. Screens catch this and show the locked page. */
export class VaultLocked extends Error {
  constructor() {
    super('VaultLocked');
    this.name = 'VaultLocked';
  }
}

export type Lock = { unlocked: boolean; /** The moment it locks itself, as `Date.now()` counts. Null while locked. */ locksAt: number | null };

const LOCKED: Lock = { unlocked: false, locksAt: null };

/** Two minutes, unless the person chose otherwise. */
let lockAfterMs = LOCK_AFTER_MS;

let privateKey: Uint8Array | null = null;
let lock: Lock = LOCKED;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/** What is remembered only while unlocked, and forgotten with the key. */
let freshVaultKey: string | null = null;
let marksKey: Uint8Array | null = null;
const marks = new Map<string, { title: string; mark: string }>();

function tell() {
  for (const heard of listeners) heard();
}

function startTimer() {
  if (timer) clearTimeout(timer);
  const locksAt = Date.now() + lockAfterMs;
  timer = setTimeout(lockVault, lockAfterMs);
  lock = { unlocked: true, locksAt };
}

let watching = false;
/** Set up once, at the first unlock: the app going to the background locks, and so does signing out. */
function watch() {
  if (watching) return;
  watching = true;
  AppState.addEventListener('change', (state) => {
    // "Inactive" is the phone showing something of its own on top for a moment (Face ID, the share sheet):
    // the app is still in front. "Background" is the app put away.
    if (state === 'background') lockVault();
  });
  beforeSignOut(lockVault);
}

/** Takes the private key in and starts the two minutes. The session owns these bytes from here on: it overwrites them when it locks. */
export function unlockVault(key: Uint8Array): void {
  if (key.length !== 32) throw new Error('a private key must be 32 bytes');
  watch();
  if (privateKey && privateKey !== key) wipe(privateKey);
  privateKey = key;
  marksKey ??= randomBytes(32);
  startTimer();
  tell();
}

/** Locks: the key is overwritten and let go, and with it everything remembered since unlocking. */
export function lockVault(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  wipe(privateKey, marksKey);
  privateKey = null;
  marksKey = null;
  marks.clear();
  freshVaultKey = null;
  if (lock === LOCKED) return;
  lock = LOCKED;
  tell();
}

/** The Vault was used: the two minutes start again. Does nothing while locked. */
export function vaultUsed(): void {
  if (!privateKey) return;
  startTimer();
  tell();
}

/** The private key, for one operation. Throws `VaultLocked` when there is none. Never keep what this returns. */
export function vaultPrivateKey(): Uint8Array {
  if (!privateKey) throw new VaultLocked();
  return privateKey;
}

export function isVaultUnlocked(): boolean {
  return privateKey !== null;
}

const subscribe = (heard: () => void) => {
  listeners.add(heard);
  return () => {
    listeners.delete(heard);
  };
};
const current = () => lock;

/** Whether the Vault is unlocked right now, and when it locks itself. */
export function useVaultLock(): Lock {
  return useSyncExternalStore(subscribe, current, () => LOCKED);
}

// ---------- a Vault key that was just made, to be shown once ----------

/**
 * A Vault key this phone has just made (setting up, or replacing it). It is held only so the "Your Vault key"
 * screen can show it once; it is forgotten when the person says they saved it, and when the Vault locks.
 */
export function holdFreshVaultKey(vaultKey: string | null): void {
  freshVaultKey = privateKey ? vaultKey : null;
  tell();
}

export function freshVaultKeyNow(): string | null {
  return freshVaultKey;
}

/** The Vault key that was just made, while it is still held. */
export function useFreshVaultKey(): string | null {
  return useSyncExternalStore(subscribe, freshVaultKeyNow, () => null);
}

// ---------- the same password twice ----------

/**
 * A mark of a password: an HMAC under a key that is made at each unlock and never leaves memory. Two items
 * with the same password get the same mark, and a mark says nothing else about the password.
 */
function markOf(password: string): string {
  if (!marksKey) throw new VaultLocked();
  return toBase64Url(hmac(sha256, marksKey, utf8(password)));
}

/** Remembers the mark of an item's password while the Vault is unlocked, so a second item with the same one is noticed. */
export function rememberPassword(itemId: string, title: string, password: string | null): void {
  if (!marksKey) return;
  if (password) marks.set(itemId, { title, mark: markOf(password) });
  else marks.delete(itemId);
}

export function forgetPassword(itemId: string): void {
  marks.delete(itemId);
}

/** The titles of the other items, opened since unlocking, that hold this same password. */
export function usedElsewhere(itemId: string | null, password: string | null): string[] {
  if (!marksKey || !password) return [];
  const mark = markOf(password);
  return [...marks.entries()].filter(([id, other]) => id !== itemId && other.mark === mark).map(([, other]) => other.title);
}

// ---------- how long it stays open ----------

/** How long the Vault stays open without use, when the person chose something other than two minutes ("Lock the Vault after" on Privacy and security). */
export function setLockAfterMinutes(minutes: number): void {
  const next = Number.isFinite(minutes) && minutes >= 1 && minutes <= 60 ? minutes * 60_000 : LOCK_AFTER_MS;
  if (next === lockAfterMs) return;
  lockAfterMs = next;
  vaultUsed();
}
