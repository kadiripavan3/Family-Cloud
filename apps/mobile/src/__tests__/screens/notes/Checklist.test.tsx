import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { clearDoneItems, deleteThing, lookAtChecklist, pinThing, renameChecklist, sendChecklistChanges, useGetChecklist } from '@/api/generated/homeport';
import { useOnline } from '@/api/online';
import Checklist from '@/app/(app)/checklist/[id]';
import { ChangesProvider } from '@/features/notes/changes/outbox';
import { setLeaving } from '@/features/notes/live';
import { inApp } from '@/test/phone';
import { checklist, failed, item, linds, loaded, me, pending } from '@/test/samples';
import { giftIdeas, groceries, memoryStore } from '@/test/samples/notes';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { listSent: jest.fn(() => Promise.resolve()), pageSent: jest.fn(() => Promise.resolve()), notePinned: jest.fn(() => Promise.resolve()), noteGone: jest.fn(() => Promise.resolve()), noteFiled: jest.fn(() => Promise.resolve()) };
let mockNext = 0;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }), useIsFocused: () => true }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache, cacheFor: () => mockCache }));
jest.mock('@/api/online', () => ({ useOnline: jest.fn(() => true) }));
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
  lookAtChecklist: jest.fn(),
  clearDoneItems: jest.fn(),
  renameChecklist: jest.fn(),
  deleteThing: jest.fn(),
  pinThing: jest.fn(),
  unpinThing: jest.fn(),
  fileThing: jest.fn(),
  changeFolder: jest.fn(),
  changePage: jest.fn(),
}));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => `client-${(mockNext += 1)}`) }));

const mockId = '22222222-2222-4222-8222-222222222222';
const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetChecklist) as unknown as jest.Mock;
const send = jest.mocked(sendChecklistChanges);

/** An answer of the API that waits until the test lets it through: what the screen shows meanwhile is the phone's own doing. */
function held() {
  let answer!: () => void;
  const waiting = new Promise<void>((resolve) => {
    answer = resolve;
  });
  send.mockImplementation(async (_id, sent) => {
    await waiting;
    return { answers: sent.changes.map(() => ({ outcome: 'done' as const })), list: groceries({ version: 'v2' }) };
  });
  return { answer: () => act(async () => answer()) };
}

/** The list on a phone, with the queue of changes around it as in the app. */
const onPhone = () => inApp(<ChangesProvider store={memoryStore().store}>{<Checklist />}</ChangesProvider>);

