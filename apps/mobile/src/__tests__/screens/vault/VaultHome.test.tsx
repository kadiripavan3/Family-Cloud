import { cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { ApiError } from '@/api/fetcher';
import { getVaultWaiting, giveVaultKeys, openVaultItem, useGetEmergency, useGetVault, useGetVaultAttention, useGetVaultHome } from '@/api/generated/homeport';
import { openMine } from '@/features/vault/crypto/seal';
import { isVaultUnlocked, lockVault, unlockVault } from '@/features/vault/session';
import { VaultHome } from '@/features/vault/VaultHome';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending } from '@/test/samples';
import { ALEX_KEY, ALEX_PUBLIC, attention, doorRow, emergency, ITEM_KEY, itemRow, NETFLIX, NORA_KEY, openedAnswer, vaultHome, vaultPerson, vaultRecord } from '@/test/samples/vault';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) };
const mockCache = { vaultEmergencyChanged: jest.fn(() => Promise.resolve()), vaultKeysGiven: jest.fn(() => Promise.resolve()) };
const mockKeeper = { keptHow: jest.fn(async () => 'passcode'), canAskThePhone: jest.fn(() => false) };
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useFocusEffect: jest.fn() }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
// (The phone's key keeper, by name, so each test can say what the phone holds.)
jest.mock('@/features/vault/keeper', () => new Proxy({}, { get: (_, name: string) => (...given: unknown[]) => (mockKeeper as unknown as Record<string, (...given: unknown[]) => unknown>)[name]?.(...given) }));
jest.mock('@/api/generated/homeport', () => ({
  useGetVault: jest.fn(),
  useGetVaultAttention: jest.fn(),
  useGetVaultHome: jest.fn(),
  useGetEmergency: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  refuseEmergency: jest.fn(),
  openVaultItem: jest.fn(),
  getVaultWaiting: jest.fn(),
  giveVaultKeys: jest.fn(),
}));

const mockLinds = linds;
const mockMe = loaded(me());
const home = jest.mocked(useGetVaultHome) as unknown as jest.Mock;
const needs = jest.mocked(useGetVaultAttention) as unknown as jest.Mock;
const arrangement = jest.mocked(useGetEmergency) as unknown as jest.Mock;

