import { cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { useGetVault } from '@/api/generated/homeport';
import UnlockWithVaultKey from '@/app/(app)/vault/unlock';
import { wrapPrivateKey } from '@/features/vault/crypto/vaultKey';
import { isVaultUnlocked, lockVault, vaultPrivateKey } from '@/features/vault/session';
import { inApp } from '@/test/phone';
import { loaded, me } from '@/test/samples';
import { NORA_KEY, VAULT_KEY, vaultRecord } from '@/test/samples/vault';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockKeeper = { keptHow: jest.fn(async () => null), canAskThePhone: jest.fn(() => false), keepBehindPasscode: jest.fn(async () => undefined), keepBehindDevice: jest.fn(async () => undefined) };
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/features/vault/keeper', () => new Proxy({}, { get: (_, name: string) => (...given: unknown[]) => (mockKeeper as unknown as Record<string, (...given: unknown[]) => unknown>)[name]?.(...given) }));
jest.mock('@/api/generated/homeport', () => ({ useGetVault: jest.fn(), useGetMe: jest.fn(() => mockMe) }));

const mockMe = loaded(me());

describe('unlocking with the Vault key', () => {
  beforeAll(async () => {
    // Nora's record as the API holds it: her private key, wrapped for real with the key made from her Vault key.
    (jest.mocked(useGetVault) as unknown as jest.Mock).mockReturnValue(loaded(vaultRecord(await wrapPrivateKey(VAULT_KEY, NORA_KEY))));
  });
  beforeEach(() => {
    mockRouter.back.mockClear();
    mockKeeper.keepBehindPasscode.mockClear();
  });
  afterEach(async () => {
    await cleanup();
    lockVault();
  });

  it('asks for the 24 characters and says how far the typing is', async () => {
    await render(inApp(<UnlockWithVaultKey />));
    expect(screen.getByRole('header', { name: 'Your Vault key' })).toBeOnTheScreen();
    expect(screen.getByText('Six groups of four. It has no I, O, 0 or 1.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    await userEvent.setup().type(screen.getByLabelText('Vault key'), 'kt4m 9qxz');
    expect(screen.getByText('8 of 24 characters. It has no I, O, 0 or 1.')).toBeOnTheScreen();
  });

  it('opens the private key out of the record with the key as a person types it, and keeps it behind the passcode from then on', async () => {
    await render(inApp(<UnlockWithVaultKey />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Vault key'), VAULT_KEY.toLowerCase());
    await user.type(screen.getByLabelText('A passcode for this phone'), 'four words I chose');
    await user.type(screen.getByLabelText('The same passcode again'), 'four words I chose');
    await user.press(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled(), { timeout: 15000 });
    expect(isVaultUnlocked()).toBe(true);
    expect(vaultPrivateKey()).toEqual(NORA_KEY);
    expect(mockKeeper.keepBehindPasscode).toHaveBeenCalledWith('a-nora', expect.any(Uint8Array), 'four words I chose', expect.any(Function));
  }, 30000);

  it("can be told not to keep the Vault on this phone: then nothing is kept", async () => {
    await render(inApp(<UnlockWithVaultKey />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('switch', { name: 'Keep my Vault on this phone' }));
    expect(screen.queryByLabelText('A passcode for this phone')).toBeNull();
    await user.type(screen.getByLabelText('Vault key'), VAULT_KEY);
    await user.press(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled(), { timeout: 15000 });
    expect(isVaultUnlocked()).toBe(true);
    expect(mockKeeper.keepBehindPasscode).not.toHaveBeenCalled();
  }, 30000);

  it("opens nothing with another key, and can't say which character is wrong", async () => {
    await render(inApp(<UnlockWithVaultKey />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('switch', { name: 'Keep my Vault on this phone' }));
    await user.type(screen.getByLabelText('Vault key'), 'KT4M 9QXZ PL2A 77HD VB3N E8RX');
    await user.press(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText("That key doesn't open your Vault. Check each group against what you saved. We can't tell you which character is wrong.", {}, { timeout: 15000 })).toBeOnTheScreen();
    expect(isVaultUnlocked()).toBe(false);
    expect(mockRouter.back).not.toHaveBeenCalled();
  }, 30000);

  it('leads to the helpers for someone who lost the key', async () => {
    await render(inApp(<UnlockWithVaultKey />));
    await userEvent.setup().press(screen.getByRole('button', { name: "I've lost my Vault key" }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/vault/recover');
  });
});
