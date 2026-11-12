import { cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import type { ReactElement } from 'react';

import { ApiError } from '@/api/fetcher';
import { openVaultItem, useGetVault, useGetVaultItemsInfinite } from '@/api/generated/homeport';
import VaultDrawer from '@/app/(app)/vault/drawer/[category]';
import { lockVault, unlockVault } from '@/features/vault/session';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, me, onlyMe, pending } from '@/test/samples';
import { doorRow, itemRow, NETFLIX, NORA_KEY, openedAnswer, vaultRecord } from '@/test/samples/vault';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockKeeper = { keptHow: jest.fn(async () => 'passcode'), canAskThePhone: jest.fn(() => false) };
let mockCategory = 'login';
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ category: mockCategory }) }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
// The real list draws only the rows a phone's screen has room for; in a test every row is drawn.
jest.mock('@/ui/List', () => ({
  List: ({ data, row, empty }: { data: unknown[]; row: (item: unknown, index: number) => ReactElement; empty?: ReactElement }) => {
    const { View } = jest.requireActual('react-native');
    return <View>{data.length === 0 ? empty : data.map((item, index) => <View key={index}>{row(item, index)}</View>)}</View>;
  },
}));
jest.mock('@/features/vault/keeper', () => new Proxy({}, { get: (_, name: string) => (...given: unknown[]) => (mockKeeper as unknown as Record<string, (...given: unknown[]) => unknown>)[name]?.(...given) }));
jest.mock('@/api/generated/homeport', () => ({ useGetVault: jest.fn(), useGetVaultItemsInfinite: jest.fn(), useGetMe: jest.fn(() => mockMe), openVaultItem: jest.fn() }));

const mockLinds = linds;
const mockMe = loaded(me());
const list = jest.mocked(useGetVaultItemsInfinite) as unknown as jest.Mock;
const onePage = <T,>(items: T[]) => ({ ...loaded({ pages: [{ items, nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
const bank = itemRow({ id: 'bank', title: 'Bank', mine: true, site: 'bank.example', glance: 'Login · bank.example', chip: onlyMe, owner: { memberId: 'm-nora', name: 'Nora Lind', avatarUrl: null }, myAccess: 'change' });

describe('a drawer of the Vault', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCategory = 'login';
    (jest.mocked(useGetVault) as unknown as jest.Mock).mockReturnValue(loaded(vaultRecord()));
    list.mockReturnValue(onePage([bank, itemRow()]));
    unlockVault(NORA_KEY.slice());
  });
  afterEach(async () => {
    await cleanup();
    lockVault();
  });

  it("lists what is in it: this person's own with what it is, other people's with whose", async () => {
    await render(inApp(<VaultDrawer />));
    expect(screen.getByRole('header', { name: 'Logins' })).toBeOnTheScreen();
    expect(list).toHaveBeenCalledWith('c-linds', { category: 'login' }, expect.anything());
    expect(screen.getByRole('button', { name: 'Bank. Login · bank.example' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Netflix. From Alex · you can see it' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Netflix. From Alex · you can see it' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'vault-item', id: NETFLIX } });
  });

  it('adds to this drawer', async () => {
    await render(inApp(<VaultDrawer />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/new/password', params: { category: 'login' } });
  });

  it('copies from the list without opening the page, and says when the Vault locks', async () => {
    jest.mocked(openVaultItem).mockResolvedValue(openedAnswer(undefined, { access: 'see' }));
    await render(inApp(<VaultDrawer />));
    expect(screen.getByText(/^Locks itself in (2:00|1:5\d)$/)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Copy Netflix' }));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('p0pcorn!Friday#night', expect.anything()));
    expect(await screen.findByText(/^Copied\./)).toBeOnTheScreen();
  });

  it('is also the list of what needs a look, and of what others shared', async () => {
    mockCategory = 'look';
    list.mockReturnValue(onePage([{ ...bank, health: 'reused' }]));
    const view = await render(inApp(<VaultDrawer />));
    expect(screen.getByRole('header', { name: 'Needs a look' })).toBeOnTheScreen();
    expect(list).toHaveBeenLastCalledWith('c-linds', { look: true }, expect.anything());
    mockCategory = 'shared';
    list.mockReturnValue(onePage([doorRow]));
    await view.rerender(inApp(<VaultDrawer />));
    expect(screen.getByRole('header', { name: 'Shared with you' })).toBeOnTheScreen();
    expect(list).toHaveBeenLastCalledWith('c-linds', { mine: false }, expect.anything());
    expect(screen.getByRole('button', { name: 'Front door code. Everyone in The Linds' })).toBeOnTheScreen();
    // Nothing is added to what other people shared.
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
  });

  it('says so when it is empty, while it loads, and when it could not be loaded', async () => {
    list.mockReturnValue(onePage([]));
    const view = await render(inApp(<VaultDrawer />));
    expect(screen.getByText('Nothing here yet')).toBeOnTheScreen();
    expect(screen.getByText('What you add to this drawer shows up here.')).toBeOnTheScreen();
    list.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    await view.rerender(inApp(<VaultDrawer />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    list.mockReturnValue({ ...failed(new ApiError(500, 'unknown', 'Something went wrong on our side.')), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    await view.rerender(inApp(<VaultDrawer />));
    expect(screen.getByText('Something went wrong on our side.')).toBeOnTheScreen();
  });

  it('has no page for a drawer that does not exist', async () => {
    mockCategory = 'spaceships';
    await render(inApp(<VaultDrawer />));
    expect(screen.getByText("There's nothing at this address")).toBeOnTheScreen();
    expect(list).not.toHaveBeenCalled();
  });
});
