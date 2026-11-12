import { cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { ApiError } from '@/api/fetcher';
import { askVaultHelper, confirmVaultKeySaved, removeVaultHelper, replaceVaultKey, saveHelperShares, useGetVault, useGetVaultHelpers, useGetVaultPeople } from '@/api/generated/homeport';
import VaultKey from '@/app/(app)/vault/key';
import { fromUtf8 } from '@/features/vault/crypto/bytes';
import { openMine } from '@/features/vault/crypto/seal';
import { join } from '@/features/vault/crypto/shamir';
import { unwrapPrivateKey, wrapPrivateKey } from '@/features/vault/crypto/vaultKey';
import { printVaultKey } from '@/features/vault/printKey';
import { freshVaultKeyNow, holdFreshVaultKey, lockVault, unlockVault } from '@/features/vault/session';
import { inApp } from '@/test/phone';
import { failed, loaded, me, pending } from '@/test/samples';
import { ALEX_KEY, helper, helpers, NORA_KEY, NORA_PUBLIC, VAULT_KEY, vaultPerson, vaultRecord } from '@/test/samples/vault';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) };
const mockCache = { vaultRecordChanged: jest.fn(() => Promise.resolve()), vaultHelpersChanged: jest.fn(() => Promise.resolve()) };
const mockKeeper = { keptHow: jest.fn(async () => 'passcode'), canAskThePhone: jest.fn(() => false) };
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/vault/printKey', () => ({ printVaultKey: jest.fn(async () => 'printed') }));
jest.mock('@/features/vault/keeper', () => new Proxy({}, { get: (_, name: string) => (...given: unknown[]) => (mockKeeper as unknown as Record<string, (...given: unknown[]) => unknown>)[name]?.(...given) }));
jest.mock('@/api/generated/homeport', () => ({
  useGetVault: jest.fn(),
  useGetVaultHelpers: jest.fn(),
  useGetVaultPeople: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  confirmVaultKeySaved: jest.fn(),
  replaceVaultKey: jest.fn(),
  askVaultHelper: jest.fn(),
  removeVaultHelper: jest.fn(),
  saveHelperShares: jest.fn(),
}));

const mockMe = loaded(me());
const vault = jest.mocked(useGetVault) as unknown as jest.Mock;
const list = jest.mocked(useGetVaultHelpers) as unknown as jest.Mock;
const KEY = VAULT_KEY.replace(/ /g, '');
/** A second helper, with a key pair of her own. */
const ASTRID_KEY = Uint8Array.from({ length: 32 }, (_, i) => (i * 17 + 9) & 0xff);
const astrid = () => helper({ id: 'h-astrid', person: vaultPerson({ memberId: 'm-astrid', name: 'Astrid Lind', publicKey: Buffer.from(jest.requireActual('@/features/vault/crypto/seal').publicKeyOf(ASTRID_KEY)).toString('base64url') }) });
let record = vaultRecord();

