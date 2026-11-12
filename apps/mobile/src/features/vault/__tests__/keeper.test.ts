import * as SecureStore from 'expo-secure-store';

import { DoesNotOpen } from '../crypto/seal';
import * as phone from '../keeper';

/** The browser preview's twin of the same file, which a browser build picks by itself. */
const browser: typeof import('../keeper.web') = jest.requireActual('../keeper.web');

jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);

/** The phone's secure storage, as a plain map, remembering the options each entry was written with. */
const mockStored = new Map<string, { value: string; options: Record<string, unknown> }>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'this-device-only',
  canUseBiometricAuthentication: jest.fn(() => true),
  setItemAsync: jest.fn(async (key: string, value: string, options: Record<string, unknown>) => void mockStored.set(key, { value, options })),
  getItemAsync: jest.fn(async (key: string) => mockStored.get(key)?.value ?? null),
  deleteItemAsync: jest.fn(async (key: string) => void mockStored.delete(key)),
}));

const aKey = () => Uint8Array.from({ length: 32 }, (_, i) => 200 - i);
const b64 = Buffer.from(aKey()).toString('base64url');
const hex = Buffer.from(aKey()).toString('hex');

describe('the key between unlocks, on a phone', () => {
  beforeEach(() => mockStored.clear());

  it('keeps nothing for an account until asked', async () => {
    expect(await phone.keptHow('nora')).toBeNull();
    expect(phone.canAskThePhone()).toBe(true);
  });

  it('behind Face ID: mockStored with the option that requires authentication, and handed back only through it', async () => {
    await phone.keepBehindDevice('nora', aKey());
    expect(await phone.keptHow('nora')).toBe('device');
    const entry = mockStored.get('homeport.vault.device.nora')!;
    expect(entry.options.requireAuthentication).toBe(true);
    expect(await phone.takeFromDevice('nora', 'Unlock your Vault')).toEqual(aKey());
    expect(SecureStore.getItemAsync).toHaveBeenLastCalledWith('homeport.vault.device.nora', expect.objectContaining({ requireAuthentication: true, authenticationPrompt: 'Unlock your Vault' }));
    // The key is nowhere else on the phone.
    expect([...mockStored.entries()].filter(([, kept]) => kept.value.includes(b64)).map(([key]) => key)).toEqual(['homeport.vault.device.nora']);
  });

  it('says so when the phone threw the key away (the faces or fingerprints on it changed)', async () => {
    await phone.keepBehindDevice('nora', aKey());
    mockStored.delete('homeport.vault.device.nora');
    await expect(phone.takeFromDevice('nora', 'Unlock')).rejects.toThrow('no longer holds the key');
  });

  it('behind a passcode: only the wrapped key is mockStored, and only the passcode opens it', async () => {
    await phone.keepBehindPasscode('nora', aKey(), 'four words I chose');
    expect(await phone.keptHow('nora')).toBe('passcode');
    const everything = JSON.stringify([...mockStored.entries()]);
    expect(everything).not.toContain(b64);
    expect(everything).not.toContain(hex);
    expect(everything).not.toContain('four words I chose');
    expect(await phone.takeWithPasscode('nora', 'four words I chose')).toEqual(aKey());
    await expect(phone.takeWithPasscode('nora', 'four words I guessed')).rejects.toThrow(DoesNotOpen);
  });

  it('one way at a time: choosing the other removes the first', async () => {
    await phone.keepBehindPasscode('nora', aKey(), 'four words I chose');
    await phone.keepBehindDevice('nora', aKey());
    expect(mockStored.has('homeport.vault.passcode.nora')).toBe(false);
    await phone.keepBehindPasscode('nora', aKey(), 'four words I chose');
    expect(mockStored.has('homeport.vault.device.nora')).toBe(false);
  });

  it("keeps each account's key apart, and forgets everything of one account when asked", async () => {
    await phone.keepBehindDevice('nora', aKey());
    await phone.keepRecovery('nora', { id: 'recovery-1', privateKey: aKey() });
    expect(await phone.keptHow('alex')).toBeNull();
    expect(await phone.takeRecovery('alex')).toBeNull();
    await phone.forgetKept('nora');
    expect(mockStored.size).toBe(0);
    expect(await phone.keptHow('nora')).toBeNull();
  });

  it('keeps the temporary key of a recovery until it ends', async () => {
    expect(await phone.takeRecovery('nora')).toBeNull();
    await phone.keepRecovery('nora', { id: 'recovery-1', privateKey: aKey() });
    expect(await phone.takeRecovery('nora')).toEqual({ id: 'recovery-1', privateKey: aKey() });
    await phone.forgetRecovery('nora');
    expect(await phone.takeRecovery('nora')).toBeNull();
  });
});

describe('the key between unlocks, in the browser preview', () => {
  const storage = new Map<string, string>();
  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => void storage.set(key, value), removeItem: (key: string) => void storage.delete(key) },
    });
  });
  afterAll(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  beforeEach(() => storage.clear());

  it('knows the passcode way only', async () => {
    expect(browser.canAskThePhone()).toBe(false);
    await expect(browser.keepBehindDevice()).rejects.toThrow('no Face ID');
    await expect(browser.takeFromDevice()).rejects.toThrow('no Face ID');
    expect(await browser.keptHow('nora')).toBeNull();
  });

  it("writes only the wrapped key to the browser's storage, and only the passcode opens it", async () => {
    await browser.keepBehindPasscode('nora', aKey(), 'four words I chose');
    expect(await browser.keptHow('nora')).toBe('passcode');
    const everything = JSON.stringify([...storage.entries()]);
    expect(everything).not.toContain(b64);
    expect(everything).not.toContain(hex);
    expect(everything).not.toContain('four words I chose');
    expect(Object.keys(JSON.parse(storage.get('homeport.vault.passcode.nora')!)).sort()).toEqual(['kdf', 'salt', 'wrapped']);
    expect(await browser.takeWithPasscode('nora', 'four words I chose')).toEqual(aKey());
    await expect(browser.takeWithPasscode('nora', 'something else')).rejects.toThrow(DoesNotOpen);
    await browser.forgetKept('nora');
    expect(storage.size).toBe(0);
    await expect(browser.takeWithPasscode('nora', 'four words I chose')).rejects.toThrow('no longer holds the key');
  });

  it('holds the temporary key of a recovery in memory only: nothing of it is written', async () => {
    await browser.keepRecovery('nora', { id: 'recovery-1', privateKey: aKey() });
    expect(storage.size).toBe(0);
    expect(await browser.takeRecovery('nora')).toEqual({ id: 'recovery-1', privateKey: aKey() });
    expect(await browser.takeRecovery('alex')).toBeNull();
    await browser.forgetRecovery();
    expect(await browser.takeRecovery('nora')).toBeNull();
  });

  it('keeps a copy of its own and hands out copies, so whoever holds one can overwrite theirs', async () => {
    const handedIn = aKey();
    await browser.keepRecovery('nora', { id: 'recovery-1', privateKey: handedIn });
    handedIn.fill(0);
    const taken = await browser.takeRecovery('nora');
    expect(taken?.privateKey).toEqual(aKey());
    taken?.privateKey.fill(0);
    expect((await browser.takeRecovery('nora'))?.privateKey).toEqual(aKey());
    await browser.forgetRecovery();
  });
});
