import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addBoardEntry, changeBoard, removeBoardEntry, useGetBoard, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { PiggyBankSetup } from '@/features/perks/piggy-bank/PiggyBankSetup';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded, pending } from '@/test/samples';
import { money, piggyBoard, piggyView } from '@/test/samples/perks';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi({ changeBoard: jest.fn() }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const mockLinds = linds;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const list = jest.mocked(useGetBoardEntriesInfinite) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };
const pageOf = (items: unknown[]) => ({ ...loaded({ pages: [{ items, nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });

describe('16.2 The piggy bank', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(piggyBoard()));
    list.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'money-new', board: piggyBoard() });
    jest.mocked(changeBoard).mockResolvedValue(piggyBoard());
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined);
  });

  it('counts what is in the three jars to the cent, and says it is not a bank account', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: "Mia's piggy bank" })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: '€23.40. Kept count of here. Not a bank account.' })).toBeOnTheScreen();
    expect(screen.getByText('€23.40')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Spend: €8.40, 42% full. Pay in, take out or move' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save: €12.00, 68% full. Pay in, take out or move' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Give: €3.00, 20% full. Pay in, take out or move' })).toBeOnTheScreen();
    expect(screen.getByText('The Bank of Mum and Dad pays 5% a month')).toBeOnTheScreen();
    expect(screen.getByText('On what is in Save. €0.60 arrived on 1 November.')).toBeOnTheScreen();
  });

  it('lists what happened lately, each with where it went, and the fund the stars fill', async () => {
    await render(inApp(<Board />));
    expect(screen.getByText('Lately')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '10 stars from the chore wheel. Sunday · into Save. +€2.00' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'From Grandma Astrid. For a good school report. +€5.00' })).toBeOnTheScreen();
    // Money from someone outside the family has their initials in front.
    expect(screen.getByLabelText('Astrid Lind')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Stickers. Her own choice, out of Spend. −€3.50' })).toBeOnTheScreen();
    expect(screen.getByText('Skates fund: 68%')).toBeOnTheScreen();
    expect(screen.getByText('16 stars to go')).toBeOnTheScreen();
  });

  it('pays stars into Save: the stars set the amount', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Pay in' }));
    expect(screen.getByRole('radio', { name: 'Save' })).toBeChecked();
    expect(screen.getByText('A star is worth €0.20. Leave the amount empty and the stars set it.')).toBeOnTheScreen();
    const save = screen.getByRole('button', { name: 'Pay it in' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Stars it stands for'), '5');
    await user.type(screen.getByLabelText('Where it came from'), '5 stars from the habit chart');
    await user.press(save);
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalled());
    expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'in', fields: { jar: 'save', stars: 5, title: '5 stars from the habit chart' } }, DAY);
  });

  it('takes money out of the jar that was pressed', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Spend: €8\.40/ }));
    await user.press(screen.getByRole('radio', { name: 'Take out' }));
    expect(screen.getByRole('radio', { name: 'Spend' })).toBeChecked();
    await user.type(screen.getByLabelText('How much'), '1,50');
    await user.type(screen.getByLabelText('What it was for'), 'Sweets');
    await user.type(screen.getByLabelText('A few words, if you like'), 'At the fair');
    await user.press(screen.getByRole('button', { name: 'Take it out' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'out', fields: { jar: 'spend', cents: 150, title: 'Sweets', note: 'At the fair' } }, DAY));
  });

  it('moves money from one jar to another', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Save: €12\.00/ }));
    await user.press(screen.getByRole('radio', { name: 'Move' }));
    // Out of Save, and into Give.
    await user.press(screen.getAllByRole('radio', { name: 'Give' }).at(-1)!);
    const move = screen.getByRole('button', { name: 'Move it' });
    expect(move).toBeDisabled();
    await user.type(screen.getByLabelText('How much'), '2');
    await user.press(move);
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'move', fields: { jar: 'save', toJar: 'give', cents: 200 } }, DAY));
  });

  it('says an amount that is not one is not one', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Pay in' }));
    await user.type(screen.getByLabelText('How much'), 'two');
    expect(screen.getByText('Write an amount, like 2 or 2.50.')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Where it came from'), 'Pocket money');
    expect(screen.getByRole('button', { name: 'Pay it in' })).toBeDisabled();
  });

  it('opens a line of money, and takes it back', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^10 stars from the chore wheel/ }));
    expect(screen.getByText('Written down by Nora, Sunday.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Take it back' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('money-stars'));
    await waitFor(() => expect(mockBoardCache.boardTouched).toHaveBeenCalled());
  });

  it("says why money that was spent since can't be taken back", async () => {
    jest.mocked(removeBoardEntry).mockRejectedValue(new ApiError(409, 'already_spent', 'Some of that money has been spent or moved since.'));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^From Grandma Astrid/ }));
    await user.press(screen.getByRole('button', { name: 'Take it back' }));
    expect(await screen.findByText('Some of that money has been spent or moved since.')).toBeOnTheScreen();
  });

  it("changes the bank's rules: the interest, what a star is worth, what Save is for", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: "The bank's rules" }));
    expect(screen.getByLabelText('Interest on Save, in percent a month')).toHaveDisplayValue('5');
    expect(screen.getByLabelText('What one star is worth')).toHaveDisplayValue('0.20');
    expect(screen.getByLabelText('What Save is for')).toHaveDisplayValue('Skates fund');
    expect(screen.getByLabelText('How many stars it takes')).toHaveDisplayValue('50');
    await user.clear(screen.getByLabelText('Interest on Save, in percent a month'));
    await user.type(screen.getByLabelText('Interest on Save, in percent a month'), '3');
    await user.press(screen.getByRole('button', { name: 'Keep the rules' }));
    await waitFor(() => expect(changeBoard).toHaveBeenCalledWith(BOARD_ID, { title: undefined, settings: { interestPercent: 3, starCents: 20, fund: { name: 'Skates fund', stars: 50 } } }, DAY));
  });

  it('reads back everything that happened, the interest too', async () => {
    list.mockReturnValue(pageOf([money(), money({ id: 'money-interest', kind: 'interest', cents: 60, title: 'Interest, 5%', stars: null, day: '2026-11-01', by: null }), money({ id: 'money-move', kind: 'move', toJar: 'spend', cents: 260, title: 'Moved to Spend', note: 'For the school fair', stars: null, day: '2026-10-31' })]));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Everything that happened' }));
    expect(screen.getByRole('header', { name: 'Everything that happened' })).toBeOnTheScreen();
    expect(screen.getByText('Interest, 5%')).toBeOnTheScreen();
    expect(screen.getByText('+€0.60')).toBeOnTheScreen();
    expect(screen.getByText('Moved to Spend')).toBeOnTheScreen();
    expect(screen.getByText('€2.60')).toBeOnTheScreen();
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, { day: '2026-11-11' }, expect.objectContaining({ query: expect.objectContaining({ enabled: true }) }));
  });

  it('shows everything to someone who does not run the bank, and lets them change nothing', async () => {
    asked.mockReturnValue(loaded(piggyBoard(piggyView({ canChange: false }))));
    await render(inApp(<Board />));
    expect(screen.getByLabelText('Save: €12.00, 68% full')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Save: €12\.00/ })).toBeNull();
    expect(screen.getByText('Skates fund: 68%')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Pay in' })).toBeNull();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: "The bank's rules" })).toBeNull();
    expect(screen.getByRole('button', { name: 'Everything that happened' })).toBeOnTheScreen();
  });

  it('asks whose piggy bank it is before it starts, and names it after them', async () => {
    const onChange = jest.fn();
    await render(inApp(<PiggyBankSetup circle={linds} onChange={onChange} />));
    expect(screen.getByText('Whose piggy bank is it?')).toBeOnTheScreen();
    // Nobody chosen yet: it can't start. The dog has no piggy bank.
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole('button', { name: 'Biscuit' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Mia' }));
    expect(onChange).toHaveBeenLastCalledWith({ title: "Mia's piggy bank", settings: { forMemberId: 'm-mia' } });
  });

  it('starts empty: no interest and no fund until the rules say so', async () => {
    asked.mockReturnValue(loaded(piggyBoard(piggyView({ totalCents: 0, jars: [{ jar: 'spend', cents: 0, goalCents: null, fill: null }, { jar: 'save', cents: 0, goalCents: null, fill: null }, { jar: 'give', cents: 0, goalCents: null, fill: null }], interestPercent: 0, lastInterest: null, nextInterestOn: null, fund: null, starCents: null, lately: [] }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: '€0.00. Kept count of here. Not a bank account.' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save: €0.00. Pay in, take out or move' })).toBeOnTheScreen();
    expect(screen.queryByText(/The Bank of Mum and Dad/)).toBeNull();
    expect(screen.getByText('Nothing has happened here yet. Pay in the first pocket money and the count starts.')).toBeOnTheScreen();
    expect(screen.getByText("Mia's pocket money")).toBeOnTheScreen();
    expect(screen.getByText('Into Spend, Save or Give')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Pay in' }));
    // Without a worth for a star there are no stars to type.
    expect(screen.queryByLabelText('Stars it stands for')).toBeNull();
  });
});
