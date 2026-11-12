import { cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { cancelVaultRecovery, finishVaultRecovery, getVault, replaceVaultKey, startVaultRecovery, useGetVault, useGetVaultAttention, useGetVaultHelpers, useGetVaultRecovery } from '@/api/generated/homeport';
import Recover from '@/app/(app)/vault/recover';
import { checkWordsOf } from '@/features/vault/CheckWords';
import { toBase64Url, utf8 } from '@/features/vault/crypto/bytes';
import { publicKeyOf, sealFor } from '@/features/vault/crypto/seal';
import { split } from '@/features/vault/crypto/shamir';
import { wrapPrivateKey } from '@/features/vault/crypto/vaultKey';
import { freshVaultKeyNow, isVaultUnlocked, lockVault, unlockVault, vaultPrivateKey } from '@/features/vault/session';
import { inApp } from '@/test/phone';
import { loaded, me } from '@/test/samples';
import { attention, helpers, NORA_KEY, NORA_PUBLIC, recovery, VAULT_KEY, vaultRecord } from '@/test/samples/vault';

/** The temporary key pair a new phone makes for one recovery. */
const TEMP_KEY = Uint8Array.from({ length: 32 }, (_, i) => (i * 19 + 2) & 0xff);
const TEMP_PUBLIC = toBase64Url(publicKeyOf(TEMP_KEY));

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) };
const mockCache = { vaultRecoveryChanged: jest.fn(() => Promise.resolve()), vaultRecordChanged: jest.fn(() => Promise.resolve()), vaultHelpersChanged: jest.fn(() => Promise.resolve()) };
const mockKeeper = {
  keptHow: jest.fn(async () => null),
  canAskThePhone: jest.fn(() => false),
  keepRecovery: jest.fn(async () => undefined),
  takeRecovery: jest.fn(),
  forgetRecovery: jest.fn(async () => undefined),
  keepBehindPasscode: jest.fn(async () => undefined),
};
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/vault/keeper', () => new Proxy({}, { get: (_, name: string) => (...given: unknown[]) => (mockKeeper as unknown as Record<string, (...given: unknown[]) => unknown>)[name]?.(...given) }));
jest.mock('@/api/generated/homeport', () => ({
  useGetVault: jest.fn(),
  useGetVaultAttention: jest.fn(),
  useGetVaultHelpers: jest.fn(),
  useGetVaultRecovery: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  getVault: jest.fn(),
  startVaultRecovery: jest.fn(),
  finishVaultRecovery: jest.fn(),
  cancelVaultRecovery: jest.fn(),
  replaceVaultKey: jest.fn(),
}));

const mockMe = loaded(me());
const needs = jest.mocked(useGetVaultAttention) as unknown as jest.Mock;
const running = jest.mocked(useGetVaultRecovery) as unknown as jest.Mock;
const mine = (over = {}) => recovery({ tempPublicKey: TEMP_PUBLIC, ...over });
let record = vaultRecord();

