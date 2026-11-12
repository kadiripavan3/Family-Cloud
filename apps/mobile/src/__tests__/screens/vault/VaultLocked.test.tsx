import { cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { refuseEmergency, useGetVault, useGetVaultAttention } from '@/api/generated/homeport';
import { DoesNotOpen } from '@/features/vault/crypto/seal';
import { forgetKnown } from '@/features/vault/kept';
import { isVaultUnlocked, lockVault } from '@/features/vault/session';
import { VaultHome } from '@/features/vault/VaultHome';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending } from '@/test/samples';
import { ALEX_KEY, attention, emergency, NORA_KEY, noVault, vaultHome, vaultPerson, vaultRecord } from '@/test/samples/vault';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) };
const mockCache = { vaultEmergencyChanged: jest.fn(() => Promise.resolve()), vaultKeysGiven: jest.fn(() => Promise.resolve()) };
const mockKeeper = { keptHow: jest.fn(), takeFromDevice: jest.fn(), takeWithPasscode: jest.fn(), canAskThePhone: jest.fn(() => false), keepBehindDevice: jest.fn(), keepBehindPasscode: jest.fn(), forgetKept: jest.fn(), keepRecovery: jest.fn(), takeRecovery: jest.fn(), forgetRecovery: jest.fn() };
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useFocusEffect: jest.fn() }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
// (The phone's key keeper, by name, so each test can say what the phone holds.)
jest.mock('@/features/vault/keeper', () => new Proxy({}, { get: (_, name: string) => (...given: unknown[]) => (mockKeeper as unknown as Record<string, (...given: unknown[]) => unknown>)[name]?.(...given) }));
jest.mock('@/api/generated/homeport', () => ({
  useGetVault: jest.fn(),
  useGetVaultAttention: jest.fn(),
  useGetVaultHome: jest.fn(() => mockHome),
  useGetEmergency: jest.fn(() => ({ data: undefined })),
  useGetMe: jest.fn(() => mockMe),
  refuseEmergency: jest.fn(),
}));

const mockLinds = linds;
const mockMe = loaded(me());
const mockHome = loaded(vaultHome());
const vault = jest.mocked(useGetVault) as unknown as jest.Mock;
const needs = jest.mocked(useGetVaultAttention) as unknown as jest.Mock;

