import { cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { askToSee, useGetAsk, useGetVault, useGetVaultItem, withdrawAsk } from '@/api/generated/homeport';
import VaultItem from '@/app/(app)/vault-item/[id]';
import { AskToSee } from '@/features/activity/AskToSee';
import { lockVault, unlockVault } from '@/features/vault/session';
import { inApp } from '@/test/phone';
import { linds, loaded, me, pending } from '@/test/samples';
import { ago, ask, NOW } from '@/test/samples/activity';
import { DOOR, itemPerson, NORA_KEY, noraOwns, vaultItem, vaultRecord } from '@/test/samples/vault';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { askChanged: jest.fn(() => Promise.resolve()), vaultItemOpened: jest.fn(), vaultItemShared: jest.fn() };
const mockKeeper = { keptHow: jest.fn(async () => 'passcode'), canAskThePhone: jest.fn(() => false) };
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }), useFocusEffect: jest.fn() }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => 'client-1') }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/vault/keeper', () => new Proxy({}, { get: (_, name: string) => (...given: unknown[]) => (mockKeeper as unknown as Record<string, (...given: unknown[]) => unknown>)[name]?.(...given) }));
jest.mock('@/api/generated/homeport', () => ({
  useGetAsk: jest.fn(),
  askToSee: jest.fn(),
  withdrawAsk: jest.fn(),
  useGetVault: jest.fn(),
  useGetVaultItem: jest.fn(),
  useGetVaultSharing: jest.fn(() => ({ data: undefined })),
  useGetMe: jest.fn(() => mockMe),
  openVaultItem: jest.fn(),
}));

const mockId = DOOR;
const mockLinds = linds;
const mockMe = loaded(me());
const standing = jest.mocked(useGetAsk) as unknown as jest.Mock;
const THING = { id: DOOR, circleId: 'c-linds', title: 'Front door code' };
const mine = (over = {}) => ask({ thingId: DOOR, title: 'Front door code', askerName: 'Nora', mine: true, askedAt: ago(12), ...over });
/** Alex's door code as Nora sees it once her one look is used up. */
const usedUp = vaultItem({ id: DOOR, title: 'Front door code', category: 'code', glance: 'Code · home', mine: false, canEdit: false, owner: { memberId: 'm-alex', name: 'Alex Strand', avatarUrl: null }, myAccess: 'see', myState: 'used', once: true, people: [itemPerson({ owner: true, access: 'change' }), { ...noraOwns, owner: false, access: 'see', state: 'used', once: true }] });

