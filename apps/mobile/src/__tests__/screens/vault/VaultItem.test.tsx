import { act, cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { ApiError } from '@/api/fetcher';
import { openVaultItem, useGetVault, useGetVaultItem, useGetVaultSharing } from '@/api/generated/homeport';
import VaultItem from '@/app/(app)/vault-item/[id]';
import { totp } from '@/features/vault/crypto/totp';
import { lockVault, rememberPassword, unlockVault } from '@/features/vault/session';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, pending } from '@/test/samples';
import { ALEX_KEY, itemPerson, NETFLIX, NETFLIX_INSIDE, NORA_KEY, noraOwns, openedAnswer, vaultItem, vaultRecord } from '@/test/samples/vault';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { vaultItemOpened: jest.fn(() => Promise.resolve()), vaultItemShared: jest.fn(() => Promise.resolve()) };
const mockKeeper = { keptHow: jest.fn(async () => 'passcode'), canAskThePhone: jest.fn(() => false) };
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }), useFocusEffect: jest.fn() }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
// "Ask to see it", under an item that can't be opened, is Activity's own piece and has its own test.
jest.mock('@/features/activity/AskToSee', () => ({ AskToSee: () => null }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/vault/keeper', () => new Proxy({}, { get: (_, name: string) => (...given: unknown[]) => (mockKeeper as unknown as Record<string, (...given: unknown[]) => unknown>)[name]?.(...given) }));
jest.mock('@/api/generated/homeport', () => ({
  useGetVault: jest.fn(),
  useGetVaultItem: jest.fn(),
  useGetVaultSharing: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  openVaultItem: jest.fn(),
  saveVaultSharing: jest.fn(),
  getEmergency: jest.fn(),
}));

const mockId = NETFLIX;
const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetVaultItem) as unknown as jest.Mock;
const PASSWORD = NETFLIX_INSIDE.fields.password!;
/** Someone else's item, as the person it is shared with sees it. */
const fromAlex = (over = {}) =>
  vaultItem({ mine: false, canEdit: false, owner: { memberId: 'm-alex', name: 'Alex Strand', avatarUrl: null }, myAccess: 'see', people: [itemPerson({ owner: true, access: 'change' }), { ...noraOwns, owner: false, access: 'see' }], ...over });

describe('9.3 A password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (jest.mocked(useGetVault) as unknown as jest.Mock).mockReturnValue(loaded(vaultRecord()));
    (jest.mocked(useGetVaultSharing) as unknown as jest.Mock).mockReturnValue(pending());
    asked.mockReturnValue(loaded(vaultItem()));
    jest.mocked(openVaultItem).mockImplementation(async () => openedAnswer());
    unlockVault(NORA_KEY.slice());
  });
  // The screen goes first: locking under a screen that is still there would draw the locked page for nobody.
  afterEach(async () => {
    await cleanup();
    lockVault();
  });

  it('opens the item on this phone and shows what is inside, the password as dots', async () => {
    await render(inApp(<VaultItem />));
    expect(asked).toHaveBeenCalledWith(NETFLIX, { query: { refetchOnMount: 'always' } });
    expect(screen.getByRole('header', { name: 'Netflix' })).toBeOnTheScreen();
    expect(screen.getByText('Login · netflix.com')).toBeOnTheScreen();
    expect(await screen.findByText('linds.home@example.com')).toBeOnTheScreen();
    expect(openVaultItem).toHaveBeenCalledWith(NETFLIX);
    // An address is called "Email".
    expect(screen.getByLabelText('Email. linds.home@example.com')).toBeOnTheScreen();
    expect(screen.getByText('••••••••••••••')).toBeOnTheScreen();
    expect(screen.queryByText(PASSWORD)).toBeNull();
    // Nor does a screen reader hear it.
    expect(screen.queryByLabelText(new RegExp(PASSWORD.replace(/[!#]/g, '.')))).toBeNull();
  });

  it('shows the password with the eye, and hides it again', async () => {
    await render(inApp(<VaultItem />));
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Show password' }));
    expect(screen.getByText(PASSWORD)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.queryByText(PASSWORD)).toBeNull();
  });

  it('copies without showing, and says when the clipboard is cleared', async () => {
    await render(inApp(<VaultItem />));
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Copy password' }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(PASSWORD, expect.objectContaining({ ios: expect.objectContaining({ localOnly: true }), android: { isSensitive: true } }));
    expect(await screen.findByText('Copied. The phone clears it from the clipboard after 60 seconds.')).toBeOnTheScreen();
    expect(screen.queryByText(PASSWORD)).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Copy email' }));
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith('linds.home@example.com', expect.anything());
  });

  it('works out the one-time code of this moment, and copies it', async () => {
    await render(inApp(<VaultItem />));
    const shown = await screen.findByText(/^\d{3} \d{3}$/);
    const code = String(shown.props.children).replace(' ', '');
    // Around a half-minute boundary the code may be the one before or the one after.
    expect([-30_000, 0, 30_000].map((shift) => totp(NETFLIX_INSIDE.fields.totp!, Date.now() + shift))).toContain(code);
    // The secret the code is made from is never on the screen.
    expect(screen.queryByText(NETFLIX_INSIDE.fields.totp!)).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Copy one-time code' }));
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(code, expect.anything());
  });

  it('says who can use it, and lets its owner change what each person may do', async () => {
    await render(inApp(<VaultItem />));
    await screen.findByText('linds.home@example.com');
    expect(screen.getByText('Who can use it')).toBeOnTheScreen();
    expect(screen.getByText('You')).toBeOnTheScreen();
    expect(screen.getByText("It's yours")).toBeOnTheScreen();
    expect(screen.getByText('Alex')).toBeOnTheScreen();
    expect(screen.getByText('Can look it up any time')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Alex: Can see. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Share with someone. To use, to see or to change' })).toBeOnTheScreen();
  });

  it('says where each person stands: changed it, has it for one look, waits, opened it once', async () => {
    const people = [
      noraOwns,
      itemPerson({ changedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), access: 'change' }),
      itemPerson({ memberId: 'm-lea', name: 'Lea', once: true }),
      itemPerson({ memberId: 'm-kai', name: 'Kai', state: 'waiting', publicKey: null, missing: 'no_vault' }),
      itemPerson({ memberId: 'm-ines', name: 'Ines', state: 'used', once: true, access: 'use' }),
    ];
    asked.mockReturnValue(loaded(vaultItem({ people })));
    await render(inApp(<VaultItem />));
    await screen.findByText('linds.home@example.com');
    expect(screen.getByText('Changed it 3h ago')).toBeOnTheScreen();
    expect(screen.getByText('Gone for them after one look')).toBeOnTheScreen();
    expect(screen.getByText("Hasn't opened their Vault yet")).toBeOnTheScreen();
    expect(screen.getByText('Opened it once. It is gone for them')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Alex: Can change. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ines: Can use. Change' })).toBeOnTheScreen();
  });

  it("gives the phone's verdict on the password, and says plainly that nothing checks for leaks", async () => {
    await render(inApp(<VaultItem />));
    expect(await screen.findByText('Strong, and not used twice')).toBeOnTheScreen();
    expect(screen.getByText('20 characters. Compared with the other passwords you opened since unlocking. Not checked against known leaks: no leak check is connected yet.')).toBeOnTheScreen();
  });

  it('calls a short password weak', async () => {
    jest.mocked(openVaultItem).mockImplementation(async () => openedAnswer({ ...NETFLIX_INSIDE, fields: { password: 'sunshine' } }));
    await render(inApp(<VaultItem />));
    expect(await screen.findByText('This password is weak')).toBeOnTheScreen();
    expect(screen.getByText(/^8 characters\. Longer and more mixed is stronger.*no leak check is connected yet\.$/)).toBeOnTheScreen();
  });

  it('notices the same password in another item opened since unlocking, and names it', async () => {
    rememberPassword('another-item', 'Spotify', PASSWORD);
    await render(inApp(<VaultItem />));
    expect(await screen.findByText('Used somewhere else too')).toBeOnTheScreen();
    expect(screen.getByText(/^The same password is in “Spotify”\. One leak would open all of them\./)).toBeOnTheScreen();
  });

  it('offers Edit to whoever may change it', async () => {
    await render(inApp(<VaultItem />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Edit' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/vault/edit/[id]', params: { id: NETFLIX } });
  });

  describe('shared with this person', () => {
    it('to see: no Edit, no way to change who has it, and the same password', async () => {
      asked.mockReturnValue(loaded(fromAlex()));
      jest.mocked(openVaultItem).mockImplementation(async () => openedAnswer(undefined, { access: 'see' }));
      await render(inApp(<VaultItem />));
      await userEvent.setup().press(await screen.findByRole('button', { name: 'Show password' }));
      expect(screen.getByText(PASSWORD)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
      expect(screen.queryByRole('button', { name: /Change$/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /^Share with someone/ })).toBeNull();
      expect(screen.getByText('It is theirs')).toBeOnTheScreen();
      // Under the person's own name the line speaks to them.
      expect(screen.getByText('You can look it up any time')).toBeOnTheScreen();
    });

    it('to use: the app never shows it, offers "copy once", and says in plain words that this is a rule of the app', async () => {
      asked.mockReturnValue(loaded(fromAlex({ myAccess: 'use', people: [itemPerson({ owner: true, access: 'change' }), { ...noraOwns, owner: false, access: 'use' }] })));
      jest.mocked(openVaultItem).mockImplementation(async () => openedAnswer(undefined, { access: 'use' }));
      await render(inApp(<VaultItem />));
      const copy = await screen.findByRole('button', { name: 'Copy password once' });
      expect(screen.queryByRole('button', { name: 'Show password' })).toBeNull();
      expect(screen.queryByText(PASSWORD)).toBeNull();
      expect(screen.getByText('You can use this, not see it')).toBeOnTheScreen();
      expect(screen.getByText('The app never shows it to you')).toBeOnTheScreen();
      expect(screen.getByText("“Can use, can't keep” is a rule of this app, not of the mathematics. Your phone holds the password for the moment it copies it; the app never shows it and offers only “copy once”.")).toBeOnTheScreen();
      // No verdict either: its length would say something about it.
      expect(screen.queryByText('Strong, and not used twice')).toBeNull();
      const user = userEvent.setup();
      await user.press(copy);
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(PASSWORD, expect.anything());
      // Once per visit.
      await user.press(screen.getByRole('button', { name: 'Copy password once' }));
      expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(PASSWORD)).toBeNull();
    });

    it('for one look: it is not opened until the person says so, and then says that this was the look', async () => {
      asked.mockReturnValue(loaded(fromAlex({ once: true })));
      jest.mocked(openVaultItem).mockImplementation(async () => openedAnswer(undefined, { access: 'see', once: true }));
      await render(inApp(<VaultItem />));
      expect(screen.getByText('You can open this once')).toBeOnTheScreen();
      expect(screen.getByText('Alex shared it for one look. After you open it, the service erases your key for it.')).toBeOnTheScreen();
      expect(openVaultItem).not.toHaveBeenCalled();
      await userEvent.setup().press(screen.getByRole('button', { name: 'Open it now' }));
      expect(await screen.findByText('This was the one look')).toBeOnTheScreen();
      expect(openVaultItem).toHaveBeenCalledTimes(1);
      expect(mockCache.vaultItemOpened).toHaveBeenCalled();
      expect(screen.getByText('linds.home@example.com')).toBeOnTheScreen();
    });

    it('says so when the look has happened, when its key has not arrived, and when it has stopped', async () => {
      asked.mockReturnValue(loaded(fromAlex({ myState: 'used', once: true })));
      const view = await render(inApp(<VaultItem />));
      expect(screen.getByText('You opened this once')).toBeOnTheScreen();
      asked.mockReturnValue(loaded(fromAlex({ myState: 'waiting' })));
      await view.rerender(inApp(<VaultItem />));
      expect(screen.getByText('Waiting for a key')).toBeOnTheScreen();
      expect(screen.getByText('Alex shared this with you. Their phone hands you the key the next time their Vault is open.')).toBeOnTheScreen();
      asked.mockReturnValue(loaded(fromAlex({ myState: 'stopped' })));
      await view.rerender(inApp(<VaultItem />));
      expect(screen.getByText('It has stopped working')).toBeOnTheScreen();
      expect(openVaultItem).not.toHaveBeenCalled();
    });
  });

  it('shows a sample item as what it is: never scrambled, nothing to open', async () => {
    asked.mockReturnValue(loaded(vaultItem({ sample: true, myState: 'waiting' })));
    await render(inApp(<VaultItem />));
    expect(screen.getByText('Sample item')).toBeOnTheScreen();
    expect(screen.getByText(/^Add your own to see the real thing\./)).toBeOnTheScreen();
    expect(openVaultItem).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('says so when the labels in the clear are not the ones sealed inside', async () => {
    asked.mockReturnValue(loaded(vaultItem({ title: 'Bank', site: 'bank.example', glance: 'Login · bank.example' })));
    await render(inApp(<VaultItem />));
    expect(await screen.findByText('The label on this was changed')).toBeOnTheScreen();
    expect(screen.getByText('Someone changed its title or site without its key. Inside, it says “Netflix” and “netflix.com”. Believe the inside.')).toBeOnTheScreen();
  });

  it("says so when it doesn't open with this person's key, and shows nothing", async () => {
    jest.mocked(openVaultItem).mockImplementation(async () => openedAnswer(undefined, {}, ALEX_KEY));
    await render(inApp(<VaultItem />));
    expect(await screen.findByText("This didn't open with your key. It may have been changed by someone without its key.")).toBeOnTheScreen();
    expect(screen.queryByText('linds.home@example.com')).toBeNull();
  });

  it('while the Vault is locked, shows the locked page and asks the API for nothing', async () => {
    lockVault();
    await render(inApp(<VaultItem />));
    expect(await screen.findByRole('button', { name: 'Unlock with your passcode' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'The Vault is locked' })).toBeOnTheScreen();
    expect(openVaultItem).not.toHaveBeenCalled();
    expect(screen.queryByText('Netflix')).toBeNull();
  });

  it('lets go of what it showed the moment the Vault locks', async () => {
    await render(inApp(<VaultItem />));
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Show password' }));
    expect(screen.getByText(PASSWORD)).toBeOnTheScreen();
    await act(async () => lockVault());
    await waitFor(() => expect(screen.queryByText(PASSWORD)).toBeNull());
    expect(screen.queryByText('linds.home@example.com')).toBeNull();
    expect(screen.getByRole('header', { name: 'The Vault is locked' })).toBeOnTheScreen();
  });

  it("says so when the item isn't there, or isn't shared with this person any more", async () => {
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "This isn't here any more, or it isn't shared with you.")));
    await render(inApp(<VaultItem />));
    expect(screen.getByText("This isn't available")).toBeOnTheScreen();
    expect(screen.getByText("This isn't here any more, or it isn't shared with you.")).toBeOnTheScreen();
    expect(openVaultItem).not.toHaveBeenCalled();
  });

  it('shows that it is loading', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<VaultItem />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });
});
