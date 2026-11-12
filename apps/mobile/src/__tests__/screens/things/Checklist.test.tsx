import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addChecklistItem, changeChecklistItem, clearDoneItems, deleteThing, removeChecklistItem, useGetChecklist } from '@/api/generated/homeport';
import Checklist from '@/app/(app)/checklist/[id]';
import { inApp, newClient } from '@/test/phone';
import { checklist, failed, item, linds, loaded, me, pending } from '@/test/samples';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { checklistLineChanged: jest.fn(() => Promise.resolve()), checklistSaved: jest.fn(() => Promise.resolve()), thingDeleted: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({
  useGetChecklist: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  getGetChecklistQueryKey: (id: string) => [`/v1/checklists/${id}`],
  addChecklistItem: jest.fn(),
  changeChecklistItem: jest.fn(),
  removeChecklistItem: jest.fn(),
  clearDoneItems: jest.fn(),
  deleteThing: jest.fn(),
}));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => 'client-1') }));

const mockId = '22222222-2222-4222-8222-222222222222';
const mockLinds = linds;
const mockMe = loaded(me());
const asked = jest.mocked(useGetChecklist) as unknown as jest.Mock;
const groceries = checklist({
  items: [
    item({ id: 'i-1', text: 'Bananas', section: 'Fruit and veg' }),
    item({ id: 'i-2', text: 'Red onions', section: 'Fruit and veg', done: true }),
    item({ id: 'i-3', text: 'Roller skates, size 33', note: 'Alex bought them', amountCents: 4500 }),
  ],
});

describe('a list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(groceries));
  });

  it('shows its name, how much is left, its lines under their headings, and who sees it', async () => {
    await render(inApp(<Checklist />));
    expect(screen.getByRole('header', { name: 'Groceries' })).toBeOnTheScreen();
    expect(screen.getByText('2 left of 3')).toBeOnTheScreen();
    expect(screen.getByText('Fruit and veg')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Bananas', checked: false })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Red onions', checked: true })).toBeOnTheScreen();
    // A small note under a line, and its amount at the right.
    expect(screen.getByText('Alex bought them')).toBeOnTheScreen();
    expect(screen.getByText('€45')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: The Linds. Change who can see this' })).toBeOnTheScreen();
  });

  it("asks again every few seconds while it is open, so another person's ticks appear", async () => {
    await render(inApp(<Checklist />));
    expect(asked).toHaveBeenCalledWith(mockId, { query: { refetchInterval: 4000 } });
  });

  it('ticks and unticks a line, and tells the lists that show it', async () => {
    jest.mocked(changeChecklistItem).mockResolvedValue(item({ id: 'i-1', text: 'Bananas', done: true }));
    await render(inApp(<Checklist />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Bananas' }));
    await waitFor(() => expect(mockCache.checklistLineChanged).toHaveBeenCalledWith(groceries));
    expect(changeChecklistItem).toHaveBeenCalledWith('i-1', { done: true });
    await user.press(screen.getByRole('checkbox', { name: 'Red onions' }));
    await waitFor(() => expect(changeChecklistItem).toHaveBeenLastCalledWith('i-2', { done: false }));
  });

  it('shows a tick at once, before the API has answered', async () => {
    const client = newClient();
    client.setQueryData([`/v1/checklists/${mockId}`], groceries);
    jest.mocked(changeChecklistItem).mockReturnValue(new Promise(() => undefined));
    await render(inApp(<Checklist />, client));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Bananas' }));
    const shown = client.getQueryData<typeof groceries>([`/v1/checklists/${mockId}`]);
    expect(shown?.items.find((one) => one.id === 'i-1')?.done).toBe(true);
    expect([shown?.left, shown?.done]).toEqual([1, 2]);
  });

  it('adds a line at the bottom, each one once', async () => {
    jest.mocked(addChecklistItem).mockResolvedValue(item({ id: 'i-9', text: 'Milk, 2 litres' }));
    await render(inApp(<Checklist />));
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.type(screen.getByLabelText('Add a line'), 'Milk, 2 litres');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getByLabelText('Add a line').props.value).toBe(''));
    expect(addChecklistItem).toHaveBeenCalledWith(mockId, { clientId: 'client-1', text: 'Milk, 2 litres' });
    expect(mockCache.checklistLineChanged).toHaveBeenCalled();
  });

  it("removes a line from the line's own menu", async () => {
    jest.mocked(removeChecklistItem).mockResolvedValue(undefined);
    await render(inApp(<Checklist />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Bananas. More' }));
    await user.press(screen.getByRole('button', { name: 'Remove this line' }));
    await waitFor(() => expect(removeChecklistItem).toHaveBeenCalledWith('i-1'));
  });

  it('clears the ticked lines, and is deleted by its owner after asking', async () => {
    const cleared = checklist({ items: [groceries.items[0]!, groceries.items[2]!] });
    jest.mocked(clearDoneItems).mockResolvedValue(cleared);
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(inApp(<Checklist />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Clear the ticked lines' }));
    await waitFor(() => expect(mockCache.checklistSaved).toHaveBeenCalledWith(cleared));
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Delete list' }));
    expect(screen.getByRole('header', { name: 'Delete this list?' })).toBeOnTheScreen();
    await user.press(screen.getAllByRole('button', { name: 'Delete list' }).pop()!);
    await waitFor(() => expect(mockCache.thingDeleted).toHaveBeenCalled());
    expect(deleteThing).toHaveBeenCalledWith(mockId);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('can be read but not changed by someone it is shared with to view', async () => {
    asked.mockReturnValue(loaded({ ...groceries, mine: false, canEdit: false }));
    await render(inApp(<Checklist />));
    expect(screen.getByText('You can read this list, but not change it.')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Bananas' })).toBeDisabled();
    expect(screen.queryByLabelText('Add a line')).toBeNull();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bananas. More' })).toBeNull();
  });

  it("says what went wrong when a tick can't be saved", async () => {
    jest.mocked(changeChecklistItem).mockRejectedValue(new ApiError(403, 'view_only', 'You can look at this, but not change it.'));
    await render(inApp(<Checklist />));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Bananas' }));
    expect(await screen.findByText('You can look at this, but not change it.')).toBeOnTheScreen();
  });

  it('says a list with nothing on it is empty, keeps its Back while it loads, and says so when it is gone', async () => {
    asked.mockReturnValue(loaded(checklist({ items: [] })));
    const view = await render(inApp(<Checklist />));
    expect(screen.getByText('Nothing on it yet')).toBeOnTheScreen();
    expect(screen.getByText('Nothing on this list yet. Add the first line below.')).toBeOnTheScreen();
    asked.mockReturnValue(pending());
    await view.rerender(inApp(<Checklist />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await act(async () => view.rerender(inApp(<Checklist />)));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
  });
});
