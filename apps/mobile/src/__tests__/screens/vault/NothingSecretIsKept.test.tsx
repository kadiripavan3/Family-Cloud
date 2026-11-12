import type { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import * as api from '@/api/generated/homeport';
import { snapshot } from '@/api/kept';
import VaultItem from '@/app/(app)/vault-item/[id]';
import { lockVault, unlockVault } from '@/features/vault/session';
import { VaultHome } from '@/features/vault/VaultHome';
import { inApp, newClient } from '@/test/phone';
import { linds, me } from '@/test/samples';
import { attention, emergency, ITEM_KEY, NETFLIX, NETFLIX_INSIDE, NORA_KEY, openedAnswer, sharing, vaultHome, vaultItem, vaultRecord } from '@/test/samples/vault';

/**
 * Nothing a phone has opened may ever be in the data layer: not in what it has loaded (the query cache), not
 * in what it remembers of a change (the mutation cache), and so not in what is written to the phone to open
 * without a connection (`api/kept`). Here the real data layer is used, with only the network stood in for,
 * and after the screens have opened, shown and copied a password, every byte the data layer holds is searched.
 */

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockKeeper = { keptHow: jest.fn(async () => 'passcode'), canAskThePhone: jest.fn(() => false) };
const mockAnswers: Record<string, () => unknown> = {};
jest.mock('expo-crypto', () => jest.requireActual('@/test/vaultReference').expoCrypto);
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }), useFocusEffect: jest.fn() }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/vault/keeper', () => new Proxy({}, { get: (_, name: string) => (...given: unknown[]) => (mockKeeper as unknown as Record<string, (...given: unknown[]) => unknown>)[name]?.(...given) }));
// Only the network is stood in for: every generated call and hook is the real one.
jest.mock('@/api/fetcher', () => ({
  ...jest.requireActual('@/api/fetcher'),
  apiFetch: jest.fn(async (path: string, options?: { method?: string }) => {
    const answer = mockAnswers[`${options?.method ?? 'GET'} ${path.split('?')[0]}`];
    if (!answer) throw new Error(`no answer made up for ${options?.method ?? 'GET'} ${path}`);
    return answer();
  }),
}));

const mockId = NETFLIX;
const mockLinds = linds;
const PASSWORD = NETFLIX_INSIDE.fields.password!;

/** A secret in every spelling it could be lying around in. */
const spellings = (bytes: Uint8Array) => [Buffer.from(bytes).toString('base64url'), Buffer.from(bytes).toString('base64'), Buffer.from(bytes).toString('hex'), `[${[...bytes].join(',')}]`, JSON.stringify(Object.fromEntries([...bytes].entries())).slice(0, 40)];
const SECRETS = [PASSWORD, NETFLIX_INSIDE.fields.username!, NETFLIX_INSIDE.fields.totp!, ...spellings(ITEM_KEY), ...spellings(NORA_KEY)];

/** Everything the data layer holds, as text: what was loaded, what was sent and answered, and what it would write to the phone. */
function everythingIn(client: QueryClient): string {
  const loaded = client.getQueryCache().getAll().map((query) => ({ key: query.queryKey, state: query.state }));
  const changes = client.getMutationCache().getAll().map((mutation) => ({ key: mutation.options.mutationKey, state: mutation.state }));
  return JSON.stringify({ loaded, changes }) + snapshot(client, 'a-nora');
}
const found = (client: QueryClient) => SECRETS.filter((secret) => everythingIn(client).includes(secret));

