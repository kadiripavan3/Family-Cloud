import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { apiFetch, connectSession } from '@/api/fetcher';
import { sendChecklistChanges, sendPageChanges, useGetMe } from '@/api/generated/homeport';
import { useOnline } from '@/api/online';
import { inApp } from '@/test/phone';
import { checklist, page } from '@/test/samples';
import { memoryStore } from '@/test/samples/notes';

import { ChangesProvider, useChanges, useWaiting } from '../outbox';
import type { Target } from '../types';

const mockCache = { listSent: jest.fn(() => Promise.resolve()), pageSent: jest.fn(() => Promise.resolve()) };
let mockNext = 0;
jest.mock('@/api/online', () => ({ useOnline: jest.fn() }));
jest.mock('@/api/cache', () => ({ cacheFor: () => mockCache }));
jest.mock('@/api/generated/homeport', () => ({ sendChecklistChanges: jest.fn(), sendPageChanges: jest.fn(), useGetMe: jest.fn() }));
// The phone's own storage isn't there in a test; each test brings a store that lives in memory.
jest.mock('../store', () => ({ changeStore: {} }));
jest.mock('@/lib/ids', () => ({ newClientId: () => `k${(mockNext += 1)}` }));

const network = jest.mocked(useOnline);
const who = jest.mocked(useGetMe) as unknown as jest.Mock;
const list: Target = { kind: 'checklist', id: 'l-1' };
const wifi: Target = { kind: 'page', id: 'p-1' };

/** Shows what waits for the list and the page, with a button for each thing a screen does. */
function Probe() {
  const changes = useChanges();
  const forList = useWaiting(list);
  const forPage = useWaiting(wifi);
  return (
    <>
      <Text>{`list:${forList.changes.length}${forList.held ? ':held' : ''} page:${forPage.changes.length}${forPage.held ? ':held' : ''}`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="tick" onPress={() => changes.add({ target: list, body: { op: 'change', itemId: 'i-1', change: { done: true } } })} />
      <Pressable accessibilityRole="button" accessibilityLabel="write" onPress={() => changes.add({ target: wifi, body: { op: 'add', add: { clientId: 'b-1', kind: 'paragraph', text: 'Hello' } } })} />
    </>
  );
}

describe('the queue of changes around the signed-in app', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = 0;
    network.mockReturnValue(true);
    who.mockReturnValue({ data: { id: 'a-nora' } });
  });

  it('sends a change as soon as it is made, and hands the list the API sends back to everything that shows it', async () => {
    const now = checklist({ id: 'l-1', version: 'v2' });
    jest.mocked(sendChecklistChanges).mockResolvedValue({ answers: [{ outcome: 'done', itemId: 'i-1' }], list: now });
    const phone = memoryStore();
    await render(inApp(<ChangesProvider store={phone.store}>{<Probe />}</ChangesProvider>));
    await userEvent.setup().press(screen.getByRole('button', { name: 'tick' }));
    await waitFor(() => expect(mockCache.listSent).toHaveBeenCalledWith('l-1', now));
    expect(sendChecklistChanges).toHaveBeenCalledWith('l-1', { changes: [{ op: 'change', itemId: 'i-1', change: { done: true } }] });
    expect(screen.getByText('list:0 page:0')).toBeOnTheScreen();
    expect(phone.rows.size).toBe(0);
  });

  it("does the same for a page's blocks", async () => {
    const now = page({ id: 'p-1', version: 'v2' });
    jest.mocked(sendPageChanges).mockResolvedValue({ answers: [{ outcome: 'done', blockId: 'block-1' }], page: now });
    await render(inApp(<ChangesProvider store={memoryStore().store}>{<Probe />}</ChangesProvider>));
    await userEvent.setup().press(screen.getByRole('button', { name: 'write' }));
    await waitFor(() => expect(mockCache.pageSent).toHaveBeenCalledWith('p-1', now));
  });

  it('holds everything back without a connection, and lets it go when the phone is online again', async () => {
    network.mockReturnValue(false);
    jest.mocked(sendChecklistChanges).mockResolvedValue({ answers: [{ outcome: 'done' }], list: checklist({ id: 'l-1' }) });
    jest.mocked(sendPageChanges).mockResolvedValue({ answers: [{ outcome: 'done' }], page: page({ id: 'p-1' }) });
    const phone = memoryStore();
    const view = await render(inApp(<ChangesProvider store={phone.store}>{<Probe />}</ChangesProvider>));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'tick' }));
    await user.press(screen.getByRole('button', { name: 'write' }));
    expect(screen.getByText('list:1:held page:1:held')).toBeOnTheScreen();
    expect(sendChecklistChanges).not.toHaveBeenCalled();
    await waitFor(() => expect(phone.rows.size).toBe(2));
    network.mockReturnValue(true);
    await view.rerender(inApp(<ChangesProvider store={phone.store}>{<Probe />}</ChangesProvider>));
    await waitFor(() => expect(screen.getByText('list:0 page:0')).toBeOnTheScreen());
    expect(sendChecklistChanges).toHaveBeenCalledTimes(1);
    expect(sendPageChanges).toHaveBeenCalledTimes(1);
  });

  it('forgets what waited for a list when the API says yes to deleting it, whichever screen asked', async () => {
    network.mockReturnValue(false);
    const phone = memoryStore();
    await render(inApp(<ChangesProvider store={phone.store}>{<Probe />}</ChangesProvider>));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'tick' }));
    await user.press(screen.getByRole('button', { name: 'write' }));
    connectSession({ getToken: () => 'token', onSignedOut: () => undefined });
    const answered = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await act(async () => {
      await apiFetch('/v1/things/l-1', { method: 'DELETE' });
    });
    expect(screen.getByText('list:0 page:1:held')).toBeOnTheScreen();
    // And nothing of a deleted account stays on the phone.
    await act(async () => {
      await apiFetch('/v1/me', { method: 'DELETE' });
    });
    expect(screen.getByText('list:0 page:0')).toBeOnTheScreen();
    await waitFor(() => expect(phone.rows.size).toBe(0));
    answered.mockRestore();
  });

  it("keeps each person's changes their own on a phone two people sign in on", async () => {
    network.mockReturnValue(false);
    const phone = memoryStore();
    const view = await render(inApp(<ChangesProvider store={phone.store}>{<Probe />}</ChangesProvider>));
    await userEvent.setup().press(screen.getByRole('button', { name: 'tick' }));
    await waitFor(() => expect(phone.rows.size).toBe(1));
    who.mockReturnValue({ data: { id: 'a-alex' } });
    await view.rerender(inApp(<ChangesProvider store={phone.store}>{<Probe />}</ChangesProvider>));
    expect(screen.getByText('list:0 page:0')).toBeOnTheScreen();
    expect([...phone.rows.values()].map((change) => change.owner)).toEqual(['a-nora']);
  });

  it('does nothing while nobody is signed in, and refuses to be used outside the app', async () => {
    who.mockReturnValue({ data: undefined });
    await render(inApp(<ChangesProvider store={memoryStore().store}>{<Probe />}</ChangesProvider>));
    await userEvent.setup().press(screen.getByRole('button', { name: 'tick' }));
    expect(screen.getByText('list:0 page:0')).toBeOnTheScreen();
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(render(inApp(<Probe />))).rejects.toThrow('The queue of changes is used outside ChangesProvider.');
    quiet.mockRestore();
  });
});
