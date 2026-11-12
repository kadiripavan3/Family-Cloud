import { cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { askForVault, openEntrustedItem, useGetEntrustedVault, useGetVault } from '@/api/generated/homeport';
import EntrustedVault from '@/app/(app)/vault/entrusted/[id]';
import { utf8 } from '@/features/vault/crypto/bytes';
import { publicKeyOf, seal, sealFor } from '@/features/vault/crypto/seal';
import { encodeInside } from '@/features/vault/inside';
import { lockVault, unlockVault } from '@/features/vault/session';
import { inApp } from '@/test/phone';
import { failed, loaded, me, pending } from '@/test/samples';
import { entrusted, ITEM_KEY, NETFLIX, NETFLIX_INSIDE, NORA_KEY, vaultPerson, vaultRecord } from '@/test/samples/vault';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { vaultAskedFor: jest.fn(() => Promise.resolve()) };
const mockKeeper = { keptHow: jest.fn(async () => 'passcode'), canAskThePhone: jest.fn(() => false) };
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: 'e-1' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/vault/keeper', () => new Proxy({}, { get: (_, name: string) => (...given: unknown[]) => (mockKeeper as unknown as Record<string, (...given: unknown[]) => unknown>)[name]?.(...given) }));
jest.mock('@/api/generated/homeport', () => ({ useGetVault: jest.fn(), useGetEntrustedVault: jest.fn(), useGetMe: jest.fn(() => mockMe), askForVault: jest.fn(), openEntrustedItem: jest.fn() }));

const mockMe = loaded(me());
const asked = jest.mocked(useGetEntrustedVault) as unknown as jest.Mock;
// In these tests the signed-in person (with Nora's key) is the one Alex trusts.
const from = (over = {}) => entrusted({ owner: vaultPerson(), ...over });
const NOTE = 'The will is in the blue folder. Call Jonas at the notary first.';

describe('9.5 If something happens, for the person who was trusted', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (jest.mocked(useGetVault) as unknown as jest.Mock).mockReturnValue(loaded(vaultRecord()));
    asked.mockReturnValue(loaded(from()));
    unlockVault(NORA_KEY.slice());
  });
  afterEach(async () => {
    await cleanup();
    lockVault();
  });

  it('before asking: says what asking does, and that nothing is shown until it opens', async () => {
    await render(inApp(<EntrustedVault />));
    expect(screen.getByRole('header', { name: "Alex's Vault" })).toBeOnTheScreen();
    expect(screen.getByText('Alex chose you as the person who can ask for it if something happens to them.')).toBeOnTheScreen();
    expect(screen.getByText('If you ask, Alex is told on every phone and has 48 hours to say no. Until it opens you see none of it, not even what would open.')).toBeOnTheScreen();
    expect(asked.mock.calls[0]![0]).toBe('e-1');
  });

  it('asking is confirmed first, and tells the owner', async () => {
    jest.mocked(askForVault).mockResolvedValue(from({ state: 'asked', opensAt: '2026-11-14T10:00:00Z' }));
    await render(inApp(<EntrustedVault />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "Ask for Alex's Vault" }));
    expect(screen.getByText("Alex is told now. If they don't say no within 48 hours, what they chose opens to you.")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(mockCache.vaultAskedFor).toHaveBeenCalledWith(expect.objectContaining({ state: 'asked' })));
    expect(askForVault).toHaveBeenCalledWith('e-1');
  });

  it('while waiting: says when it opens and how long that still is', async () => {
    const opensAt = new Date(Date.now() + 47 * 60 * 60 * 1000).toISOString();
    asked.mockReturnValue(loaded(from({ state: 'asked', askedAt: new Date().toISOString(), opensAt })));
    await render(inApp(<EntrustedVault />));
    expect(screen.getByText('You asked')).toBeOnTheScreen();
    expect(screen.getByText(/^It opens (on \w{3} \d+ \w{3}|tomorrow|today) at \d\d:\d\d, unless Alex says no before then\. 47 hours to go$/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Ask for/ })).toBeNull();
  });

  it('after a no: says so, and that asking again starts the wait afresh', async () => {
    asked.mockReturnValue(loaded(from({ refusedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() })));
    await render(inApp(<EntrustedVault />));
    expect(screen.getByText('Alex said no 2h ago. You can ask again another day; the wait then starts afresh.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Ask for Alex's Vault" })).toBeOnTheScreen();
  });

  it('once it is open: reads the note that was sealed for this person, and opens what was chosen with its key from the escrow', async () => {
    const mine = publicKeyOf(NORA_KEY);
    asked.mockReturnValue(loaded(from({ state: 'open', openedAt: '2026-11-14T10:00:00Z', note: sealFor(mine, utf8(NOTE), 'escrow-note'), items: [{ id: NETFLIX, title: 'Netflix', category: 'login', site: 'netflix.com', openedAt: null }] })));
    jest.mocked(openEntrustedItem).mockImplementation(async () => ({ id: NETFLIX, title: 'Netflix', category: 'login', site: 'netflix.com', ciphertext: seal(ITEM_KEY, encodeInside(NETFLIX_INSIDE), 'item'), wrappedKey: sealFor(mine, ITEM_KEY, 'escrow-key') }));
    await render(inApp(<EntrustedVault />));
    expect(screen.getByText('It is open to you')).toBeOnTheScreen();
    expect(screen.getByText(NOTE)).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Open Netflix' }));
    expect(await screen.findByText('linds.home@example.com')).toBeOnTheScreen();
    expect(openEntrustedItem).toHaveBeenCalledWith('e-1', NETFLIX);
    await user.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByText('p0pcorn!Friday#night')).toBeOnTheScreen();
  });

  it('says so when there is no note, and when nothing was chosen', async () => {
    asked.mockReturnValue(loaded(from({ state: 'open', openedAt: '2026-11-14T10:00:00Z' })));
    await render(inApp(<EntrustedVault />));
    expect(screen.getByText('They left no note.')).toBeOnTheScreen();
    expect(screen.getByText('They chose nothing to open.')).toBeOnTheScreen();
  });

  it('says so when it was switched off, when it is not there, and while it loads', async () => {
    asked.mockReturnValue(loaded(from({ state: 'off' })));
    const view = await render(inApp(<EntrustedVault />));
    expect(screen.getByText('Alex switched this off, or you are no longer in a circle together.')).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "This isn't here any more.")));
    await view.rerender(inApp(<EntrustedVault />));
    expect(screen.getByText("This isn't here any more.")).toBeOnTheScreen();
    asked.mockReturnValue(pending());
    await view.rerender(inApp(<EntrustedVault />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
  });
});
