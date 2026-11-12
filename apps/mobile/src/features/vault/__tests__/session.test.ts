import { AppState } from 'react-native';

import { runBeforeSignOut } from '@/auth/beforeSignOut';

import { forgetPassword, freshVaultKeyNow, holdFreshVaultKey, isVaultUnlocked, LOCK_AFTER_MS, lockVault, rememberPassword, unlockVault, usedElsewhere, VaultLocked, vaultPrivateKey, vaultUsed } from '../session';

jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);

const aKey = () => Uint8Array.from({ length: 32 }, (_, i) => i + 1);

describe('the unlocked Vault', () => {
  let toBackground: (state: string) => void = () => undefined;

  beforeAll(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, heard) => {
      toBackground = heard as (state: string) => void;
      return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
    });
  });
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    lockVault();
    jest.useRealTimers();
  });

  it('starts locked, and has no key to give', () => {
    expect(isVaultUnlocked()).toBe(false);
    expect(() => vaultPrivateKey()).toThrow(VaultLocked);
  });

  it('holds the key after unlocking and locks itself after two minutes without use', () => {
    unlockVault(aKey());
    expect(vaultPrivateKey()).toEqual(aKey());
    jest.advanceTimersByTime(LOCK_AFTER_MS - 1);
    expect(isVaultUnlocked()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(isVaultUnlocked()).toBe(false);
    expect(() => vaultPrivateKey()).toThrow(VaultLocked);
    expect(LOCK_AFTER_MS).toBe(120_000);
  });

  it('starts the two minutes again whenever it is used', () => {
    unlockVault(aKey());
    jest.advanceTimersByTime(100_000);
    vaultUsed();
    jest.advanceTimersByTime(100_000);
    expect(isVaultUnlocked()).toBe(true);
    jest.advanceTimersByTime(20_000);
    expect(isVaultUnlocked()).toBe(false);
    // Using a locked Vault doesn't open it.
    vaultUsed();
    expect(isVaultUnlocked()).toBe(false);
  });

  it('gives no key once its time is up, even when the timer is late (a phone that slept, a page the browser slowed down)', () => {
    const key = aKey();
    unlockVault(key);
    // The clock moves on and no timer fires.
    jest.setSystemTime(Date.now() + LOCK_AFTER_MS);
    expect(isVaultUnlocked()).toBe(false);
    // Using it now doesn't buy more time.
    vaultUsed();
    expect(() => vaultPrivateKey()).toThrow(VaultLocked);
    expect(key).toEqual(new Uint8Array(32));
  });

  it('overwrites the key when it locks: whoever still holds the bytes holds zeros', () => {
    const key = aKey();
    unlockVault(key);
    const held = vaultPrivateKey();
    lockVault();
    expect(held).toEqual(new Uint8Array(32));
    expect(key).toEqual(new Uint8Array(32));
  });

  it('locks when the app goes to the background, and not when the phone shows something of its own on top', () => {
    unlockVault(aKey());
    toBackground('inactive');
    expect(isVaultUnlocked()).toBe(true);
    toBackground('active');
    expect(isVaultUnlocked()).toBe(true);
    toBackground('background');
    expect(isVaultUnlocked()).toBe(false);
  });

  it('locks when the person signs out, however the sign-in ends', async () => {
    unlockVault(aKey());
    jest.useRealTimers();
    await runBeforeSignOut();
    expect(isVaultUnlocked()).toBe(false);
  });

  it('refuses a key of the wrong size', () => {
    expect(() => unlockVault(new Uint8Array(31))).toThrow('32 bytes');
    expect(isVaultUnlocked()).toBe(false);
  });

  it('holds a Vault key that was just made only while unlocked', () => {
    holdFreshVaultKey('KT4M9QXZPL2A77HDVB3NE8RW');
    expect(freshVaultKeyNow()).toBeNull();
    unlockVault(aKey());
    holdFreshVaultKey('KT4M9QXZPL2A77HDVB3NE8RW');
    expect(freshVaultKeyNow()).toBe('KT4M9QXZPL2A77HDVB3NE8RW');
    lockVault();
    expect(freshVaultKeyNow()).toBeNull();
  });

  it('notices the same password in two items opened since unlocking, and forgets all of it when it locks', () => {
    unlockVault(aKey());
    rememberPassword('netflix', 'Netflix', 'p0pcorn!Friday#night');
    rememberPassword('spotify', 'Spotify', 'p0pcorn!Friday#night');
    rememberPassword('bank', 'Bank', 'gr4nite-Kitchen-island');
    expect(usedElsewhere('netflix', 'p0pcorn!Friday#night')).toEqual(['Spotify']);
    expect(usedElsewhere(null, 'p0pcorn!Friday#night')).toEqual(['Netflix', 'Spotify']);
    expect(usedElsewhere('bank', 'gr4nite-Kitchen-island')).toEqual([]);
    expect(usedElsewhere('bank', null)).toEqual([]);
    forgetPassword('spotify');
    expect(usedElsewhere('netflix', 'p0pcorn!Friday#night')).toEqual([]);
    rememberPassword('netflix', 'Netflix', null);
    expect(usedElsewhere(null, 'p0pcorn!Friday#night')).toEqual([]);
    rememberPassword('netflix', 'Netflix', 'p0pcorn!Friday#night');
    lockVault();
    expect(usedElsewhere(null, 'p0pcorn!Friday#night')).toEqual([]);
    // After the next unlock nothing of the last one is left.
    unlockVault(aKey());
    expect(usedElsewhere(null, 'p0pcorn!Friday#night')).toEqual([]);
  });
});
