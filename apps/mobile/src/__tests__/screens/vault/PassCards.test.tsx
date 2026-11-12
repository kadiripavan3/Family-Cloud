import { cleanup, render, renderHook, screen, userEvent, waitFor } from '@testing-library/react-native';
import nodeCrypto from 'node:crypto';

import { addGuestPassCard, type GuestPassResponse, openVaultItem, useGetVault, useGetVaultItemsInfinite } from '@/api/generated/homeport';
import { openMine, publicKeyOf, sealFor } from '@/features/vault/crypto/seal';
import { PassCards, useKeyForMaker, usePassLink } from '@/features/vault/PassCards';
import { lockVault, unlockVault } from '@/features/vault/session';
import { inApp } from '@/test/phone';
import { loaded, onlyMe } from '@/test/samples';
import { DOOR, itemRow, noVault, NORA_KEY, openedAnswer, vaultRecord } from '@/test/samples/vault';

const mockRouter = { push: jest.fn(), navigate: jest.fn() };
const mockCache = { guestPassChanged: jest.fn(() => Promise.resolve()) };
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/api/generated/homeport', () => ({ useGetVault: jest.fn(), useGetVaultItemsInfinite: jest.fn(), openVaultItem: jest.fn(), addGuestPassCard: jest.fn() }));

/** The key of the pass, as its maker's phone made it, and the same key sealed for the maker's own Vault. */
const PASS_KEY = Uint8Array.from({ length: 32 }, (_, i) => (i * 23 + 7) & 0xff);
const pass = (over: Partial<GuestPassResponse> = {}): GuestPassResponse => ({
  id: 'g-1',
  circleId: 'c-linds',
  guestName: 'Ines, the sitter',
  startsAt: '2026-11-12T18:00:00Z',
  endsAt: '2026-11-12T23:30:00Z',
  url: 'https://homeport.app/g/8f2k-linds',
  code: '4821',
  running: true,
  opened: false,
  things: [],
  cards: [],
  keyForMaker: sealFor(publicKeyOf(NORA_KEY), PASS_KEY, 'pass-key'),
  ...over,
});
const doorCode = itemRow({ id: DOOR, title: 'Front door code', category: 'code', site: 'home', glance: 'Code · home', mine: true, chip: onlyMe, myAccess: 'change' });
const vault = jest.mocked(useGetVault) as unknown as jest.Mock;

/** What the guest's browser does with the part of the link after the # and a card's sealed text: the same steps as the page's script. */
function openAsTheGuestPageDoes(keyInTheLink: string, sealed: string): string {
  const bytes = Buffer.from(sealed, 'base64url');
  const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', Buffer.from(keyInTheLink, 'base64url'), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(bytes.length - 16));
  return Buffer.concat([decipher.update(bytes.subarray(12, bytes.length - 16)), decipher.final()]).toString('utf8');
}