describe('5.5 a shared list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = 0;
    jest.mocked(useOnline).mockReturnValue(true);
    asked.mockReturnValue(loaded(groceries()));
    send.mockImplementation(async (_id, sent) => ({ answers: sent.changes.map(() => ({ outcome: 'done' as const })), list: groceries({ version: 'v2' }) }));
  });

  it('shows its name, how much is left, who is in it, its lines under their headings, and who sees it', async () => {
    await render(onPhone());
    expect(screen.getByRole('header', { name: 'Groceries' })).toBeOnTheScreen();
    expect(screen.getByText('5 left of 7')).toBeOnTheScreen();
    expect(screen.getByText('Alex')).toBeOnTheScreen();
    expect(screen.getByText(/is here now, ticking things off$/)).toBeOnTheScreen();
    for (const heading of ['Fruit and veg', 'Fridge', 'Other']) expect(screen.getByText(heading)).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Bananas', checked: false })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Red onions', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: The Linds. Change who can see this' })).toBeOnTheScreen();
  });

  it('says the small print of a line: who just added it, that it comes back, who it is kept from', async () => {
    await render(onPhone());
    expect(screen.getByText('Added by Mia just now')).toBeOnTheScreen();
    expect(screen.getByText('Every week')).toBeOnTheScreen();
    expect(screen.getByText("Mia can't see this one")).toBeOnTheScreen();
    // Whose line it is: the picture of whoever else added it (Mia), not the reader's own.
    expect(screen.getAllByLabelText('Mia')).toHaveLength(2);
    expect(screen.queryByLabelText('Nora')).toBeNull();
  });

  it("asks again every few seconds with the version it has, until the answer is that the list isn't there", async () => {
    await render(onPhone());
    const [id, options] = asked.mock.calls.at(-1) as [string, { query: { refetchInterval: (asked: { state: { error: unknown } }) => number | false; queryFn: unknown } }];
    expect(id).toBe(mockId);
    expect(options.query.refetchInterval({ state: { error: null } })).toBe(4000);
    // A refresh that failed for another reason is tried again; "not found" and "not for you" are final.
    expect(options.query.refetchInterval({ state: { error: new ApiError(500, 'error', 'x') } })).toBe(4000);
    expect(options.query.refetchInterval({ state: { error: new ApiError(404, 'not_found', 'x') } })).toBe(false);
    expect(options.query.refetchInterval({ state: { error: new ApiError(403, 'forbidden', 'x') } })).toBe(false);
    expect(typeof options.query.queryFn).toBe('function');
  });

  it('ticks a line at once, sends the change through the queue, and shows the list the API sends back', async () => {
    const api = held();
    await render(onPhone());
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Bananas' }));
    // On the screen before the API has answered. Online, nothing is marked as waiting.
    expect(screen.getByRole('checkbox', { name: 'Bananas', checked: true })).toBeOnTheScreen();
    expect(screen.getByText('4 left of 7')).toBeOnTheScreen();
    expect(screen.queryByText('waiting')).toBeNull();
    expect(mockCache.listSent).not.toHaveBeenCalled();
    await api.answer();
    await waitFor(() => expect(mockCache.listSent).toHaveBeenCalledWith(mockId, expect.objectContaining({ version: 'v2' })));
    expect(send).toHaveBeenCalledWith(mockId, { changes: [{ op: 'change', itemId: 'i-bananas', change: { done: true } }] });
  });

  it('unticks a ticked line', async () => {
    await render(onPhone());
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Butter' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith(mockId, { changes: [{ op: 'change', itemId: 'i-butter', change: { done: false } }] }));
  });

  it('adds a line from the box at the bottom, which stays ready for the next one', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    // Nothing typed: the microphone, which says why it can't listen here.
    await user.press(screen.getByRole('button', { name: 'Say it' }));
    expect(screen.getByText('Saying a line out loud needs the app on a phone. Type it here for now.')).toBeOnTheScreen();
    // (Each new line gets an id of its own from the phone; so does each change that waits.)
    await user.type(screen.getByLabelText('Add an item'), '  Oat milk ');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith(mockId, { changes: [{ op: 'add', add: { clientId: 'client-1', text: 'Oat milk' } }] }));
    expect(screen.getByLabelText('Add an item').props.value).toBe('');
    // Return adds as well, without putting the keyboard away.
    await user.type(screen.getByLabelText('Add an item'), 'Rice', { submitEditing: true });
    await waitFor(() => expect(send).toHaveBeenLastCalledWith(mockId, { changes: [{ op: 'add', add: { clientId: 'client-3', text: 'Rice' } }] }));
    expect(screen.getByLabelText('Add an item').props.submitBehavior).toBe('submit');
  });

  it('offers what the list held before, one tap away, and not what is on it again', async () => {
    asked.mockReturnValue(loaded(groceries({ suggestions: [{ text: 'Eggs', section: 'Fridge' }, { text: 'bananas', section: 'Fruit and veg' }, { text: 'Bread', section: 'Bakery' }] })));
    const api = held();
    await render(onPhone());
    expect(screen.queryByRole('button', { name: 'Add bananas again' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add Eggs again' }));
    // It is on the list at once, under the heading it had, and no longer offered.
    expect(screen.getByRole('checkbox', { name: 'Eggs', checked: false })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add Eggs again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add Bread again' })).toBeOnTheScreen();
    await api.answer();
    await waitFor(() => expect(send).toHaveBeenCalledWith(mockId, { changes: [{ op: 'add', add: { clientId: 'client-1', text: 'Eggs' } }] }));
  });

  it("opens a line: its words, small print, amount and heading, whether it comes back, whose job it is, and who it is kept from", async () => {
    await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Milk, 2 litres. More' }));
    expect(screen.getByRole('header', { name: 'Milk, 2 litres' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Every week', checked: true })).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('Line'));
    await user.type(screen.getByLabelText('Line'), 'Milk, 3 litres');
    await user.type(screen.getByLabelText('Small print'), 'the blue one');
    await user.type(screen.getByLabelText('Amount'), '1,89');
    await user.press(screen.getByRole('radio', { name: 'Never' }));
    // Whose job it is comes first, who it is kept from second: Alex's job, kept from Mia.
    await user.press(screen.getAllByRole('checkbox', { name: 'Alex' })[0]!);
    await user.press(screen.getAllByRole('checkbox', { name: 'Mia' }).at(-1)!);
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(mockId, {
        changes: [{ op: 'change', itemId: 'i-milk', change: { text: 'Milk, 3 litres', note: 'the blue one', amountCents: 189, stopRepeating: true, assignedTo: 'm-alex', hideFrom: ['m-mia'] } }],
      }),
    );
  });

  it('does not save an amount it cannot read, and sends nothing when nothing changed', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Bananas. More' }));
    await user.type(screen.getByLabelText('Amount'), 'a few');
    expect(screen.getByText('Write the amount as a number, like 45 or 4.50.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(screen.getByLabelText('Amount'));
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(send).not.toHaveBeenCalled();
  });

  it('moves a line up and down among the lines under its heading, and removes it', async () => {
    await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Red onions. More' }));
    await user.press(screen.getByRole('button', { name: 'Move up' }));
    await waitFor(() => expect(send).toHaveBeenLastCalledWith(mockId, { changes: [{ op: 'change', itemId: 'i-onions', change: { before: 'i-bananas' } }] }));
    await user.press(screen.getByRole('button', { name: 'Bananas. More' }));
    // The first line under its heading can't go further up.
    expect(screen.queryByRole('button', { name: 'Move up' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Move down' }));
    await waitFor(() => expect(send).toHaveBeenLastCalledWith(mockId, { changes: [{ op: 'change', itemId: 'i-bananas', change: { before: 'i-berries' } }] }));
    const api = held();
    await user.press(screen.getByRole('button', { name: 'Birthday candles. More' }));
    await user.press(screen.getByRole('button', { name: 'Remove this line' }));
    expect(screen.queryByRole('checkbox', { name: 'Birthday candles' })).toBeNull();
    await api.answer();
    await waitFor(() => expect(send).toHaveBeenLastCalledWith(mockId, { changes: [{ op: 'remove', itemId: 'i-candles' }] }));
  });

  it('shows amounts at the right and adds them up', async () => {
    asked.mockReturnValue(loaded(giftIdeas));
    await render(onPhone());
    expect(screen.getByText('€45')).toBeOnTheScreen();
    expect(screen.getByText('€90')).toBeOnTheScreen();
    expect(screen.getByText('Alex bought them')).toBeOnTheScreen();
    expect(screen.getByText('€163 in all · €45 ticked')).toBeOnTheScreen();
  });

  it('hides the ticked lines when the person says so, for them only, and shows them again', async () => {
    const hiding = groceries({ showTicked: false });
    jest.mocked(lookAtChecklist).mockResolvedValue(hiding);
    const view = await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Hide ticked lines' }));
    await waitFor(() => expect(mockCache.listSent).toHaveBeenCalledWith(mockId, hiding));
    expect(lookAtChecklist).toHaveBeenCalledWith(mockId, { showTicked: false });
    asked.mockReturnValue(loaded(hiding));
    await view.rerender(onPhone());
    expect(screen.queryByRole('checkbox', { name: 'Red onions' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Bananas' })).toBeOnTheScreen();
    expect(screen.getByText('2 ticked lines hidden')).toBeOnTheScreen();
    jest.mocked(lookAtChecklist).mockResolvedValue(groceries());
    await user.press(screen.getByRole('button', { name: 'Show ticked lines' }));
    await waitFor(() => expect(lookAtChecklist).toHaveBeenLastCalledWith(mockId, { showTicked: true }));
  });

  it('clears the ticked lines, renames the list, pins it, and deletes it after asking', async () => {
    const cleared = groceries({ version: 'v3' });
    jest.mocked(clearDoneItems).mockResolvedValue(cleared);
    jest.mocked(renameChecklist).mockResolvedValue(groceries({ title: 'Saturday shop' }));
    jest.mocked(pinThing).mockResolvedValue(undefined);
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(onPhone());
    const user = userEvent.setup();
    const menu = async (row: string) => {
      await user.press(screen.getByRole('button', { name: 'More' }));
      await user.press(screen.getByRole('button', { name: row }));
    };
    await menu('Clear the ticked lines');
    await waitFor(() => expect(mockCache.listSent).toHaveBeenCalledWith(mockId, cleared));
    await menu('Pin to the top of Notes');
    await waitFor(() => expect(mockCache.notePinned).toHaveBeenCalledWith({ id: mockId, circleId: 'c-linds' }, true));
    await menu('Rename');
    await user.clear(screen.getByLabelText('Name of the list'));
    await user.type(screen.getByLabelText('Name of the list'), 'Saturday shop');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(renameChecklist).toHaveBeenCalledWith(mockId, { title: 'Saturday shop', emoji: undefined }));
    await menu('Delete list');
    expect(screen.getByRole('header', { name: 'Delete this list?' })).toBeOnTheScreen();
    expect(deleteThing).not.toHaveBeenCalled();
    const asking = () => (asked.mock.calls.at(-1) as [string, { query: { enabled: boolean } }])[1].query.enabled;
    expect(asking()).toBe(true);
    await user.press(screen.getAllByRole('button', { name: 'Delete list' }).at(-1)!);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(deleteThing).toHaveBeenCalledWith(mockId);
    expect(mockCache.noteGone).toHaveBeenCalledWith({ id: mockId, circleId: 'c-linds' });
    // The screen is still there while it closes: it doesn't ask for the list it has just deleted.
    expect(asking()).toBe(false);
    await act(async () => setLeaving(mockId, false));
  });

  it('asks for the list again when deleting it did not work', async () => {
    jest.mocked(deleteThing).mockRejectedValueOnce(new ApiError(500, 'error', 'Something went wrong on our side. Try again.'));
    await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Delete list' }));
    await user.press(screen.getAllByRole('button', { name: 'Delete list' }).at(-1)!);
    expect(await screen.findByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect((asked.mock.calls.at(-1) as [string, { query: { enabled: boolean } }])[1].query.enabled).toBe(true);
  });

  it('says what the API says when clearing did not work', async () => {
    jest.mocked(clearDoneItems).mockRejectedValue(new ApiError(0, 'unreachable', "Can't reach Homeport right now. Check your connection and try again."));
    await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Clear the ticked lines' }));
    expect(await screen.findByText("Can't reach Homeport right now. Check your connection and try again.")).toBeOnTheScreen();
  });

  it('is for reading only for someone who may not change it', async () => {
    asked.mockReturnValue(loaded(groceries({ canEdit: false, mine: false })));
    await render(onPhone());
    expect(screen.getByText('You can read this list, but not change it.')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Bananas' })).toBeDisabled();
    expect(screen.queryByLabelText('Add an item')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bananas. More' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'More' }));
    // What is theirs to do stays: how they look at it, and their own pin.
    expect(screen.getByRole('button', { name: 'Hide ticked lines' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pin to the top of Notes' })).toBeOnTheScreen();
    for (const row of ['Clear the ticked lines', 'Rename', 'Delete list']) expect(screen.queryByRole('button', { name: row })).toBeNull();
  });

  it('says so when the list is empty', async () => {
    asked.mockReturnValue(loaded(checklist({ items: [], title: 'Someday' })));
    await render(onPhone());
    expect(screen.getByText('Nothing on it yet')).toBeOnTheScreen();
    expect(screen.getByText('Nothing on this list yet. Add the first line below.')).toBeOnTheScreen();
  });

  it('draws its shape while it loads, and keeps its Back', async () => {
    asked.mockReturnValue(pending());
    await render(onPhone());
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('says so when it has never been loaded and there is no connection', async () => {
    asked.mockReturnValue({ ...pending(), isPaused: true, isFetching: false });
    await render(onPhone());
    expect(screen.getByRole('header', { name: "You're offline" })).toBeOnTheScreen();
  });

  it('says so when the list is not there, or not shared with this person', async () => {
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await render(onPhone());
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it("tells the person when a line they changed was removed meanwhile, in the API's words", async () => {
    send.mockResolvedValue({ answers: [{ outcome: 'gone', itemId: 'i-bananas', said: 'That line was removed while you were away, so there was nothing to change.' }], list: groceries({ items: [item({ id: 'i-milk', text: 'Milk, 2 litres' })] }) });
    await render(onPhone());
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Bananas' }));
    expect(await screen.findByText('That line was removed while you were away, so there was nothing to change.')).toBeOnTheScreen();
    expect(screen.getByText('Not everything went in')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByText('Not everything went in')).toBeNull();
    await act(async () => undefined);
  });
});