describe('9.1 The Vault, locked', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lockVault();
    forgetKnown();
    vault.mockReturnValue(loaded(vaultRecord()));
    needs.mockReturnValue(loaded(attention()));
    mockKeeper.keptHow.mockResolvedValue('passcode');
  });
  // The screen goes first: locking under a screen that is still there would draw the locked page for nobody.
  afterEach(async () => {
    await cleanup();
    lockVault();
  });

  it('says what the Vault is and that nobody at the service can read it, and offers the two ways in', async () => {
    await render(inApp(<VaultHome />));
    expect(await screen.findByRole('button', { name: 'Unlock with your passcode' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'The Vault is locked' })).toBeOnTheScreen();
    expect(screen.getByText('Passwords, cards, IDs and door codes. Scrambled on this phone before they leave it: nobody at Homeport can read them.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Use your Vault key' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/vault/unlock');
    // Nothing of what is inside is drawn while it is locked.
    expect(screen.queryByText('Logins')).toBeNull();
  });

  it('unlocks with the passcode the key is kept behind, and shows that it is working meanwhile', async () => {
    let handOver: (key: Uint8Array) => void = () => undefined;
    mockKeeper.takeWithPasscode.mockImplementation((_account: string, _passcode: string, progress: (done: number) => void) => {
      progress(0.4);
      return new Promise<Uint8Array>((resolve) => (handOver = resolve));
    });
    await render(inApp(<VaultHome />));
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Unlock with your passcode' }));
    await user.type(screen.getByLabelText('Passcode'), 'four words I chose');
    await user.press(screen.getByRole('button', { name: 'Unlock' }));
    // Stretching a passcode takes a moment on purpose: the sheet says so, and how far it is.
    expect(await screen.findByText('Opening your Vault. This takes a moment on purpose: it makes guessing your key slow.')).toBeOnTheScreen();
    expect(screen.getByText('40%')).toBeOnTheScreen();
    expect(mockKeeper.takeWithPasscode).toHaveBeenCalledWith('a-nora', 'four words I chose', expect.any(Function));
    handOver(NORA_KEY.slice());
    expect(await screen.findByText('Logins')).toBeOnTheScreen();
    expect(isVaultUnlocked()).toBe(true);
  });

  it("stays locked with a wrong passcode, and says so", async () => {
    mockKeeper.takeWithPasscode.mockRejectedValue(new DoesNotOpen());
    await render(inApp(<VaultHome />));
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Unlock with your passcode' }));
    await user.type(screen.getByLabelText('Passcode'), 'a guess');
    await user.press(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText("That passcode doesn't open it. Try again, or use your Vault key.")).toBeOnTheScreen();
    expect(isVaultUnlocked()).toBe(false);
    // What was typed is not kept in the box.
    expect(screen.getByLabelText('Passcode').props.value).toBe('');
  });

  it("stays locked when the key this phone kept isn't this Vault's", async () => {
    mockKeeper.takeWithPasscode.mockResolvedValue(ALEX_KEY.slice());
    await render(inApp(<VaultHome />));
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Unlock with your passcode' }));
    await user.type(screen.getByLabelText('Passcode'), 'four words I chose');
    await user.press(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText("That passcode doesn't open it. Try again, or use your Vault key.")).toBeOnTheScreen();
    expect(isVaultUnlocked()).toBe(false);
  });

  it('on a phone with Face ID, asks the phone for the key', async () => {
    mockKeeper.keptHow.mockResolvedValue('device');
    mockKeeper.takeFromDevice.mockResolvedValue(NORA_KEY.slice());
    await render(inApp(<VaultHome />));
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Unlock with Face ID' }));
    expect(mockKeeper.takeFromDevice).toHaveBeenCalledWith('a-nora', 'Unlock your Vault');
    expect(await screen.findByText('Logins')).toBeOnTheScreen();
  });

  it("says so when Face ID didn't give the key back, and the Vault key is still a way in", async () => {
    mockKeeper.keptHow.mockResolvedValue('device');
    mockKeeper.takeFromDevice.mockRejectedValue(new Error('cancelled'));
    await render(inApp(<VaultHome />));
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Unlock with Face ID' }));
    expect(await screen.findByText("Face ID didn't unlock it. Try again, or use your Vault key.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Use your Vault key' })).toBeOnTheScreen();
    expect(isVaultUnlocked()).toBe(false);
  });

  it('on a phone that holds no key yet, asks for the Vault key, and offers the helpers to someone who lost it', async () => {
    mockKeeper.keptHow.mockResolvedValue(null);
    await render(inApp(<VaultHome />));
    expect(await screen.findByText("This phone doesn't hold your Vault yet. Type your Vault key once, and it stays here.")).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Use your Vault key' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/vault/unlock');
    await user.press(screen.getByRole('button', { name: "I've lost my Vault key" }));
    expect(mockRouter.push).toHaveBeenCalledWith('/vault/recover');
    expect(screen.queryByRole('button', { name: 'Unlock with your passcode' })).toBeNull();
  });

  it('before a Vault exists, offers to set one up', async () => {
    vault.mockReturnValue(loaded(noVault));
    await render(inApp(<VaultHome />));
    expect(screen.getByRole('header', { name: 'Set up your Vault' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Set up my Vault' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/vault/setup');
  });

  it('while locked, still says that the trusted person asked, and saying no needs no key', async () => {
    const asked = emergency({ state: 'asked', trusted: vaultPerson(), opensAt: '2026-11-14T10:00:00Z' });
    needs.mockReturnValue(loaded(attention({ emergency: asked })));
    jest.mocked(refuseEmergency).mockResolvedValue(emergency({ state: 'ready', trusted: vaultPerson() }));
    await render(inApp(<VaultHome />));
    expect(screen.getByText('Alex asked to open your Vault')).toBeOnTheScreen();
    expect(screen.getByText(/^It opens to them on Sat 14 Nov at \d\d:00 unless you say no\.$/)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Say no. Alex asked to open your Vault' }));
    await waitFor(() => expect(mockCache.vaultEmergencyChanged).toHaveBeenCalled());
    expect(refuseEmergency).toHaveBeenCalled();
    expect(isVaultUnlocked()).toBe(false);
  });

  it('while locked, says that a recovery of this Vault is running', async () => {
    needs.mockReturnValue(loaded(attention({ recovery: { id: 'r-1', state: 'open', startedAt: new Date().toISOString(), lapsesAt: '2026-11-19T09:00:00Z', endedAt: null, tempPublicKey: 'x', needed: 2, given: 0, ready: false, helpers: [] } })));
    await render(inApp(<VaultHome />));
    expect(screen.getByText('Someone is getting back into your Vault')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Look at it. Someone is getting back into your Vault' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/vault/recover');
  });

  it('shows that it is loading, and a problem with a way to try again', async () => {
    vault.mockReturnValue(pending());
    const view = await render(inApp(<VaultHome />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    const problem = failed(new ApiError(500, 'unknown', 'Something went wrong on our side.'));
    vault.mockReturnValue(problem);
    await view.rerender(inApp(<VaultHome />));
    expect(screen.getByText('Something went wrong on our side.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(problem.refetch).toHaveBeenCalled();
  });
});
