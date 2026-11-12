import { cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { getEmergency, saveVaultSharing, useGetVaultSharing, type VaultShareChange } from '@/api/generated/homeport';
import { open, openMine } from '@/features/vault/crypto/seal';
import { decodeInside } from '@/features/vault/inside';
import { lockVault, unlockVault } from '@/features/vault/session';
import { ShareSheet } from '@/features/vault/ShareSheet';
import { addDays, today } from '@/lib/dates';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';
import { ALEX_KEY, emergency, ITEM_KEY, itemPerson, leaNoVault, miaNoPhone, NETFLIX, NETFLIX_INSIDE, NORA_KEY, noraOwns, sharing, vaultItem, vaultPerson } from '@/test/samples/vault';

const mockRouter = { push: jest.fn() };
const mockCache = { vaultItemShared: jest.fn(() => Promise.resolve()) };
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds] }));
jest.mock('@/api/generated/homeport', () => ({ useGetVaultSharing: jest.fn(), saveVaultSharing: jest.fn(), getEmergency: jest.fn() }));

const mockLinds = linds;
const asked = jest.mocked(useGetVaultSharing) as unknown as jest.Mock;
const onClose = jest.fn();
const onSaved = jest.fn();
const opened = { inside: NETFLIX_INSIDE, itemKey: ITEM_KEY, version: 1 };
/** Alex as someone the item isn't shared with yet. */
const alexNew = itemPerson({ access: null, state: null });
const sheet = (focus?: string) => inApp(<ShareSheet visible onClose={onClose} item={vaultItem()} opened={opened} focus={focus} onSaved={onSaved} />);
/** What the sheet sent. */
const sent = () => jest.mocked(saveVaultSharing).mock.calls[0]![1] as VaultShareChange;

