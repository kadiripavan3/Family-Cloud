import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { addBoardEntry, changeBoardEntry, removeBoardEntry, useGetBoard, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { BOARD_ID } from '@/test/boards';
import { inApp } from '@/test/phone';
import { loaded, pending } from '@/test/samples';
import { flatCircle, heardBoard, heardQuote, heardView, pinClock, quoteClock, quoteHeating, quoteMould } from '@/test/samples/flat';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockFlat, useCircles: () => [mockFlat], useCircleIfAny: () => mockFlat }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: (props: { visible: boolean }) => mockSheet(props) }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));

const mockFlat = flatCircle;
function mockSheet({ visible }: { visible: boolean }) {
  const { Text } = jest.requireActual('react-native');
  return visible ? <Text>the audience sheet</Text> : null;
}
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const list = jest.mocked(useGetBoardEntriesInfinite) as unknown as jest.Mock;
const DAY = { day: '2026-11-12' };
const pageOf = (items: unknown[]) => ({ ...loaded({ pages: [{ items, nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
const notYet = () => ({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });

describe('18.6 Heard in the kitchen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pinClock();
    asked.mockReturnValue(loaded(heardBoard()));
    list.mockReturnValue(notYet());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'quote-new', board: heardBoard() });
    jest.mocked(changeBoardEntry).mockResolvedValue(heardBoard());
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
  });
  afterEach(() => jest.useRealTimers());

  it('shows the newest lines at once, each with who said it and when or what about', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Heard in the kitchen' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'All, 112' })).toBeSelected();
    // The chips are the people who were quoted, most first; the viewer is "You".
    for (const who of ['Lea', 'Lena', 'You']) expect(screen.getByRole('button', { name: who })).toBeOnTheScreen();
    expect(screen.getByText("“I'm not hungover. I'm buffering.”")).toBeOnTheScreen();
    // Said this week and written down that day: the weekday and the time. Older ones carry the date, or the words about them.
    expect(screen.getByRole('button', { name: "“I'm not hungover. I'm buffering.”. Lea · Sunday, 11:40" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "“That's not mould. That's character.”. You · about the bathroom ceiling" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '“Whose turn is it to have opinions about the heating?”. Lena · the first cold night' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "“I'm not late. The clock is early.”. Lea · 9 Oct" })).toBeOnTheScreen();
    expect(list).toHaveBeenCalledWith(BOARD_ID, { kind: 'quote', member: undefined, q: undefined, day: '2026-11-12' }, expect.anything());
  });

  it('has the audience on More, where the bar is full', async () => {
    await render(inApp(<Board />));
    expect(screen.queryByRole('button', { name: /^Seen by/ })).toBeNull();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Who can see this' }));
    expect(screen.getByText('the audience sheet')).toBeOnTheScreen();
  });

  it("shows one person's lines from the API's list", async () => {
    list.mockImplementation((_id: string, params: { member?: string }) => (params.member === 'm-lena' ? pageOf([quoteHeating]) : notYet()));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Lena' }));
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, expect.objectContaining({ member: 'm-lena' }), expect.anything());
    expect(screen.getByRole('button', { name: 'Lena' })).toBeSelected();
    expect(screen.getByText('“Whose turn is it to have opinions about the heating?”')).toBeOnTheScreen();
    expect(screen.queryByText("“I'm not hungover. I'm buffering.”")).toBeNull();
    await user.press(screen.getByRole('button', { name: 'All, 112' }));
    expect(screen.getByText("“I'm not hungover. I'm buffering.”")).toBeOnTheScreen();
  });

  it('searches the words, and says so when nothing is found', async () => {
    list.mockImplementation((_id: string, params: { q?: string }) => (params.q === 'mould' ? pageOf([quoteMould]) : params.q ? pageOf([]) : notYet()));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Lea' }));
    await user.press(screen.getByRole('button', { name: 'Search what was said' }));
    await user.type(screen.getByLabelText('Search what was said'), 'mould');
    // A chip that was chosen before doesn't narrow the search.
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, expect.objectContaining({ q: 'mould', member: undefined }), expect.anything());
    expect(screen.getByText("“That's not mould. That's character.”")).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Search what was said'), 'zz');
    expect(screen.getByText('Nobody said anything with “mouldzz” in it.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.getByRole('button', { name: 'All, 112' })).toBeOnTheScreen();
  });

  it("writes a line down for whoever's chip is showing", async () => {
    list.mockImplementation((_id: string, params: { member?: string }) => (params.member ? pageOf([quoteHeating]) : notYet()));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Lena' }));
    await user.type(screen.getByLabelText('Who said what?'), 'The heating is on. Emotionally.');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'quote', fields: { text: 'The heating is on. Emotionally.', saidByMemberId: 'm-lena' } }, DAY));
  });

  it('asks who said it when everyone is showing: one of the flat, or a name written in', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Who said what?'), 'Is this milk fine? Define fine.');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('header', { name: 'Who said it?' })).toBeOnTheScreen();
    expect(screen.getByText('“Is this milk fine? Define fine.”')).toBeOnTheScreen();
    expect(addBoardEntry).not.toHaveBeenCalled();
    // (Two rows have her name: the chips that choose whose lines to show, and this one.)
    await user.press(screen.getAllByRole('button', { name: 'Lea' })[1]!);
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'quote', fields: { text: 'Is this milk fine? Define fine.', saidByMemberId: 'm-lea' } }, DAY));
    await waitFor(() => expect(screen.queryByRole('header', { name: 'Who said it?' })).toBeNull());
    // The box is empty again; someone who doesn't live here is a name.
    await user.type(screen.getByLabelText('Who said what?'), 'Nice flat. Shame about the stairs.');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await user.type(screen.getByLabelText("Someone who doesn't live here"), 'The plumber');
    await user.press(screen.getByRole('button', { name: 'Write it down for them' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenLastCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'quote', fields: { text: 'Nice flat. Shame about the stairs.', saidByName: 'The plumber' } }, DAY));
  });

  it('opens a line to see who wrote it down, adds a few words on it, and takes it out', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^“I'm not late\. The clock is early\.”/ }));
    expect(screen.getByText('Lea, on 9 October 2026. Written down by Lena.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(screen.getByLabelText('When, or what about'), 'the morning of the exam');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeBoardEntry).toHaveBeenCalledWith('quote-clock', { fields: { about: 'the morning of the exam' } }, DAY));
    await user.press(screen.getByRole('button', { name: /^“I'm not hungover/ }));
    expect(screen.getByText('Lea, on 8 November 2026. Written down by you.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Take it out' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('quote-buffering'));
  });

  it('names someone from outside the flat by the name that was written in', async () => {
    asked.mockReturnValue(loaded(heardBoard(heardView({ total: 1, people: [], latest: [heardQuote({ who: null, whoName: 'The plumber', about: 'looking at the boiler', mine: false })] }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('button', { name: "“I'm not hungover. I'm buffering.”. The plumber · looking at the boiler" })).toBeOnTheScreen();
  });

  it('says so when nothing was written down yet, and has no box for someone who may only look', async () => {
    asked.mockReturnValue(loaded(heardBoard(heardView({ total: 0, people: [], latest: [] }), { canEdit: false })));
    await render(inApp(<Board />));
    expect(screen.getByText('Nothing written down yet')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Who said what?')).toBeNull();
  });

  it('reads on from the list once it has answered', async () => {
    list.mockReturnValue(pageOf([heardQuote(), quoteMould, quoteHeating, quoteClock, heardQuote({ id: 'quote-older', text: 'That pan is soaking. It has been soaking since March.', day: '2026-10-05' })]));
    await render(inApp(<Board />));
    expect(screen.getByText('“That pan is soaking. It has been soaking since March.”')).toBeOnTheScreen();
  });
});
