import { cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { ApiError } from '@/api/fetcher';
import { setUpVault, type SetUpVaultRequest, useGetVault } from '@/api/generated/homeport';
import SetUpVault from '@/app/(app)/vault/setup';
import { unwrapPrivateKey } from '@/features/vault/crypto/vaultKey';
import { forgetKnown } from '@/features/vault/kept';
import { freshVaultKeyNow, isVaultUnlocked, lockVault, vaultPrivateKey } from '@/features/vault/session';
import { inApp } from '@/test/phone';
import { loaded, me } from '@/test/samples';
import { noVault, vaultRecord } from '@/test/samples/vault';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockCache = { vaultRecordChanged: jest.fn(() => Promise.resolve()) };
const mockOrder: string[] = [];
const mockKeeper = {
  keptHow: jest.fn(async () => null),
  canAskThePhone: jest.fn(() => false),
  keepBehindPasscode: jest.fn(async () => void mockOrder.push('kept on the phone')),
  keepBehindDevice: jest.fn(async () => void mockOrder.push('kept on the phone')),
  forgetKept: jest.fn(async () => void mockOrder.push('forgotten')),
};
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/vault/keeper', () => new Proxy({}, { get: (_, name: string) => (...given: unknown[]) => (mockKeeper as unknown as Record<string, (...given: unknown[]) => unknown>)[name]?.(...given) }));
jest.mock('@/api/generated/homeport', () => ({ useGetVault: jest.fn(), useGetMe: jest.fn(() => mockMe), setUpVault: jest.fn() }));

const mockMe = loaded(me());
const on = (os: typeof Platform.OS) => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });

describe('setting up a Vault', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrder.length = 0;
    forgetKnown();
    mockKeeper.canAskThePhone.mockReturnValue(false);
    (jest.mocked(useGetVault) as unknown as jest.Mock).mockReturnValue(loaded(noVault));
    jest.mocked(setUpVault).mockImplementation(async (request: SetUpVaultRequest) => {
      mockOrder.push('sent to the API');
      return vaultRecord({ ...request, keySaved: false });
    });
  });
  afterEach(async () => {
    await cleanup();
    lockVault();
    on('ios');
  });

  it('says what happens in plain words: scrambled here, no reset, and what the service can still see', async () => {
    await render(inApp(<SetUpVault />));
    expect(screen.getByRole('header', { name: 'Set up your Vault' })).toBeOnTheScreen();
    expect(screen.getByText("We don't have a copy of your Vault key, so we can't reset it. Two people you trust can together let you back in.")).toBeOnTheScreen();
    expect(screen.getByText('Titles, kinds, sites and who you share with are stored unscrambled, so search and reminders work. Never put a secret in a title.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Make my keys' })).toBeDisabled();
  });

  it('in the browser preview, says right where the passcode is chosen that it is for trying things out, not for real secrets', async () => {
    on('web');
    await render(inApp(<SetUpVault />));
    expect(screen.getByText('The browser preview is for trying things out')).toBeOnTheScreen();
    expect(screen.getByText(/^Don't keep real passwords here\. A browser has no Face ID and no safe place for keys/)).toBeOnTheScreen();
    expect(screen.getByLabelText('A passcode for this browser')).toBeOnTheScreen();
  });

  it('wants a passcode of eight characters, typed the same twice', async () => {
    await render(inApp(<SetUpVault />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('A passcode for this phone'), 'short');
    expect(screen.getByText('Use at least 8 characters.')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('A passcode for this phone'), '-but-longer');
    await user.type(screen.getByLabelText('The same passcode again'), 'short-but-longe');
    expect(screen.getByText("The two don't match.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Make my keys' })).toBeDisabled();
    await user.type(screen.getByLabelText('The same passcode again'), 'r');
    expect(screen.getByRole('button', { name: 'Make my keys' })).toBeEnabled();
  });

  it('makes the keys on this phone: the API gets a public key and a wrapped private key, and the Vault key opens it', async () => {
    await render(inApp(<SetUpVault />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('A passcode for this phone'), 'four words I chose');
    await user.type(screen.getByLabelText('The same passcode again'), 'four words I chose');
    await user.press(screen.getByRole('button', { name: 'Make my keys' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/vault/key'), { timeout: 15000 });

    const sent = jest.mocked(setUpVault).mock.calls[0]![0];
    expect(sent.publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sent.wrappedPrivateKey).toMatch(/^[A-Za-z0-9_-]{98}$/);
    expect(sent.kdf).toEqual({ n: 32768, r: 8, p: 1 });
    // The Vault is unlocked, and the Vault key is held to be shown once. Neither it nor the private key was sent.
    expect(isVaultUnlocked()).toBe(true);
    const vaultKey = freshVaultKeyNow()!;
    expect(vaultKey).toMatch(/^[A-HJ-NP-Z2-9]{24}$/);
    const privateKey = vaultPrivateKey();
    for (const secret of [vaultKey, 'four words I chose', Buffer.from(privateKey).toString('base64url'), Buffer.from(privateKey).toString('hex')]) expect(JSON.stringify(sent)).not.toContain(secret);
    // And what was sent is exactly what a new phone needs: the Vault key opens the same private key out of it.
    expect(await unwrapPrivateKey(vaultKey, sent)).toEqual(privateKey);
    // The phone kept its own copy before the API heard of the Vault: one never exists whose key no phone holds.
    expect(mockOrder).toEqual(['kept on the phone', 'sent to the API']);
    expect(mockKeeper.keepBehindPasscode).toHaveBeenCalledWith('a-nora', expect.any(Uint8Array), 'four words I chose', expect.any(Function));
    expect(mockCache.vaultRecordChanged).toHaveBeenCalled();
  }, 30000);

  it('on a phone with Face ID, keeps the key behind it and asks for no passcode', async () => {
    mockKeeper.canAskThePhone.mockReturnValue(true);
    await render(inApp(<SetUpVault />));
    expect(screen.getByText('Kept behind Face ID')).toBeOnTheScreen();
    expect(screen.queryByLabelText('A passcode for this phone')).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Make my keys' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/vault/key'), { timeout: 15000 });
    expect(mockKeeper.keepBehindDevice).toHaveBeenCalledWith('a-nora', expect.any(Uint8Array));
    expect(mockKeeper.keepBehindPasscode).not.toHaveBeenCalled();
  }, 30000);

  it("when the API says no, nothing is left on the phone and the Vault stays locked", async () => {
    jest.mocked(setUpVault).mockRejectedValue(new ApiError(409, 'vault_exists', 'You already have a Vault. Unlock it with your Vault key.'));
    mockKeeper.canAskThePhone.mockReturnValue(true);
    await render(inApp(<SetUpVault />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Make my keys' }));
    expect(await screen.findByText('You already have a Vault. Unlock it with your Vault key.', {}, { timeout: 15000 })).toBeOnTheScreen();
    expect(mockOrder).toEqual(['kept on the phone', 'forgotten']);
    expect(isVaultUnlocked()).toBe(false);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  }, 30000);

  it('offers nothing to someone who already has a Vault', async () => {
    (jest.mocked(useGetVault) as unknown as jest.Mock).mockReturnValue(loaded(vaultRecord()));
    mockKeeper.canAskThePhone.mockReturnValue(true);
    await render(inApp(<SetUpVault />));
    expect(screen.getByRole('button', { name: 'Make my keys' })).toBeDisabled();
  });
});
