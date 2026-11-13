import { cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { openVaultItem, refuseEmergency, saveEmergency, switchOffEmergency, useGetEmergency, useGetMyVaultItemsInfinite, useGetVault, useGetVaultPeople } from '@/api/generated/homeport';
import EmergencyAccess from '@/app/(app)/vault/emergency';
import { fromUtf8, utf8 } from '@/features/vault/crypto/bytes';
import { openMine, publicKeyOf, sealFor } from '@/features/vault/crypto/seal';
import { lockVault, unlockVault } from '@/features/vault/session';
import { inApp } from '@/test/phone';
import { failed, loaded, me, pending } from '@/test/samples';
import { ALEX_KEY, emergency, ITEM_KEY, itemRow, NETFLIX, NORA_KEY, openedAnswer, vaultPerson, vaultRecord } from '@/test/samples/vault';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) };
const mockCache = { vaultEmergencyChanged: jest.fn(() => Promise.resolve()) };
const mockKeeper = { keptHow: jest.fn(async () => 'passcode'), canAskThePhone: jest.fn(() => false) };
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/api/pages', () => ({ ...jest.requireActual('@/api/pages'), useEveryPage: jest.fn() }));
jest.mock('@/features/vault/keeper', () => new Proxy({}, { get: (_, name: string) => (...given: unknown[]) => (mockKeeper as unknown as Record<string, (...given: unknown[]) => unknown>)[name]?.(...given) }));
jest.mock('@/api/generated/homeport', () => ({
  useGetVault: jest.fn(),
  useGetEmergency: jest.fn(),
  useGetVaultPeople: jest.fn(),
  useGetMyVaultItemsInfinite: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  openVaultItem: jest.fn(),
  saveEmergency: jest.fn(),
  refuseEmergency: jest.fn(),
  switchOffEmergency: jest.fn(),
}));

const mockMe = loaded(me());
const asked = jest.mocked(useGetEmergency) as unknown as jest.Mock;
const NOTE = 'The will is in the blue folder. Call Jonas at the notary first.';
const mine = [itemRow({ mine: true, title: 'Bank', id: NETFLIX, glance: 'Login · bank.example', owner: { memberId: 'm-nora', name: 'Nora Lind', avatarUrl: null } }), itemRow({ mine: true, id: 'sample-1', title: 'Old email', sample: true })];
const on = (over = {}) => emergency({ state: 'ready', trusted: vaultPerson(), items: [{ id: NETFLIX, title: 'Bank', category: 'login' }], noteMine: sealFor(publicKeyOf(NORA_KEY), utf8(NOTE), 'own-note'), ...over });

