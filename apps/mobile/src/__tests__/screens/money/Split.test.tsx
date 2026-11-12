import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addSplitExpense, addSplitPayment, changeSplitExpense, deleteThing, remindSplitMember, removeSplitExpense, removeSplitPayment, renameSplit, useGetSplit, useGetSplitExpensesInfinite } from '@/api/generated/homeport';
import Split from '@/app/(app)/split/[id]';
import { inApp } from '@/test/phone';
import { crewCircle, failed, loaded, me, pending } from '@/test/samples';
import { expense, onThe12th, split, SPLIT_ID, taxi } from '@/test/samples/money';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockCache = { splitChanged: jest.fn(() => Promise.resolve()), splitSaved: jest.fn(() => Promise.resolve()), thingDeleted: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: mockId }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => [mockCrew], useCircleIfAny: () => mockCrew }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/api/generated/homeport', () => ({
  useGetSplit: jest.fn(),
  useGetSplitExpensesInfinite: jest.fn(),
  useGetMe: jest.fn(() => mockMe),
  addSplitPayment: jest.fn(),
  removeSplitPayment: jest.fn(),
  remindSplitMember: jest.fn(),
  renameSplit: jest.fn(),
  deleteThing: jest.fn(),
  addSplitExpense: jest.fn(),
  changeSplitExpense: jest.fn(),
  removeSplitExpense: jest.fn(),
}));
jest.mock('@/lib/ids', () => ({ newClientId: jest.fn(() => 'client-1') }));

const mockId = '55555555-5555-4555-8555-555555555555';
const mockCrew = crewCircle;
const mockMe = loaded(me());
const asked = jest.mocked(useGetSplit) as unknown as jest.Mock;
const further = jest.mocked(useGetSplitExpensesInfinite) as unknown as jest.Mock;

