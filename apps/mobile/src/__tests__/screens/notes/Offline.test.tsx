import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { sendChecklistChanges, useGetChecklist } from '@/api/generated/homeport';
import { useOnline } from '@/api/online';
import Checklist from '@/app/(app)/checklist/[id]';
import { ChangesProvider } from '@/features/notes/changes/outbox';
import type { Change } from '@/features/notes/changes/types';
import { inApp } from '@/test/phone';
import { linds, loaded, me } from '@/test/samples';
import { groceries, memoryStore } from '@/test/samples/notes';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { listSent: jest.fn(() => Promise.resolve()), pageSent: jest.fn(() => Promise.resolve()) };
let mockNext = 0;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }), useIsFocused: () => true }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache, cacheFor: () => mockCache }));
jest.mock('@/api/online', () => ({ useOnline: jest.fn() }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/features/notes/changes/store', () => ({ changeStore: {} }));
jest.mock('@/features/notes/MoveSheet', () => ({ MoveSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({
  useGetChecklist: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  getGetChecklistQueryKey: (id: string) => [`/v1/checklists/${id}`],
  getChecklist: jest.fn(),
  sendChecklistChanges: jest.fn(),
  sendPageChanges: jest.fn(),
}));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => `client-${(mockNext += 1)}`) }));

const mockId = '22222222-2222-4222-8222-222222222222';
const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetChecklist) as unknown as jest.Mock;
const send = jest.mocked(sendChecklistChanges);
const network = jest.mocked(useOnline);

const SAYS = "You're offline. Your ticks are saved here and will reach everyone when you're back.";