describe('"Ask to see it", for a thing you know is there and cannot open', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    standing.mockReturnValue(loaded({ canAsk: true, ask: null }));
  });
  afterEach(() => jest.useRealTimers());

  it('offers to ask, and asks for today only unless another way is chosen', async () => {
    jest.mocked(askToSee).mockResolvedValue(mine());
    await render(inApp(<AskToSee thing={THING} owner="Alex" />));
    expect(standing).toHaveBeenCalledWith(DOOR);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole('button', { name: 'Ask to see it' }));
    expect(screen.getByRole('header', { name: 'Ask to see “Front door code”' })).toBeOnTheScreen();
    expect(screen.getByText("Alex gets the question in Activity and on their phone, and answers it there. The notification doesn't name the item.")).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'For today only. It stops working for you at midnight', checked: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Ask Alex' }));
    // Until midnight on the phone's own clock.
    await waitFor(() => expect(askToSee).toHaveBeenCalledWith(DOOR, { clientId: 'client-1', until: new Date(2026, 10, 12).toISOString() }));
    await waitFor(() => expect(mockCache.askChanged).toHaveBeenCalledWith(THING));
    await waitFor(() => expect(screen.queryByRole('header', { name: /^Ask to see/ })).toBeNull());
  });

  it('asks for one look, or with no end', async () => {
    jest.mocked(askToSee).mockResolvedValue(mine());
    await render(inApp(<AskToSee thing={THING} owner="Alex" />));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole('button', { name: 'Ask to see it' }));
    await user.press(screen.getByRole('radio', { name: /^For one look\./ }));
    await user.press(screen.getByRole('button', { name: 'Ask Alex' }));
    await waitFor(() => expect(askToSee).toHaveBeenLastCalledWith(DOOR, { clientId: 'client-1', once: true }));
    await user.press(screen.getByRole('button', { name: 'Ask to see it' }));
    await user.press(screen.getByRole('radio', { name: /^Until they take it back\./ }));
    await user.press(screen.getByRole('button', { name: 'Ask Alex' }));
    await waitFor(() => expect(askToSee).toHaveBeenLastCalledWith(DOOR, { clientId: 'client-1' }));
  });

  it('says why asking did not work, in the words of the API, and keeps the sheet', async () => {
    jest.mocked(askToSee).mockRejectedValue(new ApiError(409, 'open_already', 'You can open that already.'));
    await render(inApp(<AskToSee thing={THING} owner="Alex" />));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole('button', { name: 'Ask to see it' }));
    await user.press(screen.getByRole('button', { name: 'Ask Alex' }));
    expect(await screen.findByText('You can open that already.')).toBeOnTheScreen();
    expect(mockCache.askChanged).not.toHaveBeenCalled();
  });

  it('says a question is waiting, and takes it back', async () => {
    standing.mockReturnValue(loaded({ canAsk: false, ask: mine() }));
    jest.mocked(withdrawAsk).mockResolvedValue(undefined);
    await render(inApp(<AskToSee thing={THING} owner="Alex" />));
    expect(screen.getByText("You asked Alex 12 min ago. They haven't answered yet.")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Ask to see it' })).toBeNull();
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: 'Take the question back' }));
    await waitFor(() => expect(withdrawAsk).toHaveBeenCalledWith(mine().id));
    await waitFor(() => expect(mockCache.askChanged).toHaveBeenCalledWith(THING));
  });

  it('says "not now" was the answer, and lets you ask again', async () => {
    standing.mockReturnValue(loaded({ canAsk: true, ask: mine({ state: 'declined' }) }));
    await render(inApp(<AskToSee thing={THING} owner="Alex" />));
    expect(screen.getByText('Alex said not now. You can ask again another time.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ask to see it' })).toBeOnTheScreen();
  });

  it('draws nothing while it does not know, and when there is nothing to ask', async () => {
    standing.mockReturnValue(pending());
    const view = await render(inApp(<AskToSee thing={THING} owner="Alex" />));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/\w/)).toBeNull();
    standing.mockReturnValue(loaded({ canAsk: false, ask: mine({ state: 'allowed' }) }));
    await view.rerender(inApp(<AskToSee thing={THING} owner="Alex" />));
    expect(screen.queryByRole('button')).toBeNull();
  });

  describe("on a Vault item's own page", () => {
    beforeEach(() => {
      (jest.mocked(useGetVault) as unknown as jest.Mock).mockReturnValue(loaded(vaultRecord()));
      unlockVault(NORA_KEY.slice());
    });
    // The screen goes first: locking under a screen that is still there would draw the locked page for nobody.
    afterEach(async () => {
      await cleanup();
      lockVault();
    });

    it("stands under someone else's item that can't be opened any more", async () => {
      (jest.mocked(useGetVaultItem) as unknown as jest.Mock).mockReturnValue(loaded(usedUp));
      await render(inApp(<VaultItem />));
      expect(screen.getByRole('header', { name: 'Front door code' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Ask to see it' })).toBeOnTheScreen();
    });

    it('is not offered on your own item, nor on a sample', async () => {
      (jest.mocked(useGetVaultItem) as unknown as jest.Mock).mockReturnValue(loaded({ ...usedUp, sample: true }));
      await render(inApp(<VaultItem />));
      expect(screen.getByRole('header', { name: 'Front door code' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Ask to see it' })).toBeNull();
      expect(standing).not.toHaveBeenCalled();
    });
  });
});