describe('9.6 Your Vault key', () => {
  beforeAll(async () => {
    record = vaultRecord({ ...(await wrapPrivateKey(VAULT_KEY, NORA_KEY)), publicKey: NORA_PUBLIC, keySaved: false });
  });
  beforeEach(() => {
    jest.clearAllMocks();
    vault.mockReturnValue(loaded(record));
    list.mockReturnValue(loaded(helpers()));
    (jest.mocked(useGetVaultPeople) as unknown as jest.Mock).mockReturnValue(loaded([vaultPerson(), vaultPerson({ memberId: 'm-lea', name: 'Lea', hasVault: false, publicKey: null })]));
    unlockVault(NORA_KEY.slice());
    holdFreshVaultKey(KEY);
  });
  afterEach(async () => {
    await cleanup();
    lockVault();
  });

  it("shows the key once, in its groups, with its code for a camera, and says plainly that it can't be reset", async () => {
    await render(inApp(<VaultKey />));
    expect(screen.getByRole('header', { name: 'Your Vault key' })).toBeOnTheScreen();
    expect(screen.getByText(/^It unscrambles the Vault on a new phone\. We don't have a copy, so /)).toBeOnTheScreen();
    expect(screen.getByText("we can't reset it for you")).toBeOnTheScreen();
    for (const group of VAULT_KEY.split(' ')) expect(screen.getByText(group)).toBeOnTheScreen();
    expect(screen.getByLabelText(VAULT_KEY)).toBeOnTheScreen();
    expect(screen.getByLabelText('Your Vault key as a QR code')).toBeOnTheScreen();
  });

  it('copies the key, and says when the clipboard is cleared', async () => {
    await render(inApp(<VaultKey />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Copy' }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(VAULT_KEY, expect.anything());
    expect(await screen.findByText('Copied. The phone clears it from the clipboard after 60 seconds.')).toBeOnTheScreen();
  });

  it('hands a page with the key and two sentences to "Save as PDF", and says so when that is not possible here', async () => {
    await render(inApp(<VaultKey />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Save as PDF' }));
    expect(printVaultKey).toHaveBeenCalledWith(expect.objectContaining({ title: 'Your Homeport Vault key', key: VAULT_KEY, body: expect.stringContaining("Homeport has no copy and can't reset it.") }));
    jest.mocked(printVaultKey).mockResolvedValue('not-here');
    await user.press(screen.getByRole('button', { name: 'Save as PDF' }));
    expect(await screen.findByText('Saving as a PDF arrives with the phone build. For now, copy it, or write it down.')).toBeOnTheScreen();
  });

  it('"I\'ve saved my key" is noted by the API, and the phone lets go of the key', async () => {
    jest.mocked(confirmVaultKeySaved).mockResolvedValue({ ...record, keySaved: true });
    await render(inApp(<VaultKey />));
    await userEvent.setup().press(screen.getByRole('button', { name: "I've saved my key" }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(confirmVaultKeySaved).toHaveBeenCalled();
    expect(mockCache.vaultRecordChanged).toHaveBeenCalledWith(expect.objectContaining({ keySaved: true }));
    expect(freshVaultKeyNow()).toBeNull();
  });

  it("later, it can't be shown again: the phone doesn't keep it. A new one can be made, and the old one stops working", async () => {
    holdFreshVaultKey(null);
    vault.mockReturnValue(loaded({ ...record, keySaved: true }));
    jest.mocked(replaceVaultKey).mockImplementation(async (request) => ({ ...record, ...request, keyVersion: 2, keySaved: false }));
    await render(inApp(<VaultKey />));
    expect(screen.getByText('Shown once')).toBeOnTheScreen();
    expect(screen.getByText('You said you saved it.')).toBeOnTheScreen();
    expect(screen.queryByText('KT4M')).toBeNull();
    expect(screen.queryByLabelText(VAULT_KEY)).toBeNull();
    expect(screen.queryByRole('button', { name: "I've saved my key" })).toBeNull();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Make a new Vault key' }));
    expect(screen.getByText("The key you saved before stops working, and your helpers' parts are thrown away: split the new key for them afterwards. Nothing you shared changes.")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Make a new key' }));
    await waitFor(() => expect(mockCache.vaultRecordChanged).toHaveBeenCalled(), { timeout: 15000 });
    // The same private key, wrapped afresh: the new key opens it, the old one doesn't.
    const sent = jest.mocked(replaceVaultKey).mock.calls[0]![0];
    const fresh = freshVaultKeyNow()!;
    expect(fresh).not.toBe(KEY);
    expect(await unwrapPrivateKey(fresh, { ...sent, publicKey: NORA_PUBLIC })).toEqual(NORA_KEY);
    await expect(unwrapPrivateKey(KEY, { ...sent, publicKey: NORA_PUBLIC })).rejects.toThrow();
    expect(JSON.stringify(sent)).not.toContain(fresh);
    expect(await screen.findByRole('button', { name: "I've saved my key" })).toBeOnTheScreen();
  }, 40000);

  describe('helpers', () => {
    it('lists who can help, where each stands, and offers to ask another', async () => {
      list.mockReturnValue(loaded(helpers({ helpers: [helper(), astrid(), helper({ id: 'h-kai', person: vaultPerson({ memberId: 'm-kai', name: 'Kai' }), state: 'asked', hasShare: false })], ready: true })));
      await render(inApp(<VaultKey />));
      expect(screen.getByText('If you lose it')).toBeOnTheScreen();
      expect(screen.getByText('Alex can help you back in')).toBeOnTheScreen();
      expect(screen.getByText('Helper · said yes')).toBeOnTheScreen();
      expect(screen.getByText('Astrid can help too')).toBeOnTheScreen();
      expect(screen.getByText('Any two helpers together')).toBeOnTheScreen();
      expect(screen.getByText('Kai was asked')).toBeOnTheScreen();
      expect(screen.getByText('Waiting for their answer')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Add another helper. So two are always reachable' })).toBeOnTheScreen();
      expect(list).toHaveBeenCalledWith({ query: { refetchOnMount: 'always' } });
    });

    it('asks someone from the circles who has a Vault; someone without one can not be asked yet', async () => {
      jest.mocked(askVaultHelper).mockResolvedValue(helper({ state: 'asked', hasShare: false }));
      await render(inApp(<VaultKey />));
      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: 'Add a helper. Two are needed to let you back in' }));
      expect(screen.getByText('They are asked, and have to say yes. One helper alone can do nothing; any two together can let you back in.')).toBeOnTheScreen();
      expect(screen.getByText("Hasn't opened their Vault yet")).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'Alex Strand' }));
      await waitFor(() => expect(mockCache.vaultHelpersChanged).toHaveBeenCalled());
      expect(askVaultHelper).toHaveBeenCalledWith({ clientId: 'client-1', memberId: 'm-alex' });
    });

    it('takes a helper off the list after asking', async () => {
      list.mockReturnValue(loaded(helpers({ helpers: [helper()] })));
      jest.mocked(removeVaultHelper).mockResolvedValue(undefined);
      await render(inApp(<VaultKey />));
      const user = userEvent.setup();
      await user.press(screen.getByRole('button', { name: /^Alex can help you back in\./ }));
      expect(screen.getByText('Take Alex off the list?')).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'Take them off' }));
      await waitFor(() => expect(removeVaultHelper).toHaveBeenCalledWith('h-alex'));
      // One helper alone must never be enough, and the page says so.
      expect(screen.getByText('One helper alone must never be enough. When a second helper says yes, your key is split between them.')).toBeOnTheScreen();
    });

    it('splits the key that is on screen for the helpers who said yes: any two parts rebuild it, one says nothing, and each is sealed for one helper', async () => {
      const due = helpers({ helpers: [helper({ hasShare: false }), { ...astrid(), hasShare: false }], sharesDue: true });
      list.mockReturnValue(loaded(due));
      jest.mocked(saveHelperShares).mockResolvedValue({ ...due, ready: true, sharesDue: false });
      await render(inApp(<VaultKey />));
      expect(screen.getByText('Hand your helpers their parts')).toBeOnTheScreen();
      // The key was just made and is on screen: nothing to type.
      expect(screen.queryByLabelText('Your Vault key')).toBeNull();
      await userEvent.setup().press(screen.getByRole('button', { name: 'Split it for 2 helpers' }));
      await waitFor(() => expect(saveHelperShares).toHaveBeenCalled(), { timeout: 15000 });
      const { shares } = jest.mocked(saveHelperShares).mock.calls[0]![0];
      expect(shares.map((share) => share.helperId)).toEqual(['h-alex', 'h-astrid']);
      const alexs = openMine(ALEX_KEY, shares[0]!.sealedShare!, 'helper-share');
      const astrids = openMine(ASTRID_KEY, shares[1]!.sealedShare!, 'helper-share');
      expect(alexs).toHaveLength(25);
      expect(fromUtf8(join(alexs, astrids))).toBe(KEY);
      // Neither part is the key, and a helper can't open the other's part.
      expect(Buffer.from(alexs.subarray(1)).toString('latin1')).not.toBe(KEY);
      expect(() => openMine(ALEX_KEY, shares[1]!.sealedShare!, 'helper-share')).toThrow();
      expect(JSON.stringify(shares)).not.toContain(KEY);
      expect(mockCache.vaultHelpersChanged).toHaveBeenCalledWith(expect.objectContaining({ ready: true }));
    }, 30000);

    it('later, asks for the Vault key once more to split it, and splits nothing with a wrong one', async () => {
      holdFreshVaultKey(null);
      const due = helpers({ helpers: [helper({ hasShare: false }), { ...astrid(), hasShare: false }], sharesDue: true });
      list.mockReturnValue(loaded(due));
      jest.mocked(saveHelperShares).mockResolvedValue({ ...due, ready: true, sharesDue: false });
      await render(inApp(<VaultKey />));
      const user = userEvent.setup();
      expect(screen.getByText("This phone doesn't keep your Vault key, so type it once more to split it.")).toBeOnTheScreen();
      await user.type(screen.getByLabelText('Your Vault key'), 'KT4M 9QXZ PL2A 77HD VB3N E8RX');
      await user.press(screen.getByRole('button', { name: 'Split it for 2 helpers' }));
      expect(await screen.findByText("That isn't your Vault key. Nothing was split.", {}, { timeout: 15000 })).toBeOnTheScreen();
      expect(saveHelperShares).not.toHaveBeenCalled();
      await user.clear(screen.getByLabelText('Your Vault key'));
      await user.type(screen.getByLabelText('Your Vault key'), VAULT_KEY.toLowerCase());
      await user.press(screen.getByRole('button', { name: 'Split it for 2 helpers' }));
      await waitFor(() => expect(saveHelperShares).toHaveBeenCalled(), { timeout: 15000 });
    }, 40000);
  });

  it('shows that it is loading, and a problem with a way to try again', async () => {
    list.mockReturnValue(pending());
    const view = await render(inApp(<VaultKey />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    const problem = failed(new ApiError(500, 'unknown', 'Something went wrong on our side.'));
    list.mockReturnValue(problem);
    await view.rerender(inApp(<VaultKey />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(problem.refetch).toHaveBeenCalled();
  });
});