describe('13.2 a shared list with no connection', () => {
  let phone: ReturnType<typeof memoryStore>;
  const onPhone = () => inApp(<ChangesProvider store={phone.store}>{<Checklist />}</ChangesProvider>);

  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = 0;
    phone = memoryStore();
    network.mockReturnValue(false);
    asked.mockReturnValue(loaded(groceries()));
    send.mockImplementation(async (_id, sent) => ({ answers: sent.changes.map(() => ({ outcome: 'done' as const })), list: groceries({ version: 'v2' }) }));
  });

  it('says so in its own words, and still shows the list that was opened before', async () => {
    await render(onPhone());
    expect(screen.getByRole('alert')).toHaveTextContent(SAYS);
    expect(screen.getByRole('header', { name: 'Groceries' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Bananas', checked: false })).toBeOnTheScreen();
    // Who is in it right now can't be known without a connection.
    expect(screen.queryByText(/is here now/)).toBeNull();
    expect(screen.queryByText('waiting')).toBeNull();
  });

  it('keeps ticks and new lines on the phone, shows them at once, and marks each as waiting', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Bananas' }));
    await user.press(screen.getByRole('checkbox', { name: 'Strawberries, 2 boxes' }));
    await user.type(screen.getByLabelText('Add an item'), 'Oat milk', { submitEditing: true });
    expect(screen.getByRole('checkbox', { name: 'Bananas', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Strawberries, 2 boxes', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Oat milk', checked: false })).toBeOnTheScreen();
    expect(screen.getByText('4 left of 8')).toBeOnTheScreen();
    expect(screen.getAllByText('waiting')).toHaveLength(3);
    expect(screen.getAllByLabelText('Waiting to be sent')).toHaveLength(3);
    // Nothing went to the API, and all of it is written down.
    expect(send).not.toHaveBeenCalled();
    await waitFor(() => expect(phone.rows.size).toBe(3));
    expect([...phone.rows.values()].sort((a, b) => a.seq - b.seq).map((change) => change.body)).toEqual([
      { op: 'change', itemId: 'i-bananas', change: { done: true } },
      { op: 'change', itemId: 'i-berries', change: { done: true } },
      { op: 'add', add: { clientId: 'client-3', text: 'Oat milk' } },
    ]);
  });

  it('ticks a line that was added offline, and changes one, still without a connection', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Add an item'), 'Oat milk', { submitEditing: true });
    await user.press(screen.getByRole('checkbox', { name: 'Oat milk' }));
    expect(screen.getByRole('checkbox', { name: 'Oat milk', checked: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Milk, 2 litres. More' }));
    await user.type(screen.getByLabelText('Small print'), 'the blue one');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('the blue one')).toBeOnTheScreen();
    // The new line is known by the id the phone gave it, also to the tick that follows it.
    expect([...phone.rows.values()].sort((a, b) => a.seq - b.seq).map((change) => change.body)).toEqual([
      { op: 'add', add: { clientId: 'client-1', text: 'Oat milk' } },
      { op: 'change', itemId: 'client-1', change: { done: true } },
      { op: 'change', itemId: 'i-milk', change: { note: 'the blue one' } },
    ]);
  });

  it('sends everything in order when the connection is back, and the marks and the box go', async () => {
    const view = await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Bananas' }));
    await user.type(screen.getByLabelText('Add an item'), 'Oat milk', { submitEditing: true });
    await user.press(screen.getByRole('checkbox', { name: 'Oat milk' }));
    expect(screen.getAllByText('waiting')).toHaveLength(2);

    const after = groceries({ version: 'v9' });
    send.mockResolvedValue({ answers: [{ outcome: 'done', itemId: 'i-bananas' }, { outcome: 'done', itemId: 'item-77' }, { outcome: 'done', itemId: 'item-77' }], list: after });
    network.mockReturnValue(true);
    await view.rerender(onPhone());
    await waitFor(() => expect(mockCache.listSent).toHaveBeenCalledWith(mockId, after));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(mockId, {
      changes: [
        { op: 'change', itemId: 'i-bananas', change: { done: true } },
        { op: 'add', add: { clientId: 'client-2', text: 'Oat milk' } },
        { op: 'change', itemId: 'client-2', change: { done: true } },
      ],
    });
    expect(screen.queryByText('waiting')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(phone.rows.size).toBe(0);
  });

  it('finds what was waiting when the app is opened again, and sends it then', async () => {
    const kept: Change[] = [
      { key: 'k-1', owner: 'a-nora', target: { kind: 'checklist', id: mockId }, seq: 1, at: '2026-11-11T18:00:00.000Z', body: { op: 'change', itemId: 'i-bananas', change: { done: true } } },
      { key: 'k-2', owner: 'a-nora', target: { kind: 'checklist', id: mockId }, seq: 2, at: '2026-11-11T18:00:05.000Z', body: { op: 'add', add: { clientId: 'c-old', text: 'Candles' } } },
    ];
    phone = memoryStore(kept);
    const view = await render(onPhone());
    // Still offline: what was ticked yesterday is ticked, and waits.
    expect(await screen.findByRole('checkbox', { name: 'Bananas', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Candles', checked: false })).toBeOnTheScreen();
    expect(screen.getAllByText('waiting')).toHaveLength(2);
    network.mockReturnValue(true);
    await view.rerender(onPhone());
    await waitFor(() => expect(send).toHaveBeenCalledWith(mockId, { changes: [kept[0]!.body, kept[1]!.body] }));
    await waitFor(() => expect(phone.rows.size).toBe(0));
  });

  it('says that nothing answers when the phone is online but the API cannot be reached, and keeps the marks', async () => {
    network.mockReturnValue(true);
    send.mockRejectedValue(new ApiError(0, 'unreachable', "Can't reach Homeport right now. Check your connection and try again."));
    await render(onPhone());
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Bananas' }));
    expect(await screen.findByText("Can't reach Homeport right now. Your ticks are saved here and go up as soon as it answers.")).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Bananas', checked: true })).toBeOnTheScreen();
    expect(screen.getAllByText('waiting')).toHaveLength(1);
    expect(phone.rows.size).toBe(1);
    await act(async () => undefined);
  });

  it('lets the person try again or let go when changes were refused again and again', async () => {
    jest.useFakeTimers();
    try {
      network.mockReturnValue(true);
      send.mockRejectedValue(new ApiError(503, 'busy', 'Homeport is being updated. Try again in a moment.'));
      await render(onPhone());
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await user.press(screen.getByRole('checkbox', { name: 'Bananas' }));
      // Five more tries, each after a longer wait, and then it stops by itself.
      for (let tries = 0; tries < 5; tries += 1) await act(async () => jest.advanceTimersByTime(300_000));
      expect(send).toHaveBeenCalledTimes(6);
      expect(screen.getByText("1 change couldn't be sent")).toBeOnTheScreen();
      expect(screen.getByText('Homeport is being updated. Try again in a moment.')).toBeOnTheScreen();
      send.mockResolvedValue({ answers: [{ outcome: 'done' }], list: groceries({ version: 'v2' }) });
      await user.press(screen.getByRole('button', { name: 'Try again' }));
      await act(async () => jest.advanceTimersByTime(10));
      expect(send).toHaveBeenCalledTimes(7);
      expect(screen.queryByText("1 change couldn't be sent")).toBeNull();

      // And the other way out: let them go.
      send.mockRejectedValue(new ApiError(503, 'busy', 'Homeport is being updated. Try again in a moment.'));
      await user.press(screen.getByRole('checkbox', { name: 'Butter' }));
      for (let tries = 0; tries < 5; tries += 1) await act(async () => jest.advanceTimersByTime(300_000));
      await user.press(screen.getByRole('button', { name: 'Let them go' }));
      expect(screen.queryByText("1 change couldn't be sent")).toBeNull();
      expect(screen.getByRole('checkbox', { name: 'Butter', checked: true })).toBeOnTheScreen();
      expect(phone.rows.size).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
