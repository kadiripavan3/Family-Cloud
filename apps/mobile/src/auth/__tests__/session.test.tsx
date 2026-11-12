import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { beforeSignOut } from '../beforeSignOut';
import { SessionProvider, useSession } from '../session';
import { accountOf } from '../token';

const mockKept = new Map<string, string>();
jest.mock('@/lib/keep', () => ({
  keep: {
    get: (key: string) => Promise.resolve(mockKept.get(key) ?? null),
    set: (key: string, value: string) => Promise.resolve(void mockKept.set(key, value)),
    remove: (key: string) => Promise.resolve(void mockKept.delete(key)),
  },
}));

type Hear = (token: string | null) => void;
const mockService = {
  saved: null as string | null,
  hear: (() => {}) as Hear,
  signOut: jest.fn(() => Promise.resolve()),
};
jest.mock('../signIn', () => ({
  signInService: {
    restore: () => Promise.resolve(mockService.saved),
    renew: () => Promise.resolve(null),
    signedInWith: () => Promise.resolve('apple'),
    onToken: (listener: Hear) => {
      mockService.hear = listener;
      return () => {};
    },
    signOut: () => mockService.signOut(),
  },
}));

/** A token the way both sign-in services make them: the account's id is written inside. */
const tokenFor = (account: string) => `head.${btoa(JSON.stringify({ sub: account, exp: 1 })).replace(/=+$/, '')}.signature`;
const KEY = 'homeport.kept.v1';
const keptFor = (owner: string, name: string) => JSON.stringify({ owner, queries: [{ key: ['/v1/me'], data: { id: owner, profile: { displayName: name } }, at: Date.now() - 1000 }] });

function Status() {
  const session = useSession();
  return (
    <>
      <Text onPress={() => void session.signOut()}>{session.status}</Text>
      <Text>{`with ${session.provider ?? 'nothing yet'}`}</Text>
    </>
  );
}

async function start() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <Status />
      </SessionProvider>
    </QueryClientProvider>,
  );
  await act(async () => {});
  return client;
}

describe('the sign-in and what the phone keeps for it', () => {
  beforeEach(() => {
    mockKept.clear();
    mockService.saved = null;
    mockService.signOut.mockClear();
  });

  it('reads the account out of a token, and nothing out of anything else', () => {
    expect(accountOf(tokenFor('5f0c1c9e-0000-4000-8000-000000000001'))).toBe('5f0c1c9e-0000-4000-8000-000000000001');
    expect(accountOf('not-a-token')).toBeNull();
    expect(accountOf('a.%%%.c')).toBeNull();
    expect(accountOf(null)).toBeNull();
  });

  it('starts signed in with what was read last time, before anything is asked', async () => {
    mockService.saved = tokenFor('nora');
    mockKept.set(KEY, keptFor('nora', 'Nora'));

    const client = await start();

    expect(screen.getByText('signedIn')).toBeTruthy();
    expect(client.getQueryData(['/v1/me'])).toMatchObject({ profile: { displayName: 'Nora' } });
    // The Account screen can say how this person signed in.
    expect(screen.getByText('with apple')).toBeTruthy();
  });

  it('never shows one person what the phone kept for another', async () => {
    mockService.saved = tokenFor('alex');
    mockKept.set(KEY, keptFor('nora', 'Nora'));

    const client = await start();

    expect(screen.getByText('signedIn')).toBeTruthy();
    expect(client.getQueryData(['/v1/me'])).toBeUndefined();
    expect(mockKept.has(KEY)).toBe(false);
  });

  it('signing out says the goodbyes, then leaves nothing in memory or on the phone', async () => {
    mockService.saved = tokenFor('nora');
    mockKept.set(KEY, keptFor('nora', 'Nora'));
    const client = await start();
    const goodbye = jest.fn();
    const stop = beforeSignOut(goodbye);

    await act(async () => {
      screen.getByText('signedIn').props.onPress();
    });

    expect(screen.getByText('signedOut')).toBeTruthy();
    expect(screen.getByText('with nothing yet')).toBeTruthy();
    expect(goodbye).toHaveBeenCalledTimes(1);
    expect(mockService.signOut).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['/v1/me'])).toBeUndefined();
    expect(mockKept.has(KEY)).toBe(false);
    stop();
  });

  it('does the same when the sign-in service ends the sign-in by itself', async () => {
    mockService.saved = tokenFor('nora');
    mockKept.set(KEY, keptFor('nora', 'Nora'));
    const client = await start();
    const goodbye = jest.fn();
    const stop = beforeSignOut(goodbye);

    await act(async () => mockService.hear(null));

    expect(screen.getByText('signedOut')).toBeTruthy();
    expect(goodbye).toHaveBeenCalledTimes(1);
    expect(mockService.signOut).not.toHaveBeenCalled(); // the service knows already
    expect(client.getQueryData(['/v1/me'])).toBeUndefined();
    expect(mockKept.has(KEY)).toBe(false);
    stop();
  });

  it('forgets the person before when someone else signs in without a sign-out in between', async () => {
    mockService.saved = tokenFor('nora');
    const client = await start();
    client.setQueryData(['/v1/circles'], { items: ['hers'] });

    // A renewal for the same person changes nothing.
    await act(async () => mockService.hear(`${tokenFor('nora')}-renewed`));
    expect(client.getQueryData(['/v1/circles'])).toBeDefined();

    await act(async () => mockService.hear(tokenFor('alex')));
    expect(screen.getByText('signedIn')).toBeTruthy();
    expect(client.getQueryData(['/v1/circles'])).toBeUndefined();
  });
});
