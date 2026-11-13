import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, addBoardEntry, changeBoard, removeBoardEntry, useGetBoard, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { pickPhoto, uploadPhoto } from '@/features/templates/media';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { failed, loaded, pending } from '@/test/samples';
import { flatCircle, kittyBoard, kittyLine, kittyOwing, kittyView, pinClock } from '@/test/samples/flat';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockFlat, useCircles: () => [mockFlat], useCircleIfAny: () => mockFlat }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/features/templates/media', () => ({ pickPhoto: jest.fn(), uploadPhoto: jest.fn(), uploadSound: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));

const mockFlat = flatCircle;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const list = jest.mocked(useGetBoardEntriesInfinite) as unknown as jest.Mock;
const DAY = { day: '2026-11-12' };
const pageOf = (items: unknown[]) => ({ ...loaded({ pages: [{ items, nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });

describe('18.3 The kitty', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pinClock();
    asked.mockReturnValue(loaded(kittyBoard()));
    list.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    jest.mocked(actOnBoard).mockResolvedValue(kittyBoard());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'line-new', board: kittyBoard() });
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
    jest.mocked(changeBoard).mockResolvedValue(kittyBoard());
  });
  afterEach(() => jest.useRealTimers());

  it('shows what the pot holds, who has not paid in, the usual things, whose turn it is, and the month in and out', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'The kitty' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Seen by: The flat/ })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'The kitty holds €6.40' })).toHaveTextContent('€6.40');
    expect(screen.getByText("€10 each on the 1st · Lena hasn't paid in yet")).toBeOnTheScreen();
    expect(screen.getByText('Running low? Tap it')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Loo roll' })).toBeChecked();
    for (const thing of ['Bin bags', 'Oil', 'Dish soap', 'Coffee']) expect(screen.getByRole('checkbox', { name: thing })).not.toBeChecked();
    expect(screen.getByText("It's Lena's turn to shop")).toBeOnTheScreen();
    expect(screen.getByText('Lena gets the list: whatever is ticked above.')).toBeOnTheScreen();
    // In and out: each purchase a row, the month's paying in as one, and what was left over.
    expect(screen.getByRole('button', { name: 'Loo roll, bin bags. Lea · Tuesday · receipt kept. −€8.90' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Olive oil, salt, sponges. You · 2 Nov. −€14.70' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Paid in for November. You and Lea. +€20.00' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Left over from October. €10.00. Everything in and out' })).toBeOnTheScreen();
    // Kai has paid in and it isn't his turn: nothing on the page asks him for anything.
    expect(screen.queryByRole('button', { name: 'Pay in €10 for November' })).toBeNull();
    expect(screen.queryByRole('button', { name: "I've shopped" })).toBeNull();
  });

  it('marks a thing as running low with a tap, and as not any more with another', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: 'Bin bags' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'low', body: { itemId: 'item-bin-bags', low: true } }, DAY));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalled());
    await user.press(screen.getByRole('checkbox', { name: 'Loo roll' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'low', body: { itemId: 'item-loo-roll', low: false } }, DAY));
  });

  it('asks for the paying in while it is owed, and says whose turn it is when it is the viewer\'s', async () => {
    asked.mockReturnValue(loaded(kittyBoard(kittyOwing)));
    await render(inApp(<Board />));
    expect(screen.getByText("€10 each on the 1st · You, Lea and Lena haven't paid in yet")).toBeOnTheScreen();
    expect(screen.getByText("It's your turn to shop")).toBeOnTheScreen();
    expect(screen.getByText('You get the list: whatever is ticked above.')).toBeOnTheScreen();
    expect(screen.getByText('Nothing in or out yet in November.')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Pay in €10 for November' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'in', fields: {} }, DAY));
    // "I've shopped" opens what was bought.
    await user.press(screen.getByRole('button', { name: "I've shopped" }));
    expect(screen.getByRole('header', { name: 'What was bought?' })).toBeOnTheScreen();
  });

  it('takes what was bought out of the pot, with the receipt and what it covered', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ uri: 'file:///receipt.jpg', width: 800, height: 1200 });
    jest.mocked(uploadPhoto).mockResolvedValue('media-receipt');
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Add what was bought' }));
    expect(screen.getByRole('button', { name: 'Take it out of the kitty' })).toBeDisabled();
    await user.type(screen.getByLabelText('What'), 'Loo roll, coffee');
    await user.type(screen.getByLabelText('What it cost'), 'lots');
    expect(screen.getByText('Write an amount, like 8.90.')).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('What it cost'));
    await user.type(screen.getByLabelText('What it cost'), '7,40');
    await user.press(screen.getByRole('button', { name: 'Add a photo of the receipt' }));
    expect(await screen.findByRole('button', { name: 'Change the photo' })).toBeOnTheScreen();
    // What was running low is taken to be bought, unless it is unticked here.
    expect(screen.getAllByRole('checkbox', { name: 'Loo roll', checked: true })).toHaveLength(2);
    await user.press(screen.getByRole('button', { name: 'Take it out of the kitty' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'out', fields: { what: 'Loo roll, coffee', cents: 740, mediaId: 'media-receipt', itemIds: ['item-loo-roll'] } }, DAY));
    expect(uploadPhoto).toHaveBeenCalledWith({ uri: 'file:///receipt.jpg', width: 800, height: 1200 });
    await waitFor(() => expect(screen.queryByRole('header', { name: 'What was bought?' })).toBeNull());
  });

  it('opens a purchase with its receipt; only whoever wrote it can take it out', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Loo roll, bin bags\./ }));
    expect(screen.getByText('Lea · 10 November · −€8.90')).toBeOnTheScreen();
    expect(screen.getByLabelText('The receipt')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Take it out' })).toBeNull();
  });

  it("takes the viewer's own purchase out, and their own paying in back", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Olive oil, salt, sponges\./ }));
    await user.press(screen.getByRole('button', { name: 'Take it out' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('line-oil'));
    await waitFor(() => expect(mockBoardCache.boardTouched).toHaveBeenCalled());
    await user.press(screen.getByRole('button', { name: /^Paid in for November\./ }));
    expect(screen.getAllByText('1 November')).toHaveLength(2);
    await user.press(screen.getByRole('button', { name: 'Take mine back' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenLastCalledWith('line-in-kai'));
  });

  it('keeps the usual things: one more, and one taken off', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'The usual things' }));
    await user.type(screen.getByLabelText('One more'), 'Washing powder');
    await user.press(screen.getByRole('button', { name: 'Add it' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'item', fields: { name: 'Washing powder' } }, DAY));
    await user.press(screen.getByRole('button', { name: 'Take Coffee off' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('item-coffee'));
  });

  it('changes what each pays in and on which day', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'What each pays in' }));
    await user.clear(screen.getByLabelText('Each pays in, every month'));
    await user.type(screen.getByLabelText('Each pays in, every month'), '12.50');
    await user.clear(screen.getByLabelText('On which day of the month (1 to 28)'));
    await user.type(screen.getByLabelText('On which day of the month (1 to 28)'), '31');
    expect(screen.getByText('Write a day from 1 to 28.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(screen.getByLabelText('On which day of the month (1 to 28)'));
    await user.type(screen.getByLabelText('On which day of the month (1 to 28)'), '3');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeBoard).toHaveBeenCalledWith(BOARD_ID, { title: undefined, settings: { eachCents: 1250, payInDay: 3 } }, DAY));
  });

  it('reads every line there ever was from the list, a page at a time', async () => {
    list.mockReturnValue(pageOf([kittyLine(), kittyLine({ id: 'line-october', title: 'Dish soap, sponges, washing powder', who: { memberId: 'm-lena', name: 'Lena', avatarUrl: null }, day: '2026-10-15', cents: -2000, receipt: null })]));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Left over from October\./ }));
    expect(screen.getByRole('header', { name: 'In and out, all of it' })).toBeOnTheScreen();
    expect(screen.getByText('Dish soap, sponges, washing powder')).toBeOnTheScreen();
    expect(screen.getByText('Lena · 15 October')).toBeOnTheScreen();
    expect(screen.getByText('−€20.00')).toBeOnTheScreen();
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, { day: '2026-11-12' }, expect.objectContaining({ query: expect.objectContaining({ enabled: true }) }));
  });

  it('says in a sentence why a change did not work', async () => {
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(409, 'gone', 'That thing was taken off the list.'));
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'Oil' }));
    expect(await screen.findByText('That thing was taken off the list.')).toBeOnTheScreen();
  });

  it('is short when more was spent than paid in, and lets someone who may only look do just that', async () => {
    asked.mockReturnValue(loaded(kittyBoard(kittyView({ balanceCents: -320, notPaidIn: [] }), { canEdit: false, mine: false })));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'The kitty is €3.20 short' })).toHaveTextContent('−€3.20');
    expect(screen.getByText('€10 each on the 1st · Everyone has paid in')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Loo roll' })).toBeDisabled();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: 'Add what was bought' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Everything in and out' })).toBeOnTheScreen();
  });

  it('keeps its Back while it loads and when it cannot be read', async () => {
    asked.mockReturnValue(pending());
    const { rerender } = await render(inApp(<Board />));
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    asked.mockReturnValue(failed(new ApiError(500, 'server_error', 'Something went wrong on our side.')));
    await rerender(inApp(<Board />));
    expect(screen.getByText('Something went wrong on our side.')).toBeOnTheScreen();
  });
});