describe('a door code on a guest pass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    vault.mockReturnValue(loaded(vaultRecord()));
    (jest.mocked(useGetVaultItemsInfinite) as unknown as jest.Mock).mockReturnValue({ ...loaded({ pages: [{ items: [doorCode, itemRow({ mine: true })], nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    jest.mocked(openVaultItem).mockImplementation(async () => openedAnswer({ v: 1, title: 'Front door code', site: 'home', category: 'code', fields: { code: '4821, then the star key' } }));
    jest.mocked(addGuestPassCard).mockImplementation(async () => pass({ cards: [{ id: 'card-1', label: 'Front door code', once: false, shown: false, shownAt: null, thingId: DOOR }] }));
    unlockVault(NORA_KEY.slice());
  });
  afterEach(async () => {
    await cleanup();
    lockVault();
  });

  it("a new pass gets a key of its own, sealed for its maker's Vault; that needs no unlocked Vault", async () => {
    lockVault();
    const { result } = await renderHook(() => useKeyForMaker());
    const sealed = result.current()!;
    expect(openMine(NORA_KEY, sealed, 'pass-key')).toHaveLength(32);
    // Each pass gets another key.
    expect(openMine(NORA_KEY, result.current()!, 'pass-key')).not.toEqual(openMine(NORA_KEY, sealed, 'pass-key'));
    vault.mockReturnValue(loaded(noVault));
    expect((await renderHook(() => useKeyForMaker())).result.current()).toBeUndefined();
  });

  it('seals the code on this phone with the key of the pass: the API gets the card, and the guest page opens it with the end of the link', async () => {
    await render(inApp(<PassCards pass={pass()} />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add a code or the Wi‑Fi. From your Vault, sealed on this phone' }));
    // Codes and networks are offered, a login is not.
    expect(screen.queryByRole('button', { name: /^Netflix/ })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Front door code. Code · home' }));
    await waitFor(() => expect(mockCache.guestPassChanged).toHaveBeenCalledWith('c-linds'));
    const [id, card] = jest.mocked(addGuestPassCard).mock.calls[0]!;
    expect(id).toBe('g-1');
    expect(card).toMatchObject({ clientId: 'client-1', label: 'Front door code', once: false, thingId: DOOR });
    expect(JSON.stringify(card)).not.toContain('4821');
    expect(JSON.stringify(card)).not.toContain(Buffer.from(PASS_KEY).toString('base64url'));
    expect(openAsTheGuestPageDoes(Buffer.from(PASS_KEY).toString('base64url'), card.ciphertext)).toBe('4821, then the star key');
  });

  it('can be shown once only', async () => {
    await render(inApp(<PassCards pass={pass()} />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Add a code or the Wi‑Fi/ }));
    await user.press(screen.getByRole('switch', { name: 'Show it only once' }));
    await user.press(screen.getByRole('button', { name: 'Front door code. Code · home' }));
    await waitFor(() => expect(addGuestPassCard).toHaveBeenCalled());
    expect(jest.mocked(addGuestPassCard).mock.calls[0]![1].once).toBe(true);
  });

  it('lists the cards that are on the pass', async () => {
    await render(inApp(<PassCards pass={pass({ cards: [{ id: 'card-1', label: 'Front door code', once: true, shown: false, shownAt: null, thingId: DOOR }] })} />));
    expect(screen.getByText('Front door code')).toBeOnTheScreen();
    expect(screen.getByText('Shows once')).toBeOnTheScreen();
  });

  it('the link to send ends in the key only while the Vault is unlocked, and only for a pass with a sealed card', async () => {
    const sealedPass = pass({ cards: [{ id: 'card-1', label: 'Front door code', once: false, shown: false, shownAt: null, thingId: DOOR }] });
    const whole = (await renderHook(() => usePassLink(sealedPass))).result.current;
    expect(whole).toEqual({ url: `https://homeport.app/g/8f2k-linds#${Buffer.from(PASS_KEY).toString('base64url')}`, sealed: true, whole: true });
    // A pass without a sealed card is sent as the API gave it.
    expect((await renderHook(() => usePassLink(pass()))).result.current).toEqual({ url: 'https://homeport.app/g/8f2k-linds', sealed: false, whole: true });
    lockVault();
    expect((await renderHook(() => usePassLink(sealedPass))).result.current).toEqual({ url: 'https://homeport.app/g/8f2k-linds', sealed: true, whole: false });
  });

  it('says why a code can not be added: a locked Vault, no Vault, or a pass without a key for this person', async () => {
    lockVault();
    const view = await render(inApp(<PassCards pass={pass()} />));
    expect(screen.getByText('Unlock your Vault to add a code, and to get the whole link.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Go to the Vault' }));
    expect(mockRouter.navigate).toHaveBeenCalledWith({ pathname: '/', params: { place: 'vault' } });
    unlockVault(NORA_KEY.slice());
    await view.rerender(inApp(<PassCards pass={pass({ keyForMaker: null })} />));
    expect(screen.getByText('A code can be added by the person who made the pass, if they had a Vault when they made it.')).toBeOnTheScreen();
    vault.mockReturnValue(loaded(noVault));
    await view.rerender(inApp(<PassCards pass={pass({ keyForMaker: null })} />));
    expect(screen.getByText('Set up your Vault to put a door code or the Wi‑Fi on a pass.')).toBeOnTheScreen();
  });
});