describe('getting back in with helpers', () => {
  beforeAll(async () => {
    record = vaultRecord({ ...(await wrapPrivateKey(VAULT_KEY, NORA_KEY)), publicKey: NORA_PUBLIC });
  });
  beforeEach(() => {
    jest.clearAllMocks();
    (jest.mocked(useGetVault) as unknown as jest.Mock).mockReturnValue(loaded(record));
    jest.mocked(getVault).mockResolvedValue(record);
    needs.mockReturnValue(loaded(attention()));
    (jest.mocked(useGetVaultHelpers) as unknown as jest.Mock).mockReturnValue(loaded(helpers({ ready: true })));
    running.mockReturnValue(loaded(mine()));
    // Like the phone's storage: a copy each time it is asked, which whoever takes it overwrites when done.
    mockKeeper.takeRecovery.mockImplementation(async () => ({ id: 'r-1', privateKey: TEMP_KEY.slice() }));
  });
  afterEach(async () => {
    await cleanup();
    lockVault();
  });

  it('says plainly that there is no way back in without two helpers who hold a part', async () => {
    (jest.mocked(useGetVaultHelpers) as unknown as jest.Mock).mockReturnValue(loaded(helpers({ ready: false })));
    await render(inApp(<Recover />));
    expect(screen.getByText('There is no way back in')).toBeOnTheScreen();
    expect(screen.getByText("You have no two helpers who hold a part of your key, and we don't have a copy. Without the Vault key, what is in this Vault stays scrambled for good.")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Ask my helpers' })).toBeNull();
  });

  it('starts a recovery with the public half of a key pair made for it; the private half stays on this phone', async () => {
    jest.mocked(startVaultRecovery).mockImplementation(async (request) => mine({ tempPublicKey: request.tempPublicKey }));
    // Like the phone's storage: it keeps a copy of its own.
    const stored: { account: string; id: string; privateKey: Uint8Array }[] = [];
    (mockKeeper.keepRecovery as jest.Mock).mockImplementation(async (account: string, kept: { id: string; privateKey: Uint8Array }) => {
      stored.push({ account, id: kept.id, privateKey: kept.privateKey.slice() });
    });
    await render(inApp(<Recover />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Ask my helpers' }));
    await waitFor(() => expect(mockCache.vaultRecoveryChanged).toHaveBeenCalled());
    const sent = jest.mocked(startVaultRecovery).mock.calls[0]![0];
    expect(sent.clientId).toBe('client-1');
    expect(sent.tempPublicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.account).toBe('a-nora');
    expect(stored[0]!.id).toBe('r-1');
    expect(toBase64Url(publicKeyOf(stored[0]!.privateKey))).toBe(sent.tempPublicKey);
    expect(JSON.stringify(sent)).not.toContain(toBase64Url(stored[0]!.privateKey));
    // What was handed to the storage is overwritten once it is stored.
    const [, handedIn] = mockKeeper.keepRecovery.mock.calls[0] as unknown as [string, { privateKey: Uint8Array }];
    expect(handedIn.privateKey).toEqual(new Uint8Array(32));
  });

  it('while it runs on the phone that started it: the check words, who has helped, and when it lapses', async () => {
    needs.mockReturnValue(loaded(attention({ recovery: mine() })));
    running.mockReturnValue(loaded(mine({ given: 1, helpers: [{ ...mine().helpers[0]!, given: true }, mine().helpers[1]!] })));
    await render(inApp(<Recover />));
    expect(await screen.findByText('Your helpers were asked')).toBeOnTheScreen();
    expect(screen.getByText(checkWordsOf(TEMP_PUBLIC).join(' · '))).toBeOnTheScreen();
    expect(screen.getByText('Passed their part on')).toBeOnTheScreen();
    expect(screen.getByText('Not yet')).toBeOnTheScreen();
    expect(screen.getByText(/^This recovery lapses on 19 November\b/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Open my Vault' })).toBeNull();
  });

  it('once two helpers have helped: joins their parts into the Vault key on this phone, opens the Vault, and keeps the key behind the passcode', async () => {
    const shares = split(utf8(VAULT_KEY.replace(/ /g, '')), 2);
    const ready = mine({ given: 2, ready: true, helpers: mine().helpers.map((helper, at) => ({ ...helper, given: true, resealedShare: sealFor(publicKeyOf(TEMP_KEY), shares[at]!, 'recovery-share') })) });
    needs.mockReturnValue(loaded(attention({ recovery: ready })));
    running.mockReturnValue(loaded(ready));
    jest.mocked(finishVaultRecovery).mockResolvedValue({ ...ready, state: 'done' });
    await render(inApp(<Recover />));
    expect(await screen.findByText('Two helpers have helped')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('A passcode for this phone'), 'four words I chose');
    await user.type(screen.getByLabelText('The same passcode again'), 'four words I chose');
    await user.press(screen.getByRole('button', { name: 'Open my Vault' }));
    await waitFor(() => expect(finishVaultRecovery).toHaveBeenCalledWith('r-1'), { timeout: 15000 });
    expect(isVaultUnlocked()).toBe(true);
    expect(vaultPrivateKey()).toEqual(NORA_KEY);
    expect(mockKeeper.forgetRecovery).toHaveBeenCalledWith('a-nora');
    expect(mockKeeper.keepBehindPasscode).toHaveBeenCalledWith('a-nora', expect.any(Uint8Array), 'four words I chose', expect.any(Function));
    // The Vault key that was rebuilt is not held: the next step is a new one.
    expect(freshVaultKeyNow()).toBeNull();
  }, 30000);

  it("parts that don't fit together open nothing, and the page says to start again", async () => {
    const one = split(utf8(VAULT_KEY.replace(/ /g, '')), 2)[0]!;
    const other = split(utf8(VAULT_KEY.replace(/ /g, '')), 2)[1]!;
    const ready = mine({ given: 2, ready: true, helpers: mine().helpers.map((helper, at) => ({ ...helper, given: true, resealedShare: sealFor(publicKeyOf(TEMP_KEY), at === 0 ? one : other, 'recovery-share') })) });
    needs.mockReturnValue(loaded(attention({ recovery: ready })));
    running.mockReturnValue(loaded(ready));
    mockKeeper.canAskThePhone.mockReturnValue(true);
    await render(inApp(<Recover />));
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Open my Vault' }));
    expect(await screen.findByText("The two parts didn't rebuild your key. Cancel this recovery and start again.", {}, { timeout: 15000 })).toBeOnTheScreen();
    expect(isVaultUnlocked()).toBe(false);
    expect(finishVaultRecovery).not.toHaveBeenCalled();
    mockKeeper.canAskThePhone.mockReturnValue(false);
  }, 30000);

  it('on a phone that did not start it: says so, shows the same check words, and can cancel it', async () => {
    mockKeeper.takeRecovery.mockResolvedValue(null);
    needs.mockReturnValue(loaded(attention({ recovery: mine() })));
    jest.mocked(cancelVaultRecovery).mockResolvedValue(undefined);
    await render(inApp(<Recover />));
    expect(await screen.findByText("This recovery wasn't started on this phone")).toBeOnTheScreen();
    expect(screen.getByText(checkWordsOf(TEMP_PUBLIC).join(' · '))).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Cancel this recovery' }));
    expect(screen.getByText('The parts that were passed on are deleted. You can start again.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Cancel it' }));
    await waitFor(() => expect(cancelVaultRecovery).toHaveBeenCalledWith('r-1'));
    expect(mockCache.vaultRecoveryChanged).toHaveBeenCalled();
  });

  it('back in: offers a new Vault key at once, because the old one came out of parts other people held', async () => {
    unlockVault(NORA_KEY.slice());
    jest.mocked(replaceVaultKey).mockImplementation(async (request) => ({ ...record, ...request, keyVersion: 2, keySaved: false }));
    await render(inApp(<Recover />));
    expect(screen.getByText("You're back in")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Make a new Vault key' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/vault/key'), { timeout: 15000 });
    expect(freshVaultKeyNow()).toMatch(/^[A-HJ-NP-Z2-9]{24}$/);
    expect(mockCache.vaultRecordChanged).toHaveBeenCalledWith(expect.objectContaining({ keyVersion: 2 }));
  }, 30000);
});
