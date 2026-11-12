import { cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { changeVaultItem, createVaultItem, deleteThing, openVaultItem, useGetVault, useGetVaultItem } from '@/api/generated/homeport';
import NewPassword from '@/app/(app)/new/password';
import EditVaultItem from '@/app/(app)/vault/edit/[id]';
import { open, openMine } from '@/features/vault/crypto/seal';
import { decodeInside } from '@/features/vault/inside';
import { lockVault, rememberPassword, unlockVault } from '@/features/vault/session';
import { inApp } from '@/test/phone';
import { linds, loaded, me } from '@/test/samples';
import { ITEM_KEY, NETFLIX, NETFLIX_INSIDE, NORA_KEY, openedAnswer, vaultItem, vaultRecord } from '@/test/samples/vault';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), dismissAll: jest.fn(), canGoBack: jest.fn(() => true) };
const mockCache = { vaultItemMade: jest.fn(() => Promise.resolve()), vaultItemSaved: jest.fn(() => Promise.resolve()), vaultItemDeleted: jest.fn(() => Promise.resolve()) };
const mockKeeper = { keptHow: jest.fn(async () => 'passcode'), canAskThePhone: jest.fn(() => false) };
let mockGuard = false;
let mockParams: Record<string, string> = {};
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  usePreventRemove: (on: boolean) => {
    mockGuard = on;
    return jest.fn();
  },
}));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/vault/keeper', () => new Proxy({}, { get: (_, name: string) => (...given: unknown[]) => (mockKeeper as unknown as Record<string, (...given: unknown[]) => unknown>)[name]?.(...given) }));
jest.mock('@/api/generated/homeport', () => ({
  useGetVault: jest.fn(),
  useGetVaultItem: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  createVaultItem: jest.fn(),
  changeVaultItem: jest.fn(),
  openVaultItem: jest.fn(),
  deleteThing: jest.fn(),
}));

const mockLinds = linds;
const mockMe = loaded(me());

// These type a whole form letter by letter, which takes seconds when the machine is busy with other work.
jest.setTimeout(30000);