describe('nothing secret is kept by the data layer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockAnswers, {
      'GET /v1/me': () => me(),
      'GET /v1/vault': () => vaultRecord(),
      [`GET /v1/vault/items/${NETFLIX}`]: () => vaultItem(),
      [`POST /v1/vault/items/${NETFLIX}/open`]: () => openedAnswer(),
      [`GET /v1/vault/items/${NETFLIX}/sharing`]: () => sharing(),
      'GET /v1/circles/c-linds/vault': () => vaultHome({ sharedWithYou: [{ ...vaultHome().sharedWithYou[0]!, id: NETFLIX }] }),
      'GET /v1/vault/attention': () => attention(),
      'GET /v1/vault/emergency': () => emergency(),
    });
    unlockVault(NORA_KEY.slice());
  });
  // The screen goes first: locking under a screen that is still there would draw the locked page for nobody.
  afterEach(async () => {
    await cleanup();
    lockVault();
  });

  it('after an item was opened, shown and copied, the password is on the screen and nowhere in the data layer', async () => {
    const client = newClient();
    await render(inApp(<VaultItem />, client));
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Show password' }));
    expect(screen.getByText(PASSWORD)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Copy password' }));
    await user.press(screen.getByRole('button', { name: 'Copy one-time code' }));
    // The data layer did load the item's clear part, so it is the real one that is searched...
    expect(everythingIn(client)).toContain('netflix.com');
    expect(client.getQueryData(api.getGetVaultItemQueryKey(NETFLIX))).toBeDefined();
    // ...and it holds nothing that came out of the seal, nor either key.
    expect(found(client)).toEqual([]);
  });

  it('copying from the list in the Vault leaves nothing behind either', async () => {
    const client = newClient();
    await render(inApp(<VaultHome />, client));
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Copy Netflix' }));
    await waitFor(() => expect(screen.getByText(/^Copied\./)).toBeOnTheScreen());
    expect(found(client)).toEqual([]);
  });

  it('this test would notice: a password put into the data layer by mistake is found', async () => {
    const client = newClient();
    client.setQueryData(['/v1/circles/c-linds/today'], { title: 'Netflix', glance: PASSWORD });
    expect(found(client)).toEqual([PASSWORD]);
    const other = newClient();
    await other.getMutationCache().build(other, { mutationFn: async () => ({ opened: NETFLIX_INSIDE }) }).execute(undefined);
    expect(found(other)).toEqual([PASSWORD, NETFLIX_INSIDE.fields.username, NETFLIX_INSIDE.fields.totp]);
  });

  it("nothing of the Vault is written to the phone's copy of what was read: not even titles and scrambled pieces", () => {
    const client = newClient();
    const now = Date.now();
    const keys = [
      api.getGetVaultQueryKey(),
      api.getGetVaultItemQueryKey(NETFLIX),
      api.getGetVaultSharingQueryKey(NETFLIX),
      api.getGetVaultHomeQueryKey('c-linds'),
      api.getGetVaultItemsQueryKey('c-linds', { category: 'login' }),
      api.getGetVaultItemsInfiniteQueryKey('c-linds', { mine: true }),
      api.getGetVaultKeysQueryKey('c-linds'),
      api.getGetMyVaultItemsQueryKey(),
      api.getGetMyVaultItemsInfiniteQueryKey(),
      api.getGetVaultAttentionQueryKey(),
      api.getGetVaultWaitingQueryKey(),
      api.getGetVaultPeopleQueryKey(),
      api.getGetEmergencyQueryKey(),
      api.getGetEntrustedQueryKey(),
      api.getGetEntrustedVaultQueryKey('e-1'),
      api.getGetVaultHelpersQueryKey(),
      api.getGetHelpingQueryKey(),
      api.getGetShareToPassOnQueryKey('hp-1'),
      api.getGetVaultRecoveryQueryKey('r-1'),
    ];
    for (const key of keys) client.setQueryData(key, { title: 'Netflix', wrappedPrivateKey: 'AQ-wrapped', ciphertext: 'AQ-sealed' }, { updatedAt: now });
    client.setQueryData(api.getGetMeQueryKey(), me(), { updatedAt: now });
    client.setQueryData(['/v1/circles/c-linds/today', { day: '2026-11-12' }], { items: [] }, { updatedAt: now });
    const kept = JSON.parse(snapshot(client, 'a-nora', now)) as { queries: { key: unknown[] }[] };
    expect(kept.queries.map((query) => query.key[0]).sort()).toEqual(['/v1/circles/c-linds/today', '/v1/me']);
    expect(snapshot(client, 'a-nora', now)).not.toContain('AQ-');
  });
});