describe('9.4 Share a secret', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(sharing({ people: [noraOwns, alexNew, miaNoPhone, leaNoVault] })));
    jest.mocked(saveVaultSharing).mockImplementation(async () => sharing());
    jest.mocked(getEmergency).mockResolvedValue(emergency());
    unlockVault(NORA_KEY.slice());
  });
  afterEach(async () => {
    await cleanup();
    lockVault();
  });

  it('shows the people of the circle, the three ways, and the two limits', async () => {
    await render(sheet());
    expect(screen.getByRole('header', { name: 'Share “Netflix”' })).toBeOnTheScreen();
    expect(asked).toHaveBeenCalledWith(NETFLIX, { query: { refetchOnMount: 'always', enabled: true } });
    for (const name of ['Alex', 'Mia', 'Lea']) expect(screen.getByRole('checkbox', { name: `Share with ${name}` })).not.toBeChecked();
    // Its owner is not among the people to share with.
    expect(screen.queryByRole('checkbox', { name: 'Share with Nora' })).toBeNull();
    expect(screen.getByRole('radio', { name: "Can use, can't keep. Shows once when needed, then hides again" })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Can see. Can look it up any time' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Can change. For another adult in the house' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: "Gone after it's opened once" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Stops working: Never. Change' })).toBeOnTheScreen();
  });

  it('says in the protocol\'s words that "can use" is a rule of the app, not of the mathematics', async () => {
    await render(sheet());
    expect(screen.getByText(/^“Can use, can't keep” is a rule of the app, not of the mathematics\. A phone that can fill a password in holds that password for that moment/)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('radio', { name: /^Can see/ }));
    expect(screen.queryByText(/is a rule of the app/)).toBeNull();
  });

  it("wraps the item's key for the person it is shared with, so that only they can open it, and saves all of it in one go", async () => {
    await render(sheet());
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Share with Alex' }));
    await user.press(screen.getByRole('radio', { name: /^Can see/ }));
    await user.press(screen.getByRole('button', { name: 'Share with 1 person' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(false));
    expect(saveVaultSharing).toHaveBeenCalledTimes(1);
    expect(jest.mocked(saveVaultSharing).mock.calls[0]![0]).toBe(NETFLIX);
    const change = sent();
    expect(change.audience).toBe('some');
    expect(change.rotation).toBeUndefined();
    expect(change.people).toHaveLength(1);
    expect(change.people![0]).toMatchObject({ memberId: 'm-alex', access: 'see', once: false });
    // What goes to the API is the key sealed for Alex: he opens it, Nora's own key doesn't, and it is not the key itself.
    const wrapped = change.people![0]!.wrappedKey!;
    expect(openMine(ALEX_KEY, wrapped, 'item-key')).toEqual(ITEM_KEY);
    expect(() => openMine(NORA_KEY, wrapped, 'item-key')).toThrow();
    expect(JSON.stringify(change)).not.toContain(Buffer.from(ITEM_KEY).toString('base64url'));
    expect(mockCache.vaultItemShared).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('can vanish after one look, and can stop working on an evening', async () => {
    await render(sheet());
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Share with Alex' }));
    await user.press(screen.getByRole('switch', { name: "Gone after it's opened once" }));
    await user.press(screen.getByRole('button', { name: 'Stops working: Never. Change' }));
    expect(screen.getByRole('header', { name: 'The day it stops working' })).toBeOnTheScreen();
    const day = addDays(today(), 3);
    await user.press(screen.getByRole('button', { name: new RegExp(`^${Number(day.slice(8))} `) }));
    expect(screen.getByRole('button', { name: /^Stops working: \w{3} \d+ \w{3} evening\. Change$/ })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Share with 1 person' }));
    await waitFor(() => expect(saveVaultSharing).toHaveBeenCalled());
    const person = sent().people![0]!;
    expect(person.once).toBe(true);
    expect(person.access).toBe('use');
    const stops = new Date(person.stopsAt!);
    expect([stops.getFullYear(), stops.getMonth() + 1, stops.getDate(), stops.getHours()]).toEqual([Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8)), 22]);
  });

  it('"can change" can\'t be for one look only', async () => {
    await render(sheet());
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Share with Alex' }));
    await user.press(screen.getByRole('switch', { name: "Gone after it's opened once" }));
    await user.press(screen.getByRole('radio', { name: /^Can change/ }));
    expect(screen.getByRole('switch', { name: "Gone after it's opened once" })).not.toBeChecked();
    await user.press(screen.getByRole('button', { name: 'Share with 1 person' }));
    await waitFor(() => expect(saveVaultSharing).toHaveBeenCalled());
    expect(sent().people![0]).toMatchObject({ access: 'change', once: false });
  });

  it("someone who hasn't opened their Vault yet can be named: they wait for a key, and the sheet says so", async () => {
    await render(sheet());
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Share with Lea' }));
    expect(screen.getByText("Lea hasn't opened their Vault yet. They get it once they have, the next time your Vault is open.")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Share with 1 person' }));
    await waitFor(() => expect(saveVaultSharing).toHaveBeenCalled());
    expect(sent().people![0]).toMatchObject({ memberId: 'm-lea', access: 'use' });
    expect(sent().people![0]!.wrappedKey).toBeUndefined();
  });

  it('someone without a sign-in of their own can not be shared with, and the sheet says why', async () => {
    await render(sheet());
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Share with Mia' }));
    expect(screen.getByText('Mia has no sign-in of their own, so nothing can be sealed for them. That needs a phone of their own.')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Share with Mia' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Stop sharing' })).toBeOnTheScreen();
  });

  it('starts from who has it now, and someone who keeps a working key is not sent a new one', async () => {
    asked.mockReturnValue(loaded(sharing({ people: [noraOwns, itemPerson({ access: 'see', state: 'ready' }), { ...leaNoVault, publicKey: itemPerson().publicKey, missing: null }] })));
    await render(sheet());
    expect(screen.getByRole('checkbox', { name: 'Share with Alex' })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Can see/ })).toBeChecked();
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Share with Lea' }));
    await user.press(screen.getByRole('button', { name: 'Share with 2 people' }));
    await waitFor(() => expect(saveVaultSharing).toHaveBeenCalled());
    const [alex, lea] = sent().people!;
    expect(alex).toMatchObject({ memberId: 'm-alex', access: 'see' });
    expect(alex!.wrappedKey).toBeUndefined();
    expect(lea!.wrappedKey).toMatch(/^[A-Za-z0-9_-]{140}$/);
    expect(sent().rotation).toBeUndefined();
  });

  it('taking it away from someone who has had it gives the item a new key in the same request', async () => {
    asked.mockReturnValue(loaded(sharing({ people: [noraOwns, itemPerson({ access: 'see', state: 'ready' })] })));
    await render(sheet());
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Share with Alex' }));
    expect(screen.getByText(/^Alex may have kept what they saw\. The item gets a new key now, so the key they held opens nothing that is stored from here on\./)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Stop sharing' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(true));
    const change = sent();
    expect(change.audience).toBe('me');
    expect(change.people).toEqual([]);
    expect(change.rotation!.version).toBe(1);
    // A fresh key: wrapped for the owner, and the item sealed again with it. The old key opens nothing new.
    const newKey = openMine(NORA_KEY, change.rotation!.myWrappedKey!, 'item-key');
    expect(newKey).not.toEqual(ITEM_KEY);
    expect(decodeInside(open(newKey, change.rotation!.ciphertext!, 'item'))).toEqual(NETFLIX_INSIDE);
    expect(() => open(ITEM_KEY, change.rotation!.ciphertext!, 'item')).toThrow();
    expect(change.rotation!.emergencyWrappedKey).toBeUndefined();
  });

  it('when the item opens to the trusted person in an emergency, its new key is wrapped for them as well', async () => {
    asked.mockReturnValue(loaded(sharing({ people: [noraOwns, itemPerson({ memberId: 'm-lea', name: 'Lea', access: 'use', state: 'used' })] })));
    jest.mocked(getEmergency).mockResolvedValue(emergency({ state: 'ready', trusted: vaultPerson(), items: [{ id: NETFLIX, title: 'Netflix', category: 'login' }] }));
    await render(sheet());
    // Someone whose one look has happened is no longer ticked; saving without them takes the item away for good.
    expect(screen.getByRole('checkbox', { name: 'Share with Lea' })).not.toBeChecked();
    expect(screen.getByText('Lea opened it once, and it is gone for them. Tick them to share it again.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Stop sharing' }));
    await waitFor(() => expect(saveVaultSharing).toHaveBeenCalled());
    const rotation = sent().rotation!;
    const newKey = openMine(NORA_KEY, rotation.myWrappedKey!, 'item-key');
    expect(openMine(ALEX_KEY, rotation.emergencyWrappedKey!, 'escrow-key')).toEqual(newKey);
  });

  it('opened from one person\'s row, it is about them only, and everyone else keeps what they have', async () => {
    const lea = itemPerson({ memberId: 'm-lea', name: 'Lea', access: 'use', once: true, state: 'ready' });
    asked.mockReturnValue(loaded(sharing({ people: [noraOwns, itemPerson({ access: 'see', state: 'ready' }), lea] })));
    await render(sheet('m-alex'));
    expect(screen.getByRole('header', { name: 'Alex and “Netflix”' })).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'Share with Lea' })).toBeNull();
    const user = userEvent.setup();
    await user.press(screen.getByRole('radio', { name: /^Can change/ }));
    await user.press(screen.getByRole('button', { name: 'Share with 1 person' }));
    await waitFor(() => expect(saveVaultSharing).toHaveBeenCalled());
    expect(sent().people).toEqual([
      { memberId: 'm-lea', access: 'use', once: true, stopsAt: undefined, wrappedKey: undefined },
      { memberId: 'm-alex', access: 'change', once: false, stopsAt: undefined, wrappedKey: undefined },
    ]);
    expect(sent().rotation).toBeUndefined();
  });

  it('points to a guest pass for someone outside the circle', async () => {
    await render(sheet());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Someone outside the circle' }));
    expect(screen.getByText(/^A sitter or a friend gets a guest pass with a sealed card/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Make a guest pass' }));
    expect(onClose).toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith('/guest-pass/new');
  });

  it("says what the API said when it refuses, and changes nothing on screen", async () => {
    jest.mocked(saveVaultSharing).mockRejectedValue(new ApiError(400, 'no_vault', "Alex hasn't set up a Vault yet, so nothing can be sealed for them."));
    await render(sheet());
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Share with Alex' }));
    await user.press(screen.getByRole('button', { name: 'Share with 1 person' }));
    expect(await screen.findByText("Alex hasn't set up a Vault yet, so nothing can be sealed for them.")).toBeOnTheScreen();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows that it is loading, and a problem with a way to try again', async () => {
    asked.mockReturnValue(pending());
    const view = await render(sheet());
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Share with|^Stop sharing/ })).toBeNull();
    const problem = failed(new ApiError(500, 'unknown', 'Something went wrong on our side.'));
    asked.mockReturnValue(problem);
    await view.rerender(sheet());
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(problem.refetch).toHaveBeenCalled();
  });
});