describe('8.9 Splitting with friends', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onThe12th();
    asked.mockReturnValue(loaded(split()));
    further.mockReturnValue({ ...loaded(undefined), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
  });
  afterEach(() => jest.useRealTimers());

  it('says where the person stands after everything that was added', async () => {
    await render(inApp(<Split />));
    expect(asked).toHaveBeenCalledWith(SPLIT_ID);
    expect(screen.getByRole('header', { name: 'Lisbon weekend' })).toBeOnTheScreen();
    expect(screen.getByText('Lisbon crew · 5 friends')).toBeOnTheScreen();
    expect(screen.getByText('After 14 expenses, €1,236 in all')).toBeOnTheScreen();
    expect(screen.getByText("You're owed €64")).toBeOnTheScreen();
  });

  it('says so when the person owes, is even, or nothing was added yet', async () => {
    asked.mockReturnValue(loaded(split({ myBalanceCents: -1250 })));
    const view = await render(inApp(<Split />));
    expect(screen.getByText('You owe €12.50')).toBeOnTheScreen();
    asked.mockReturnValue(loaded(split({ myBalanceCents: 0, expenses: 0, totalCents: 0, settle: [], latest: [], paid: [] })));
    await view.rerender(inApp(<Split />));
    expect(screen.getByText("You're even")).toBeOnTheScreen();
    expect(screen.getByText('Nothing added yet')).toBeOnTheScreen();
    expect(screen.getByText('Everyone is even. Nothing to pay.')).toBeOnTheScreen();
  });

  it('lists the fewest payments that settle it, as the API worked them out', async () => {
    await render(inApp(<Split />));
    expect(screen.getByText('The fewest payments to settle up')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lea pays you. €44. Mark as paid' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Kai pays you. €20. Mark as paid' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lena pays Ana. €31. Mark as paid' })).toBeOnTheScreen();
    // Only whoever owes the person can be reminded by them.
    expect(screen.getAllByText('Remind')).toHaveLength(2);
  });

  it('lists the latest expenses: who paid, and how each is split', async () => {
    await render(inApp(<Split />));
    expect(screen.getByRole('button', { name: 'Dinner at Ramiro. Kai paid · split 5 ways. €186. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Airport taxi. You paid · split with Lea. €24. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Flat, 3 nights. Lena paid · split 5 ways. €720. Change' })).toBeOnTheScreen();
  });

  it('shows where everyone stands: what each paid, their share, and what that leaves', async () => {
    await render(inApp(<Split />));
    await userEvent.setup().press(screen.getByRole('button', { name: "After 14 expenses, €1,236 in all. You're owed €64. Where everyone stands" }));
    expect(screen.getByRole('header', { name: 'Where everyone stands' })).toBeOnTheScreen();
    expect(screen.getByText('Paid €75.10 · share €261.10')).toBeOnTheScreen();
    expect(screen.getByText('+€64')).toBeOnTheScreen();
    expect(screen.getByText('−€44')).toBeOnTheScreen();
  });

  it('marks a payment as made: who paid whom, how much, and the app moves no money', async () => {
    jest.mocked(addSplitPayment).mockResolvedValue({} as never);
    await render(inApp(<Split />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Kai pays you. €20. Mark as paid' }));
    expect(screen.getByRole('header', { name: 'Did Kai pay you €20?' })).toBeOnTheScreen();
    expect(screen.getByText('Homeport only keeps count. It moves no money itself.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Mark as paid' }));
    await waitFor(() => expect(addSplitPayment).toHaveBeenCalledWith(SPLIT_ID, { clientId: 'client-1', from: 'm-crew-2', to: 'm-crew-1', amountCents: 2000 }, { day: '2026-11-12' }));
    await waitFor(() => expect(mockCache.splitChanged).toHaveBeenCalled());
  });

  it('reminds someone of what they owe, and says that it did', async () => {
    const reminded = split({ settle: [{ ...split().settle[0]!, remindedAt: '2026-11-12T09:00:00Z' }, ...split().settle.slice(1)] });
    jest.mocked(remindSplitMember).mockResolvedValue(reminded);
    const view = await render(inApp(<Split />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Remind Lea' }));
    await waitFor(() => expect(remindSplitMember).toHaveBeenCalledWith(SPLIT_ID, 'm-crew-0'));
    await waitFor(() => expect(mockCache.splitSaved).toHaveBeenCalledWith(reminded));
    asked.mockReturnValue(loaded(reminded));
    await view.rerender(inApp(<Split />));
    expect(screen.getByText('Reminded')).toBeOnTheScreen();
  });

  it('takes back a payment that was marked as made, after asking', async () => {
    jest.mocked(removeSplitPayment).mockResolvedValue(undefined);
    await render(inApp(<Split />));
    const user = userEvent.setup();
    expect(screen.getByText('Paid back')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Ana paid Lena. €130. Take it back' }));
    expect(screen.getByRole('header', { name: 'Take this payment back?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Take it back' }));
    await waitFor(() => expect(removeSplitPayment).toHaveBeenCalledWith('pay-1'));
  });

  it('adds what the person paid, shared equally by everyone: who shares it is left to the API', async () => {
    jest.mocked(addSplitExpense).mockResolvedValue(expense());
    await render(inApp(<Split />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add what you paid' }));
    expect(screen.getByRole('header', { name: 'Add what you paid' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('What was it'), 'Pastéis de nata');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '25');
    // The person adding it paid, unless they say someone else did.
    expect(screen.getByRole('radio', { name: 'You', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Equally', checked: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(addSplitExpense).toHaveBeenCalledWith(SPLIT_ID, { clientId: 'client-1', title: 'Pastéis de nata', amountCents: 2500, paidBy: 'm-crew-1', mode: 'equal', shares: undefined }, { day: '2026-11-12' }));
    await waitFor(() => expect(mockCache.splitChanged).toHaveBeenCalled());
  });

  it('shares it among some, paid by someone else', async () => {
    jest.mocked(addSplitExpense).mockResolvedValue(expense());
    await render(inApp(<Split />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add what you paid' }));
    await fireEvent.changeText(screen.getByLabelText('What was it'), 'Taxi');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '24');
    await user.press(screen.getByRole('radio', { name: 'Lea' }));
    for (const name of ['Kai', 'Lena', 'Ana']) await user.press(screen.getByRole('checkbox', { name }));
    await user.press(screen.getByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(addSplitExpense).toHaveBeenCalledWith(SPLIT_ID, expect.objectContaining({ paidBy: 'm-crew-0', mode: 'equal', shares: [{ memberId: 'm-crew-0' }, { memberId: 'm-crew-1' }] }), expect.anything()));
  });

  it('shares it by exact amounts, which have to add up to what it cost', async () => {
    jest.mocked(addSplitExpense).mockResolvedValue(expense());
    await render(inApp(<Split />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add what you paid' }));
    await fireEvent.changeText(screen.getByLabelText('What was it'), 'Tickets');
    await fireEvent.changeText(screen.getByLabelText('Amount'), '25');
    await user.press(screen.getByRole('radio', { name: 'Exact amounts' }));
    for (const name of ['Kai', 'Lena', 'Ana']) await user.press(screen.getByRole('checkbox', { name }));
    await fireEvent.changeText(screen.getByLabelText('Lea: how much'), '10');
    expect(screen.getByText('€15 still to share out')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('You: how much'), '20');
    expect(screen.getByText('€5 more than it cost')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('You: how much'), '15,00');
    expect(screen.getByText('That adds up')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(addSplitExpense).toHaveBeenCalledWith(SPLIT_ID, expect.objectContaining({ mode: 'exact', shares: [{ memberId: 'm-crew-0', cents: 1000 }, { memberId: 'm-crew-1', cents: 1500 }] }), expect.anything()));
  });

  it('changes an expense by shares, and removes one after asking', async () => {
    jest.mocked(changeSplitExpense).mockResolvedValue(taxi);
    jest.mocked(removeSplitExpense).mockResolvedValue(undefined);
    await render(inApp(<Split />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Airport taxi\./ }));
    expect(screen.getByRole('header', { name: 'Change this expense' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Amount').props.value).toBe('24.00');
    await user.press(screen.getByRole('radio', { name: 'By shares' }));
    await fireEvent.changeText(screen.getByLabelText('Lea: how many shares'), '2');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeSplitExpense).toHaveBeenCalledWith('exp-taxi', { title: 'Airport taxi', amountCents: 2400, paidBy: 'm-crew-1', mode: 'shares', shares: [{ memberId: 'm-crew-0', weight: 2 }, { memberId: 'm-crew-1', weight: 1 }] }));
    await user.press(screen.getByRole('button', { name: /^Airport taxi\./ }));
    await user.press(screen.getByRole('button', { name: 'Remove this expense' }));
    expect(screen.getByRole('header', { name: 'Remove this expense?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remove it' }));
    await waitFor(() => expect(removeSplitExpense).toHaveBeenCalledWith('exp-taxi'));
  });

  it('scans a receipt, renames the split, and deletes it when it is the person\'s own', async () => {
    asked.mockReturnValue(loaded(split({ mine: true })));
    jest.mocked(renameSplit).mockResolvedValue(split({ title: 'Lisbon 2026' }));
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(inApp(<Split />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Scan' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/money/scan', params: { split: SPLIT_ID } });
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Rename' }));
    await fireEvent.changeText(screen.getByLabelText('What it is called'), 'Lisbon 2026');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(renameSplit).toHaveBeenCalledWith(SPLIT_ID, { title: 'Lisbon 2026' }));
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('header', { name: 'Delete this?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Delete it' }));
    await waitFor(() => expect(deleteThing).toHaveBeenCalledWith(SPLIT_ID));
    await waitFor(() => expect(mockCache.thingDeleted).toHaveBeenCalled());
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('brings the expenses after the twenty latest when asked', async () => {
    asked.mockReturnValue(loaded(split({ expenses: 40 })));
    const view = await render(inApp(<Split />));
    expect(further).toHaveBeenLastCalledWith(SPLIT_ID, undefined, { query: expect.objectContaining({ enabled: false }) });
    further.mockReturnValue({ ...loaded({ pages: [{ items: [expense(), expense({ id: 'exp-old', title: 'Tram passes' })], nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    await userEvent.setup().press(screen.getByRole('button', { name: 'Show more' }));
    await view.rerender(inApp(<Split />));
    expect(screen.getByRole('button', { name: /^Tram passes\./ })).toBeOnTheScreen();
  });

  it('only shows it to someone who may not add to it, and nobody but its owner can delete it', async () => {
    asked.mockReturnValue(loaded(split({ canEdit: false })));
    await render(inApp(<Split />));
    expect(screen.getByText('You can see this, but not add to it.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add what you paid' })).toBeNull();
    expect(screen.queryByText('Remind')).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Who can see it' })).toBeOnTheScreen();
  });

  it('keeps its Back while it loads, and says so when the split is not there', async () => {
    asked.mockReturnValue(pending());
    const view = await render(inApp(<Split />));
    expect(screen.getAllByLabelText('Loading').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await view.rerender(inApp(<Split />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
  });
});