describe('9.5 If something happens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (jest.mocked(useGetVault) as unknown as jest.Mock).mockReturnValue(loaded(vaultRecord()));
    asked.mockReturnValue(loaded(emergency()));
    (jest.mocked(useGetVaultPeople) as unknown as jest.Mock).mockReturnValue(loaded([vaultPerson(), vaultPerson({ memberId: 'm-lea', name: 'Lea', hasVault: false, publicKey: null })]));
    (jest.mocked(useGetMyVaultItemsInfinite) as unknown as jest.Mock).mockReturnValue({ ...loaded({ pages: [{ items: mine, nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    jest.mocked(openVaultItem).mockImplementation(async () => openedAnswer());
    jest.mocked(saveEmergency).mockImplementation(async () => on());
    unlockVault(NORA_KEY.slice());
  });
  afterEach(async () => {
    await cleanup();
    lockVault();
  });

  it('says what it is, in three steps, and that until then the trusted person sees none of it', async () => {
    await render(inApp(<EmergencyAccess />));
    expect(screen.getByRole('header', { name: 'If something happens to you' })).toBeOnTheScreen();
    expect(screen.getByText('none of it')).toBeOnTheScreen();
    expect(screen.getByText('They ask')).toBeOnTheScreen();
    expect(screen.getByText('You have 48 hours to say no')).toBeOnTheScreen();
    expect(screen.getByText('It opens to them')).toBeOnTheScreen();
    // Nothing can be turned on before someone is chosen.
    expect(screen.getByRole('button', { name: 'Turn it on' })).toBeDisabled();
    expect(screen.getByText('Choose the person first.')).toBeOnTheScreen();
    expect(asked).toHaveBeenCalledWith({ query: { refetchOnMount: 'always' } });
  });

  it('the person is someone from the circles who has a Vault; someone without one can not be chosen yet', async () => {
    await render(inApp(<EmergencyAccess />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Choose someone you trust. The person who can ask' }));
    expect(screen.getByRole('header', { name: 'Who can ask?' })).toBeOnTheScreen();
    expect(screen.getByText("Hasn't opened their Vault yet")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Alex Strand' }));
    expect(screen.getByText('Alex asks')).toBeOnTheScreen();
    expect(screen.getByText('It opens to Alex')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Turn it on' })).toBeEnabled();
    expect(screen.getByText('You can change the person or switch it off whenever you like.')).toBeOnTheScreen();
  });

  it("makes the escrow on this phone: each chosen item's key wrapped for the trusted person, the note sealed for them and once more for its writer", async () => {
    await render(inApp(<EmergencyAccess />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Choose someone you trust. The person who can ask' }));
    await user.press(screen.getByRole('button', { name: 'Alex Strand' }));
    await user.press(screen.getByRole('button', { name: 'Time to say no. 48 hours' }));
    await user.press(screen.getByRole('button', { name: '3 days · 72 hours' }));
    expect(screen.getByText('You have 72 hours to say no')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'What opens. Nothing chosen yet' }));
    // Only real items of one's own can be set aside: a sample item is not offered.
    expect(screen.queryByRole('checkbox', { name: 'Include Old email' })).toBeNull();
    await user.press(screen.getByRole('checkbox', { name: 'Include Bank' }));
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Bank, 1 thing')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'A note for the family. Where the will is, who to call, what to cancel' }));
    await user.type(screen.getByLabelText('A note for the family'), NOTE);
    await user.press(screen.getByRole('button', { name: 'Done' }));
    await user.press(screen.getByRole('button', { name: 'Turn it on' }));
    await waitFor(() => expect(mockCache.vaultEmergencyChanged).toHaveBeenCalled());

    const sent = jest.mocked(saveEmergency).mock.calls[0]![0];
    expect(sent.trustedMemberId).toBe('m-alex');
    expect(sent.waitHours).toBe(72);
    expect(sent.items).toHaveLength(1);
    expect(sent.items![0]!.id).toBe(NETFLIX);
    // Alex's key opens the item's key and the note, as what they are and nothing else. Nora's own copy of the note opens for her.
    expect(openMine(ALEX_KEY, sent.items![0]!.wrappedKey!, 'escrow-key')).toEqual(ITEM_KEY);
    expect(() => openMine(ALEX_KEY, sent.items![0]!.wrappedKey!, 'item-key')).toThrow();
    expect(fromUtf8(openMine(ALEX_KEY, sent.note!, 'escrow-note'))).toBe(NOTE);
    expect(fromUtf8(openMine(NORA_KEY, sent.noteMine!, 'own-note'))).toBe(NOTE);
    expect(() => openMine(NORA_KEY, sent.note!, 'escrow-note')).toThrow();
    // Nothing went out in the clear.
    expect(JSON.stringify(sent)).not.toContain('blue folder');
    expect(JSON.stringify(sent)).not.toContain(Buffer.from(ITEM_KEY).toString('base64url'));
  });

  it('once it is on, shows what was chosen, reads its own note back, and says so', async () => {
    asked.mockReturnValue(loaded(on()));
    await render(inApp(<EmergencyAccess />));
    expect(screen.getByText('It is on. Alex can ask.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Alex Strand. The person who can ask' })).toBeOnTheScreen();
    expect(screen.getByText('Bank, 1 thing')).toBeOnTheScreen();
    expect(screen.getByText('Written')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'A note for the family. Written' }));
    expect(screen.getByLabelText('A note for the family').props.value).toBe(NOTE);
    // Nothing to save until something is changed.
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    await user.type(screen.getByLabelText('A note for the family'), ' And feed the cat.');
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeOnTheScreen();
  });

  it('when the trusted person asked, says when it opens and lets the owner say no', async () => {
    // (Five days off, so the day is said by its date at whatever hour the tests run, not as "tomorrow".)
    asked.mockReturnValue(loaded(on({ state: 'asked', askedAt: new Date().toISOString(), opensAt: new Date(Date.now() + 5 * 86_400_000).toISOString() })));
    jest.mocked(refuseEmergency).mockResolvedValue(on());
    await render(inApp(<EmergencyAccess />));
    expect(screen.getByText('Alex asked')).toBeOnTheScreen();
    expect(screen.getByText(/^It opens to them on \w{3} \d{1,2} \w{3} at \d\d:\d\d unless you say no\. Saying no ends this request, not the arrangement/)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Say no' }));
    await waitFor(() => expect(mockCache.vaultEmergencyChanged).toHaveBeenCalledWith(expect.objectContaining({ state: 'ready' })));
    expect(refuseEmergency).toHaveBeenCalled();
  });

  it('once it has opened, says so, and can be switched off: what was set aside is deleted', async () => {
    asked.mockReturnValue(loaded(on({ state: 'open', openedAt: '2026-11-14T10:00:00Z' })));
    jest.mocked(switchOffEmergency).mockResolvedValue(undefined);
    await render(inApp(<EmergencyAccess />));
    expect(screen.getByText('It is open to Alex')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Switch it off' }));
    expect(screen.getByText('Alex can no longer ask, and what was set aside for them is deleted.')).toBeOnTheScreen();
    await user.press(screen.getAllByRole('button', { name: 'Switch it off' }).at(-1)!);
    await waitFor(() => expect(switchOffEmergency).toHaveBeenCalled());
    expect(mockCache.vaultEmergencyChanged).toHaveBeenCalledWith();
  });

  it("says what the API said when it refuses", async () => {
    jest.mocked(saveEmergency).mockRejectedValue(new ApiError(400, 'no_vault', "Alex hasn't set up a Vault yet."));
    await render(inApp(<EmergencyAccess />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Choose someone you trust. The person who can ask' }));
    await user.press(screen.getByRole('button', { name: 'Alex Strand' }));
    await user.press(screen.getByRole('button', { name: 'Turn it on' }));
    expect(await screen.findByText("Alex hasn't set up a Vault yet.")).toBeOnTheScreen();
  });

  it('shows that it is loading, and a problem with a way to try again', async () => {
    asked.mockReturnValue(pending());
    const view = await render(inApp(<EmergencyAccess />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    const problem = failed(new ApiError(500, 'unknown', 'Something went wrong on our side.'));
    asked.mockReturnValue(problem);
    await view.rerender(inApp(<EmergencyAccess />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(problem.refetch).toHaveBeenCalled();
  });
});
