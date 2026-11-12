import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, addBoardEntry, removeBoardEntry, useGetBoard, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { BOARD_ID, mockBoardCache, mockBoardRouterState } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded, pending } from '@/test/samples';
import { idea, jarIdeas, jarView, saturdayBoard } from '@/test/samples/perks';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11', phoneTimeZone: () => 'Europe/Ljubljana' }));

const mockLinds = linds;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const list = jest.mocked(useGetBoardEntriesInfinite) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };
const pageOf = (items: unknown[]) => ({ ...loaded({ pages: [{ items, nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });

describe('16.4 The Saturday jar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(saturdayBoard()));
    list.mockReturnValue(pageOf(jarIdeas));
    jest.mocked(actOnBoard).mockResolvedValue(saturdayBoard());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'idea-new', board: saturdayBoard() });
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined);
  });

  it('shows the slip that was pulled today, with who put it in and what is worth knowing', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'The Saturday jar' })).toBeOnTheScreen();
    expect(screen.getByText('A free day. What shall we do?')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'A picnic by the pond in Tivoli' })).toBeOnTheScreen();
    expect(screen.getByText('Mia put this one in, back in June')).toBeOnTheScreen();
    // No weather source is connected, so the slip says where the idea is; nothing is claimed about the calendar.
    expect(screen.getByRole('button', { name: 'A picnic by the pond in Tivoli. Mia put this one in, back in June. Free. 2 hours. Outdoors' })).toBeOnTheScreen();
    expect(screen.queryByText(/^All \w+ free$/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Shake again' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Let's do it" })).toBeOnTheScreen();
  });

  it('says the weather and that everyone is free once someone knows', async () => {
    asked.mockReturnValue(loaded(saturdayBoard(jarView({ weather: 'Dry until 4', everyoneFree: true }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Dry until 4')).toBeOnTheScreen();
    expect(screen.getByText('All four free')).toBeOnTheScreen();
    expect(screen.queryByText('Outdoors')).toBeNull();
  });

  it("lists what is in the jar, narrowed by the API's own filters", async () => {
    await render(inApp(<Board />));
    expect(screen.getByText('In the jar · 31 ideas')).toBeOnTheScreen();
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, { kind: 'idea', filter: 'fits', day: '2026-11-11' }, expect.anything());
    expect(screen.getByRole('button', { name: 'Build a den in the living room. Leo · at home · free' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'The big slides at the pool. Alex · half a day · about €60' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pancakes for dinner. Mia · at home · 30 minutes' })).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Rainy day' }));
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, { kind: 'idea', filter: 'rainy', day: '2026-11-11' }, expect.anything());
    await user.press(screen.getByRole('button', { name: 'At home' }));
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, { kind: 'idea', filter: 'home', day: '2026-11-11' }, expect.anything());
    await user.press(screen.getByRole('button', { name: 'Free' }));
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, { kind: 'idea', filter: 'free', day: '2026-11-11' }, expect.anything());
  });

  it('says so when nothing in the jar passes a filter, and when nothing is left in it', async () => {
    list.mockReturnValue(pageOf([]));
    const { rerender } = await render(inApp(<Board />));
    expect(screen.getByText('Nothing in the jar fits that.')).toBeOnTheScreen();
    asked.mockReturnValue(loaded(saturdayBoard(jarView({ count: 0, done: 31 }))));
    await rerender(inApp(<Board />));
    expect(screen.getByText('Nothing is left in the jar. Drop a new idea in.')).toBeOnTheScreen();
  });

  it('shakes again with what the jar was asked today', async () => {
    const after = saturdayBoard(jarView({ pulled: idea({ id: 'idea-river', text: 'Cycle to the river and back', emoji: null, minutes: 180 }) }));
    jest.mocked(actOnBoard).mockResolvedValue(after);
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Shake again' }));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalledWith(after));
    expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'shake', body: { minutes: undefined, cents: undefined, outdoors: true } }, DAY);
  });

  it("says yes to the slip: it goes on today's calendar, in the phone's time zone", async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: "Let's do it" }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'do', body: { day: '2026-11-11', timeZone: 'Europe/Ljubljana' } }, DAY));
  });

  it('leads to the event once the slip was said yes to', async () => {
    const yes = idea({ done: true, doneOn: '2026-11-11', eventId: 'event-picnic', albumId: 'album-picnic' });
    asked.mockReturnValue(loaded(saturdayBoard(jarView({ count: 30, done: 1, pulled: yes, comingUp: [yes] }))));
    list.mockReturnValue(pageOf([]));
    await render(inApp(<Board />));
    expect(screen.getAllByText('Today · on the calendar, with an album for the photos').length).toBe(2);
    expect(screen.queryByRole('button', { name: "Let's do it" })).toBeNull();
    expect(screen.getByText('You said yes to')).toBeOnTheScreen();
    expect(screen.getByText('Nothing in the jar fits that.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'See it in the calendar' }));
    expect(mockBoardRouterState.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'event', id: 'event-picnic' } });
  });

  it('asks what fits before the first shake of the day', async () => {
    asked.mockReturnValue(loaded(saturdayBoard(jarView({ asked: null, pulled: null }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Not shaken today')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Shake the jar' }));
    expect(screen.getByRole('header', { name: 'What fits today?' })).toBeOnTheScreen();
    expect(screen.getByText('The jar pulls one idea that fits. It has no weather report, so it asks.')).toBeOnTheScreen();
    await user.press(screen.getByRole('radio', { name: '2 hours' }));
    await user.press(screen.getByRole('radio', { name: 'Free' }));
    await user.press(screen.getByRole('radio', { name: 'Indoors' }));
    await user.press(screen.getAllByRole('button', { name: 'Shake the jar' }).at(-1)!);
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'shake', body: { minutes: 120, cents: 0, outdoors: false } }, DAY));
  });

  it('asks for something else from More, starting from what was asked', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Ask for something else' }));
    expect(screen.getByRole('radio', { name: 'Outdoors' })).toBeChecked();
    await user.press(screen.getByRole('radio', { name: 'Up to €20' }));
    await user.press(screen.getByRole('button', { name: 'Shake the jar' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'shake', body: { minutes: undefined, cents: 2000, outdoors: true } }, DAY));
  });

  it('says why the jar could not pull anything', async () => {
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(409, 'nothing_fits', 'Nothing in the jar fits that. Ask for less, or drop a new idea in.'));
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Shake again' }));
    expect(await screen.findByText('Nothing in the jar fits that. Ask for less, or drop a new idea in.')).toBeOnTheScreen();
  });

  it("drops an idea in: what it is, where, how long, and whose idea it is (a child's is dropped in for them)", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Drop an idea in' }));
    const save = screen.getByRole('button', { name: 'Drop it in' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('The idea'), 'A blanket fort with torches');
    await user.press(screen.getByRole('radio', { name: 'Tent' }));
    await user.press(screen.getAllByRole('radio', { name: 'At home' }).at(-1)!);
    await user.press(screen.getByRole('button', { name: '30 minutes' }));
    // Nora's own, or one of the children's: not Alex's, who drops his own in.
    expect(screen.queryByRole('button', { name: 'Alex' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Leo' }));
    await user.press(save);
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'idea', fields: { text: 'A blanket fort with torches', emoji: '⛺', place: 'home', minutes: 30, cents: 0, byMemberId: 'm-leo' } }, DAY));
  });

  it('keeps what an idea costs, and refuses an amount that is not one', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Drop an idea in' }));
    await user.type(screen.getByLabelText('The idea'), 'The roller rink');
    await user.type(screen.getByLabelText('About what it costs'), 'a lot');
    expect(screen.getByText('Write an amount, like 20 or 12.50.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Drop it in' })).toBeDisabled();
    await user.clear(screen.getByLabelText('About what it costs'));
    await user.type(screen.getByLabelText('About what it costs'), '32');
    await user.press(screen.getByRole('button', { name: 'Drop it in' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'idea', fields: { text: 'The roller rink', emoji: '🧺', cents: 3200, byMemberId: 'm-nora' } }, DAY));
  });

  it('opens an idea: says yes to that one, or takes it out', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Pancakes for dinner/ }));
    expect(screen.getByRole('header', { name: 'Pancakes for dinner' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: "Let's do this one" }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'do', body: { ideaId: 'idea-pancakes', day: '2026-11-11', timeZone: 'Europe/Ljubljana' } }, DAY));

    await user.press(screen.getByRole('button', { name: /^Build a den/ }));
    await user.press(screen.getByRole('button', { name: 'Take it out of the jar' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('idea-den'));
  });

  it("leaves someone else's idea in the jar for a person who may only look", async () => {
    asked.mockReturnValue(loaded(saturdayBoard(jarView(), { mine: false, canEdit: false })));
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^The big slides at the pool/ }));
    expect(screen.getByRole('button', { name: "Let's do this one" })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Take it out of the jar' })).toBeNull();
  });

  it('says an empty jar is empty, and offers the first idea', async () => {
    asked.mockReturnValue(loaded(saturdayBoard(jarView({ count: 0, asked: null, pulled: null }))));
    list.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'The jar is empty' })).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Drop an idea in' }).length).toBe(2);
  });
});
