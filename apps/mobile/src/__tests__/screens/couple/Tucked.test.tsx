import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, addBoardEntry, changeBoardEntry, removeBoardEntry, useGetBoard, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { formatDay } from '@/lib/dates';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { coupleCircle, loaded, pending } from '@/test/samples';
import { alex2, foundNote, nora2, tuckedBoard, tuckedForReader, tuckedNote, tuckedView } from '@/test/samples/couple';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockCircle, useCircles: () => [mockCircle], useCircleIfAny: () => mockCircle }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-12' }));

const mockCircle = coupleCircle;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const list = jest.mocked(useGetBoardEntriesInfinite) as unknown as jest.Mock;
const DAY = { day: '2026-11-12' };
/** A list that is read a page at a time, as the generated hook hands it over. */
const pages = (items: unknown[], more = false) => ({ ...loaded({ pages: [{ items, nextCursor: more ? 'next' : null }], pageParams: [undefined] }), hasNextPage: more, isFetchingNextPage: false, fetchNextPage: jest.fn() });

describe('17.4 Tucked notes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(tuckedBoard()));
    list.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'note-new', board: tuckedBoard() });
    jest.mocked(changeBoardEntry).mockResolvedValue(tuckedBoard());
  });

  it('shows the note that is hiding to its writer, how it turns up, and what was found so far', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Tucked notes' })).toBeOnTheScreen();
    expect(screen.getByText('Tucked away for Alex')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: '“Your coffee this morning was the best part of my day.”' })).toBeOnTheScreen();
    expect(screen.getByText('It will turn up some time before Sunday. Neither of you knows when.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Some time this week' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'When Alex lands' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Next time it rains' })).toBeOnTheScreen();
    expect(screen.getByText('Found so far · 37')).toBeOnTheScreen();
    expect(screen.getByText("“I folded your washing. You're welcome. I love you.”")).toBeOnTheScreen();
    expect(screen.getByText('Alex · you found it on Tuesday at 22:14')).toBeOnTheScreen();
    expect(screen.getByText(`You · Alex found it on ${formatDay('2026-10-31')} at 16:40`)).toBeOnTheScreen();
  });

  it("shows its reader nothing of a note that hasn't turned up: the API sends none of it", async () => {
    asked.mockReturnValue(loaded(tuckedBoard(tuckedForReader, { mine: false })));
    await render(inApp(<Board />));
    expect(screen.queryByText(/Your coffee this morning/)).toBeNull();
    expect(screen.getByText('Nothing tucked away')).toBeOnTheScreen();
    expect(screen.getByText('You write it now. It turns up for Nora at a moment neither of you knows, or one you pick.')).toBeOnTheScreen();
    // What was found is there for both: his own note, which she found.
    expect(screen.getByText('You · Nora found it on Tuesday at 22:14')).toBeOnTheScreen();
  });

  it('hands a note that has turned up to its reader, who says they found it', async () => {
    const turnedUp = tuckedNote({ id: 'note-glove', text: 'Check the glove box before you drive on Friday.', from: alex2, forPerson: nora2, mine: false, before: null });
    asked.mockReturnValue(loaded(tuckedBoard(tuckedView({ tucked: [], turnedUp: [turnedUp] }))));
    jest.mocked(actOnBoard).mockResolvedValue(tuckedBoard());
    await render(inApp(<Board />));
    expect(screen.getByText('From Alex · it just turned up')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: '“Check the glove box before you drive on Friday.”' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Found it' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'found', body: { entryId: 'note-glove' } }, DAY));
  });

  it('tucks another note away, turning up some time this week', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Tuck another' }));
    expect(screen.getByText('Until it turns up, Alex only sees on Today that a note is waiting, and who it is from. Never the words.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tuck it away' })).toBeDisabled();
    await user.type(screen.getByLabelText('Your note'), 'There is cake in the blue tin.');
    await user.press(screen.getByRole('button', { name: 'Tuck it away' }));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalled());
    expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'note', fields: { text: 'There is cake in the blue tin.', forMemberId: undefined, turnsUp: 'this_week', at: undefined } }, DAY);
  });

  it('writes a note for a time its writer picks: the day, and the time typed the way it is said', async () => {
    asked.mockReturnValue(loaded(tuckedBoard(tuckedView({ tucked: [] }))));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    // With nothing tucked away, the chips choose how the next one turns up.
    await user.press(screen.getByRole('button', { name: 'At a time I pick' }));
    await user.press(screen.getAllByRole('button', { name: 'Tuck a note away' })[0]!);
    expect(screen.getAllByRole('button', { name: 'At a time I pick' }).at(-1)).toBeSelected();
    await user.type(screen.getByLabelText('Your note'), 'Half past seven. Look up.');
    expect(screen.getByRole('button', { name: 'Tuck it away' })).toBeDisabled();
    await user.type(screen.getByLabelText('The time'), '7.30pm');
    expect(screen.getByText('It turns up at 19:30.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Tuck it away' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalled());
    const sent = jest.mocked(addBoardEntry).mock.calls[0]![1] as unknown as { fields: { turnsUp: string; at: string } };
    expect(sent.fields.turnsUp).toBe('at');
    // Tomorrow at 19:30 on this phone's clock, as a moment.
    expect(new Date(sent.fields.at).getTime()).toBe(new Date(2026, 10, 13, 19, 30).getTime());
  });

  it('changes how the note in the card turns up, and says what a way that cannot be signalled yet waits for', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Next time it rains' }));
    await waitFor(() => expect(changeBoardEntry).toHaveBeenCalledWith('note-coffee', { fields: { turnsUp: 'rains' } }, DAY));

    asked.mockReturnValue(loaded(tuckedBoard(tuckedView({ tucked: [tuckedNote({ turnsUp: 'rains', before: null, waiting: true })] }))));
    await render(inApp(<Board />));
    expect(screen.getAllByText('It is kept, and it waits. A weather source to say that it is raining. None is connected yet.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('It can be tucked away, and it waits. A weather source to say that it is raining. None is connected yet.').length).toBeGreaterThan(0);
  });

  it('takes a note back while it is still hiding, from More', async () => {
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: /^Still tucked away/ }));
    expect(screen.getByText('You can take a note back until it has turned up. After that it is theirs.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Take it back: Your coffee this morning was the best part of my day.' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('note-coffee'));
  });

  it("says in the API's words that a note which has turned up is theirs now", async () => {
    jest.mocked(changeBoardEntry).mockRejectedValue(new ApiError(409, 'turned_up', 'It has turned up. It is theirs now.'));
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'When Alex lands' }));
    expect(await screen.findByText('It has turned up. It is theirs now.')).toBeOnTheScreen();
  });

  it('shows all that was found, a page at a time, once asked', async () => {
    await render(inApp(<Board />));
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, { kind: 'note', day: '2026-11-12' }, expect.objectContaining({ query: expect.objectContaining({ enabled: false }) }));
    const more = pages([tuckedNote(), foundNote(), foundNote({ id: 'note-keys', text: 'Your keys are in the fruit bowl. As always.', foundAt: '2026-10-07T18:00:00' })], true);
    list.mockReturnValue(more);
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Show all 37' }));
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, { kind: 'note', day: '2026-11-12' }, expect.objectContaining({ query: expect.objectContaining({ enabled: true }) }));
    // What is still tucked away is not among the found.
    expect(screen.getByText('“Your keys are in the fruit bowl. As always.”')).toBeOnTheScreen();
    expect(screen.getAllByText('“Your coffee this morning was the best part of my day.”')).toHaveLength(1);
    await user.press(screen.getByRole('button', { name: 'Show more' }));
    expect(more.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('says so while nothing has been found', async () => {
    asked.mockReturnValue(loaded(tuckedBoard(tuckedView({ found: 0, foundLately: [] }))));
    await render(inApp(<Board />));
    expect(screen.getByText('None found yet. The first one is still hiding.')).toBeOnTheScreen();
  });
});