describe('adding to the Vault', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    (jest.mocked(useGetVault) as unknown as jest.Mock).mockReturnValue(loaded(vaultRecord()));
    jest.mocked(createVaultItem).mockImplementation(async (request) => vaultItem({ id: NETFLIX, title: request.title, category: request.category }));
    unlockVault(NORA_KEY.slice());
  });
  afterEach(async () => {
    await cleanup();
    lockVault();
  });

  it('offers the six kinds, each with its own fields', async () => {
    await render(inApp(<NewPassword />));
    expect(screen.getByRole('header', { name: 'New login' })).toBeOnTheScreen();
    for (const field of ['Title', 'Site', 'Email or username', 'Password', 'One-time code secret', 'Notes']) expect(screen.getByLabelText(field)).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Card' }));
    expect(screen.getByRole('header', { name: 'New card' })).toBeOnTheScreen();
    for (const field of ['Name on the card', 'Number', 'Valid until', 'Security code', 'PIN']) expect(screen.getByLabelText(field)).toBeOnTheScreen();
    await user.press(screen.getByRole('checkbox', { name: 'ID' }));
    expect(screen.getByLabelText('Number')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Runs out on: No date. Change' })).toBeOnTheScreen();
    await user.press(screen.getByRole('checkbox', { name: 'Wi‑Fi' }));
    for (const field of ['Network', 'Password']) expect(screen.getByLabelText(field)).toBeOnTheScreen();
    await user.press(screen.getByRole('checkbox', { name: 'Code' }));
    // (The kind's own chip is called "Code" too.)
    expect(screen.getAllByLabelText('Code')).toHaveLength(2);
    await user.press(screen.getByRole('checkbox', { name: 'Secret note' }));
    expect(screen.getAllByLabelText('Secret note')).toHaveLength(2);
    // Said under the two that are stored in the clear.
    expect(screen.getByText('The title and the line under it are stored unscrambled, so search and reminders work. Everything below is scrambled on this phone.')).toBeOnTheScreen();
    expect(screen.getByText('It starts as only yours. Share it from its own page.')).toBeOnTheScreen();
  });

  it('opens on the drawer it was started from', async () => {
    mockParams = { category: 'wifi' };
    await render(inApp(<NewPassword />));
    expect(screen.getByRole('header', { name: 'New Wi‑Fi network' })).toBeOnTheScreen();
  });

  it('scrambles what is typed with a key of its own before anything is sent: the API gets labels and one sealed piece', async () => {
    await render(inApp(<NewPassword />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Title'), 'Netflix');
    await user.type(screen.getByLabelText('Site'), 'netflix.com');
    await user.type(screen.getByLabelText('Email or username'), 'linds.home@example.com');
    await user.type(screen.getByLabelText('Password'), 'p0pcorn!Friday#night');
    await user.type(screen.getByLabelText('One-time code secret'), 'gezd gnbv gy3t qojq gezd gnbv gy3t qojq');
    expect(mockGuard).toBe(true);
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'vault-item', id: NETFLIX } }));

    const sent = jest.mocked(createVaultItem).mock.calls[0]![0];
    expect(sent).toMatchObject({ clientId: 'client-1', circleId: 'c-linds', title: 'Netflix', category: 'login', site: 'netflix.com', health: 'ok' });
    // Nothing that was typed below the label is in the request as it was typed.
    for (const secret of ['p0pcorn', 'linds.home', 'GEZDGNBV', 'gezd gnbv']) expect(JSON.stringify(sent)).not.toContain(secret);
    // The item's key is wrapped for its maker, and opens the piece to exactly what was typed.
    const itemKey = openMine(NORA_KEY, sent.wrappedKey, 'item-key');
    expect(decodeInside(open(itemKey, sent.ciphertext, 'item'))).toEqual(NETFLIX_INSIDE);
    expect(mockCache.vaultItemMade).toHaveBeenCalled();
  });

  it('makes a password of twenty characters on request, and shows it', async () => {
    await render(inApp(<NewPassword />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Make a strong password' }));
    const made = screen.getByLabelText('Password').props.value as string;
    expect(made).toMatch(/^[a-km-zA-HJ-NP-Z2-9!#$%&*+\-=?@^_]{20}$/);
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
  });

  it("judges the password as it is typed and sends the phone's verdict: weak, or the same as in another item opened since unlocking", async () => {
    rememberPassword('spotify', 'Spotify', 'p0pcorn!Friday#night');
    await render(inApp(<NewPassword />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Title'), 'Old forum');
    await user.type(screen.getByLabelText('Password'), 'sunshine');
    expect(screen.getByText('This one is weak: short, or all of one kind.')).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'p0pcorn!Friday#night');
    expect(screen.getByText('The same password is in “Spotify”.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(createVaultItem).toHaveBeenCalled());
    expect(jest.mocked(createVaultItem).mock.calls[0]![0].health).toBe('reused');
  });

  it('wants a title, and a one-time code secret that a code can be made from', async () => {
    await render(inApp(<NewPassword />));
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.type(screen.getByLabelText('Password'), 'p0pcorn!Friday#night');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Give it a title.')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Title'), 'Netflix');
    await user.type(screen.getByLabelText('One-time code secret'), 'not a secret!');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText("This secret isn't one a code can be made from")).toBeOnTheScreen();
    expect(createVaultItem).not.toHaveBeenCalled();
  });

  it("says what the API said when it refuses, and stays on the form", async () => {
    jest.mocked(createVaultItem).mockRejectedValue(new ApiError(400, 'too_many', 'A Vault holds 2,000 items at most.'));
    await render(inApp(<NewPassword />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Title'), 'Netflix');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('A Vault holds 2,000 items at most.')).toBeOnTheScreen();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('while the Vault is locked, asks to unlock first', async () => {
    lockVault();
    await render(inApp(<NewPassword />));
    expect(await screen.findByRole('button', { name: 'Unlock with your passcode' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });
});

describe('changing an item of the Vault', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: NETFLIX };
    (jest.mocked(useGetVault) as unknown as jest.Mock).mockReturnValue(loaded(vaultRecord()));
    (jest.mocked(useGetVaultItem) as unknown as jest.Mock).mockReturnValue(loaded(vaultItem()));
    jest.mocked(openVaultItem).mockImplementation(async () => openedAnswer(undefined, { version: 4 }));
    jest.mocked(changeVaultItem).mockImplementation(async () => vaultItem({ version: 5 }));
    unlockVault(NORA_KEY.slice());
  });
  afterEach(async () => {
    await cleanup();
    lockVault();
  });

  it('fills the form with what is inside, and seals the change with the same item key and the version that was read', async () => {
    await render(inApp(<EditVaultItem />));
    expect((await screen.findByLabelText('Password')).props.value).toBe('p0pcorn!Friday#night');
    expect(screen.getByLabelText('Title').props.value).toBe('Netflix');
    // A saved item stays in its drawer.
    expect(screen.queryByRole('checkbox', { name: 'Card' })).toBeNull();
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'n3w-After-the-leak!');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    const [id, sent] = jest.mocked(changeVaultItem).mock.calls[0]!;
    expect(id).toBe(NETFLIX);
    expect(sent).toMatchObject({ title: 'Netflix', site: 'netflix.com', version: 4, health: 'ok' });
    expect(decodeInside(open(ITEM_KEY, sent.ciphertext!, 'item')).fields).toEqual({ ...NETFLIX_INSIDE.fields, password: 'n3w-After-the-leak!' });
    expect(JSON.stringify(sent)).not.toContain('n3w-After');
    expect(mockCache.vaultItemSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 5 }));
  });

  it('says so when someone else saved meanwhile, and keeps what was typed', async () => {
    jest.mocked(changeVaultItem).mockRejectedValue(new ApiError(409, 'changed_meanwhile', 'Someone changed this while you had it open. Open it again, then make your change.'));
    await render(inApp(<EditVaultItem />));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Notes'), 'the family plan');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Someone changed this while you had it open. Open it again, then make your change.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Notes').props.value).toBe('the family plan');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('its owner can delete it, after being asked', async () => {
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(inApp(<EditVaultItem />));
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Delete this item' }));
    expect(screen.getByText('It is gone for you and for everyone it is shared with. What they copied before, they keep.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Delete it' }));
    await waitFor(() => expect(mockCache.vaultItemDeleted).toHaveBeenCalled());
    expect(deleteThing).toHaveBeenCalledWith(NETFLIX);
    expect(mockRouter.dismissAll).toHaveBeenCalled();
  });

  it("someone who may change it but doesn't own it is not offered to delete it", async () => {
    (jest.mocked(useGetVaultItem) as unknown as jest.Mock).mockReturnValue(loaded(vaultItem({ mine: false })));
    await render(inApp(<EditVaultItem />));
    await screen.findByLabelText('Password');
    expect(screen.queryByRole('button', { name: 'Delete this item' })).toBeNull();
  });
});