describe('9.2 The Vault', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (jest.mocked(useGetVault) as unknown as jest.Mock).mockReturnValue(loaded(vaultRecord()));
    home.mockReturnValue(loaded(vaultHome()));
    needs.mockReturnValue(loaded(attention()));
    arrangement.mockReturnValue(loaded(emergency()));
    unlockVault(NORA_KEY.slice());
  });
  // The screen goes first: locking under a screen that is still there would draw the locked page for nobody.
  afterEach(async () => {
    await cleanup();
    lockVault();
  });

  it('draws the six drawers with how many things are in each', async () => {
    await render(inApp(<VaultHome />));
    expect(home).toHaveBeenCalledWith('c-linds');
    for (const drawer of ['Logins, 31', 'Cards, 4', 'IDs, 9', 'Wi‑Fi, 2', 'Codes, 5', 'Secrets, 6']) expect(screen.getByRole('button', { name: drawer })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Codes, 5' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/vault/drawer/[category]', params: { category: 'code' } });
  });

  it('nudges about passwords that need a look, by what is wrong with them', async () => {
    await render(inApp(<VaultHome />));
    expect(screen.getByText('Two passwords need a look')).toBeOnTheScreen();
    expect(screen.getByText('One is used in more than one place. One showed up in a known leak.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: /^Two passwords need a look/ }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/vault/drawer/[category]', params: { category: 'look' } });
  });

  it('says nothing about a look when no password needs one', async () => {
    home.mockReturnValue(loaded(vaultHome({ needsALook: { total: 0, weak: 0, reused: 0, leaked: 0 } })));
    await render(inApp(<VaultHome />));
    expect(screen.queryByText(/need a look|needs a look/)).toBeNull();
    home.mockReturnValue(loaded(vaultHome({ needsALook: { total: 1, weak: 1, reused: 0, leaked: 0 } })));
    await render(inApp(<VaultHome />));
    expect(screen.getByText('One password needs a look')).toBeOnTheScreen();
    expect(screen.getByText('One is weak.')).toBeOnTheScreen();
  });

  it('lists what other people shared, with whose it is and what this person may do', async () => {
    await render(inApp(<VaultHome />));
    expect(screen.getByRole('button', { name: 'Shared with you. See all' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Netflix. From Alex · you can see it' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Front door code. Everyone in The Linds' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Netflix. From Alex · you can see it' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'vault-item', id: NETFLIX } });
  });

  it('says where a shared thing stands when it can not be opened right now', async () => {
    home.mockReturnValue(loaded(vaultHome({ sharedWithYou: [itemRow({ myState: 'waiting' }), { ...doorRow, chip: itemRow().chip, myState: 'used' }] })));
    await render(inApp(<VaultHome />));
    expect(screen.getByText('From Alex · waiting for their key')).toBeOnTheScreen();
    expect(screen.getByText('From Alex · opened once, gone now')).toBeOnTheScreen();
  });

  it('copies from the list without showing: the item is opened here, and only the password goes to the clipboard', async () => {
    jest.mocked(openVaultItem).mockResolvedValue(openedAnswer(undefined, { access: 'see' }));
    await render(inApp(<VaultHome />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Copy Netflix' }));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('p0pcorn!Friday#night', expect.anything()));
    expect(openVaultItem).toHaveBeenCalledWith(NETFLIX);
    expect(await screen.findByText(/^Copied\. The phone clears it from the clipboard after 60 seconds\.$/)).toBeOnTheScreen();
    expect(screen.queryByText('p0pcorn!Friday#night')).toBeNull();
  });

  it('says why when there is nothing it can copy: a sample item, or one whose key is not there', async () => {
    home.mockReturnValue(loaded(vaultHome({ sharedWithYou: [itemRow({ sample: true, myState: 'waiting' }), { ...doorRow, myState: 'stopped' }] })));
    await render(inApp(<VaultHome />));
    const user = userEvent.setup();
    // A sample item reads like the real thing would, and says what it is when pressed.
    expect(screen.getByText('From Alex · you can see it')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Copy Netflix' }));
    expect(await screen.findByText('Sample item: add your own to see the real thing.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Copy Front door code' }));
    expect(await screen.findByText('It has stopped working for you.')).toBeOnTheScreen();
    expect(openVaultItem).not.toHaveBeenCalled();
  });

  it('says when it will lock itself, and locks by hand', async () => {
    await render(inApp(<VaultHome />));
    expect(screen.getByText(/^Locks itself in (2:00|1:5\d)$/)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Lock the Vault now' }));
    expect(await screen.findByRole('header', { name: 'The Vault is locked' })).toBeOnTheScreen();
    expect(isVaultUnlocked()).toBe(false);
    expect(screen.queryByText(/^Locks itself in/)).toBeNull();
    expect(screen.queryByText('Netflix')).toBeNull();
  });

  it('leads to the Vault key, to emergency access and to the people this person helps', async () => {
    arrangement.mockReturnValue(loaded(emergency({ state: 'ready', trusted: vaultPerson(), waitHours: 48 })));
    await render(inApp(<VaultHome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Your Vault key. Saved · and who can help you back in' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/vault/key');
    await user.press(screen.getByRole('button', { name: 'If something happens. Alex can ask · 48 hours to say no' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/vault/emergency');
    await user.press(screen.getByRole('button', { name: 'People you help, people who trust you' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/vault/helping');
  });

  it('hands keys to people who were waiting, wrapped for each with the public key the API reports', async () => {
    needs.mockReturnValue(loaded(attention({ waitingForKeys: 1 })));
    jest.mocked(getVaultWaiting).mockResolvedValue([{ itemId: NETFLIX, title: 'Netflix', circleId: 'c-linds', memberId: 'm-alex', name: 'Alex Strand', avatarUrl: null, publicKey: ALEX_PUBLIC }]);
    jest.mocked(openVaultItem).mockResolvedValue(openedAnswer());
    jest.mocked(giveVaultKeys).mockResolvedValue({ itemId: NETFLIX, title: 'Netflix', audience: 'circle', everyone: 'see', mine: true, people: [] });
    await render(inApp(<VaultHome />));
    expect(screen.getByText('One person is waiting for a key from you')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Hand over. One person is waiting for a key from you' }));
    await waitFor(() => expect(mockCache.vaultKeysGiven).toHaveBeenCalled());
    const [item, sent] = jest.mocked(giveVaultKeys).mock.calls[0]!;
    expect(item).toBe(NETFLIX);
    expect(sent.keys).toHaveLength(1);
    expect(sent.keys[0]!.memberId).toBe('m-alex');
    // What was sent opens for Alex, and for nobody else, to the item's own key.
    expect(openMine(ALEX_KEY, sent.keys[0]!.wrappedKey!, 'item-key')).toEqual(ITEM_KEY);
    expect(() => openMine(NORA_KEY, sent.keys[0]!.wrappedKey!, 'item-key')).toThrow();
  });

  it('says what else needs this person: a helper who was asked, someone to help, a key that was never saved', async () => {
    (jest.mocked(useGetVault) as unknown as jest.Mock).mockReturnValue(loaded(vaultRecord({ keySaved: false })));
    const asks = { id: 'hp-1', person: vaultPerson({ name: 'Kai' }), state: 'asked' as const, askedAt: '2026-11-12T09:00:00Z', recovery: null };
    needs.mockReturnValue(loaded(attention({ helperAsks: [asks], helpNeeded: [{ ...asks, id: 'hp-2', person: vaultPerson({ name: 'Lea' }), state: 'accepted' }], sharesDue: true })));
    await render(inApp(<VaultHome />));
    expect(screen.getByText('Kai asks you to be a helper')).toBeOnTheScreen();
    expect(screen.getByText('Lea needs your help to get back in')).toBeOnTheScreen();
    expect(screen.getByText('Your helpers are waiting for their parts')).toBeOnTheScreen();
    expect(screen.getByText('Save your Vault key')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Answer. Kai asks you to be a helper' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/vault/helping');
    await user.press(screen.getByRole('button', { name: 'Show. Save your Vault key' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/vault/key');
  });

  it('with nothing in it yet, says so and offers to add the first thing', async () => {
    home.mockReturnValue(loaded(vaultHome({ drawers: vaultHome().drawers.map((drawer) => ({ ...drawer, items: 0 })), needsALook: { total: 0, weak: 0, reused: 0, leaked: 0 }, sharedWithYou: [], sharedWithYouCount: 0 })));
    await render(inApp(<VaultHome />));
    expect(screen.getByRole('button', { name: 'Logins, 0' })).toBeOnTheScreen();
    expect(screen.getByText('Nothing in your Vault yet')).toBeOnTheScreen();
    expect(screen.queryByText('Shared with you')).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add the first one' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/new/password');
  });

  it('shows that it is loading, and a problem with a way to try again', async () => {
    home.mockReturnValue(pending());
    const view = await render(inApp(<VaultHome />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    const problem = failed(new ApiError(500, 'unknown', 'Something went wrong on our side.'));
    home.mockReturnValue(problem);
    await view.rerender(inApp(<VaultHome />));
    expect(screen.getByText('Something went wrong on our side.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(problem.refetch).toHaveBeenCalled();
  });
});
