import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { addBoardEntry, changeBoardEntry, removeBoardEntry, useGetBoard, useGetBoards, useSearchCircle } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { BOARD_ID, mockBoardRouterState } from '@/test/boards';
import { inApp } from '@/test/phone';
import { loaded, pending } from '@/test/samples';
import { flatCircle, houseRules, kittyCard, pinClock, rollBoard, rollView, whoToCall } from '@/test/samples/flat';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi({ useGetBoards: jest.fn(), useSearchCircle: jest.fn() }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockFlat, useCircles: () => [mockFlat], useCircleIfAny: () => mockFlat }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/lib/useDebounced', () => ({ useDebounced: (value: unknown) => value }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));

const mockFlat = flatCircle;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const boards = jest.mocked(useGetBoards) as unknown as jest.Mock;
const search = jest.mocked(useSearchCircle) as unknown as jest.Mock;
const DAY = { day: '2026-11-12' };

describe("18.8 Everyone who's lived here", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pinClock();
    asked.mockReturnValue(loaded(rollBoard()));
    boards.mockReturnValue(loaded({ items: [kittyCard, { ...kittyCard, id: 'board-split', template: 'fairer_split', title: 'How we split', emoji: '📊', glance: '3 splits agreed' }, { ...kittyCard, id: 'board-heard', template: 'heard', title: 'Heard in the kitchen' }], nextCursor: null }));
    search.mockReturnValue(pending());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'entry-new', board: rollBoard() });
    jest.mocked(changeBoardEntry).mockResolvedValue(rollBoard());
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
  });
  afterEach(() => jest.useRealTimers());

  it('shows the roll: who lives here now, who lived here before, with the years and a line each', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Trubarjeva 9, flat 3' })).toBeOnTheScreen();
    expect(screen.getByText('Here now')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lena. Since 2026. The small room, facing the street' })).toBeOnTheScreen();
    expect(screen.getByText('2026 –')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lea. Since 2024' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'You. Since 2023' })).toBeOnTheScreen();
    expect(screen.getByText('Before')).toBeOnTheScreen();
    expect(screen.getByText('2023 – 25')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ana. From 2023 to 2025. Moved to Lisbon. Still in the photos, off the Wi‑Fi.' })).toBeOnTheScreen();
    // Several people in one row stand as a number.
    expect(screen.getByText('2021 – 23')).toBeOnTheScreen();
    expect(screen.getByText('2')).toBeOnTheScreen();
    expect(screen.getByText('Two people before you')).toBeOnTheScreen();
    // The three rows under the roll; what is handed on is named by its things.
    expect(screen.getByRole('button', { name: 'When someone moves out. Memories stay theirs. Codes and logins stop.' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Handed on to the next person. House rules, Bin days' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'A last settling-up. Bills to the day, the kitty, the deposit' })).toBeOnTheScreen();
  });

  it("writes the year someone moved in and a line about them over the circle's own", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Lea. Since 2024' }));
    expect(screen.getByRole('header', { name: 'Lea' })).toBeOnTheScreen();
    // Someone who lives here has no year they left.
    expect(screen.queryByLabelText('Moved out (year)')).toBeNull();
    await user.clear(screen.getByLabelText('Moved in (year)'));
    await user.type(screen.getByLabelText('Moved in (year)'), '2022');
    await user.type(screen.getByLabelText('A line about them'), 'The room with the balcony');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'resident', fields: { memberId: 'm-lea', fromYear: 2022, untilYear: undefined, note: 'The room with the balcony' } }, DAY));
  });

  it('keeps the years of someone who left in order', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Ana\./ }));
    await user.clear(screen.getByLabelText('Moved out (year)'));
    await user.type(screen.getByLabelText('Moved out (year)'), '2020');
    expect(screen.getByText("The year they left can't be before the year they came.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(screen.getByLabelText('Moved out (year)'));
    await user.type(screen.getByLabelText('Moved out (year)'), '2026');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, expect.objectContaining({ kind: 'resident', fields: { memberId: 'm-ana', fromYear: 2023, untilYear: 2026, note: 'Moved to Lisbon. Still in the photos, off the Wi‑Fi.' } }), DAY));
  });

  it('adds people from before the app, changes them, and takes them off the roll', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Add people from before' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(screen.getByLabelText('Who'), 'A painter and her cat');
    await user.type(screen.getByLabelText('Moved in (year)'), '2015');
    await user.type(screen.getByLabelText('Moved out (year)'), '2021');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'before', fields: { name: 'A painter and her cat', count: 1, fromYear: 2015, untilYear: 2021, note: undefined } }, DAY));

    await user.press(screen.getByRole('button', { name: /^Two people before you\./ }));
    await user.clear(screen.getByLabelText('How many people'));
    await user.type(screen.getByLabelText('How many people'), '3');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeBoardEntry).toHaveBeenCalledWith('before-two', { fields: { name: 'Two people before you', count: 3, fromYear: 2021, untilYear: 2023, note: 'Left the house manual and a cactus' } }, DAY));

    await user.press(screen.getByRole('button', { name: /^Two people before you\./ }));
    await user.press(screen.getByRole('button', { name: 'Take them off the roll' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('before-two'));
  });

  it('says what happens when someone moves out, uncomfortable parts included, and leads to People', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^When someone moves out\./ }));
    expect(screen.getByText(/^What they kept for themselves in Homeport stays theirs\. What was shared with the flat stops for them the moment they are removed/)).toBeOnTheScreen();
    expect(screen.getByText(/the app stops showing them, but it cannot make anyone forget them\.$/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Open People' }));
    expect(mockBoardRouterState.navigate).toHaveBeenCalledWith('/people');
  });

  it('lists what is handed on, opens one, takes one off, and adds one found by its name', async () => {
    search.mockImplementation((_circle: string, params: { q?: string }) => (params.q === 'call' ? loaded({ words: 'call', hits: [{ thing: whoToCall, snippet: null }, { thing: houseRules, snippet: null }] }) : pending()));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Handed on to the next person\./ }));
    expect(screen.getByRole('button', { name: /^House rules/ })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Take Bin days off the list' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('handed-bins'));
    await user.type(screen.getByLabelText('Add something of the flat'), 'call');
    expect(search).toHaveBeenLastCalledWith('c-flat', { q: 'call' }, expect.objectContaining({ query: expect.objectContaining({ enabled: true }) }));
    // What is handed on already isn't offered again.
    expect(screen.queryByRole('button', { name: 'Hand on House rules' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Hand on Who to call' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, expect.objectContaining({ kind: 'handed_on', fields: { thingId: whoToCall.id } }), DAY));
    await user.press(screen.getByRole('button', { name: /^House rules/ }));
    expect(mockBoardRouterState.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'page', id: houseRules.id } });
  });

  it("leads a last settling-up to the flat's own boards that do the sums", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^A last settling-up\./ }));
    expect(screen.getByText(/^Before someone goes: split the bills up to their last day/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "The kitty. €6.40 left · Lena hasn't paid in yet" })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Heard in the kitchen/ })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'How we split. 3 splits agreed' }));
    expect(mockBoardRouterState.navigate).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: 'board-split' } });
  });

  it('says so when nothing is handed on yet, and only shows the roll to someone who may only look', async () => {
    asked.mockReturnValue(loaded(rollBoard(rollView({ handedOn: [], before: [] }), { canEdit: false, mine: false })));
    await render(inApp(<Board />));
    expect(screen.getByRole('button', { name: 'Handed on to the next person. Nothing chosen yet' })).toBeOnTheScreen();
    expect(screen.queryByText('Before')).toBeNull();
    // The rows aren't pressed to change them.
    expect(screen.queryByRole('button', { name: 'Lea. Since 2024' })).toBeNull();
    expect(screen.getByText('Lea')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Handed on to the next person\./ }));
    expect(screen.getByText('Nothing is handed on yet.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Add something of the flat')).toBeNull();
  });
});
