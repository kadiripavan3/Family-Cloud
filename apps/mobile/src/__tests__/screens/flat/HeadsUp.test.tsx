import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, addBoardEntry, changeBoard, removeBoardEntry, useGetBoard, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { loaded, pending } from '@/test/samples';
import { awayNotice, flatCircle, headsUpBoard, headsUpView, kaiBrief, lenaBrief, notice, overNotice, pinClock, sisterNotice } from '@/test/samples/flat';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockFlat, useCircles: () => [mockFlat], useCircleIfAny: () => mockFlat }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));

const mockFlat = flatCircle;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const list = jest.mocked(useGetBoardEntriesInfinite) as unknown as jest.Mock;
const DAY = { day: '2026-11-12' };
const pageOf = (items: unknown[]) => ({ ...loaded({ pages: [{ items, nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });

describe('18.5 Heads-up', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pinClock();
    asked.mockReturnValue(loaded(headsUpBoard()));
    list.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    jest.mocked(actOnBoard).mockResolvedValue(headsUpBoard());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'notice-new', board: headsUpBoard() });
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
    jest.mocked(changeBoard).mockResolvedValue(headsUpBoard());
  });
  afterEach(() => jest.useRealTimers());

  it('shows each notice with who wrote it and how the others stand on it, and the line that always stands', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Heads-up' })).toBeOnTheScreen();
    // Lea's Saturday waits for Kai: Lena is fine, and the two buttons are his.
    expect(screen.getByRole('button', { name: 'Six people over on Saturday, done by midnight. Lea · an hour ago. Waits for your answer' })).toBeOnTheScreen();
    expect(screen.getByText("Lena's fine")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Let's talk" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Fine by me' })).toBeOnTheScreen();
    // Lena's sister: a few words more in place of the time, and everyone said fine.
    expect(screen.getByText('Lena · on the sofa')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'You and Lea said fine. Change your answer' })).toBeOnTheScreen();
    // Kai's own week away: the nights that come off his bills, and the words Lea sent with her yes.
    expect(screen.getByText('You · 7 nights off your bills')).toBeOnTheScreen();
    expect(screen.getByText('Lea will water the plants')).toBeOnTheScreen();
    expect(screen.getByText('Quiet after 23:00 on weeknights')).toBeOnTheScreen();
    expect(screen.getByText('From the House rules, agreed by all three.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Tell the flat something')).toBeOnTheScreen();
    // Nobody answers their own, and one answer per notice is enough: two buttons on the whole page.
    expect(screen.getAllByRole('button', { name: 'Fine by me' })).toHaveLength(1);
  });

  it('says it is fine with one tap', async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Fine by me' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'answer', body: { noticeId: 'notice-saturday', says: 'fine' } }, DAY));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalled());
  });

  it("says let's talk, with a few words", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "Let's talk" }));
    expect(screen.getByRole('radio', { name: "Let's talk" })).toBeChecked();
    await user.type(screen.getByLabelText('A few words with it, if you like'), 'Can we keep it to ten?');
    await user.press(screen.getByRole('button', { name: 'Send my answer' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'answer', body: { noticeId: 'notice-saturday', says: 'talk', text: 'Can we keep it to ten?' } }, DAY));
  });

  it('shows who would rather talk, and lets the viewer change their own answer or take it back', async () => {
    const talking = notice({ replies: [{ who: lenaBrief, says: 'talk', text: 'on a work night?', yours: false }, { who: kaiBrief, says: 'fine', text: null, yours: true }], waitingFor: [], yourAnswer: 'fine', needsYou: false });
    asked.mockReturnValue(loaded(headsUpBoard(headsUpView({ notices: [talking], needYou: 0 }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Lena wants to talk: on a work night?')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Fine by me' })).toBeNull();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'You said fine. Change your answer' }));
    expect(screen.getByRole('radio', { name: 'Fine by me' })).toBeChecked();
    await user.press(screen.getByRole('radio', { name: "Let's talk" }));
    await user.press(screen.getByRole('button', { name: 'Send my answer' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'answer', body: { noticeId: 'notice-saturday', says: 'talk', text: null } }, DAY));
    await user.press(screen.getByRole('button', { name: 'You said fine. Change your answer' }));
    await user.press(screen.getByRole('button', { name: 'Take my answer back' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'answer', body: { noticeId: 'notice-saturday', says: null } }, DAY));
  });

  it('tells the flat one line from the box at the end', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Tell the flat something'), 'The plumber comes on Thursday');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'notice', fields: { text: 'The plumber comes on Thursday' } }, DAY));
    // The microphone is the phone's: the button says so.
    await user.press(screen.getByRole('button', { name: 'Say it out loud' }));
    expect(screen.getByText('Saying it out loud arrives with the phone app. Until then, type the line.')).toBeOnTheScreen();
  });

  it('writes a whole notice from the plus: time away needs the day you leave and the day you are back', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Write a notice' }));
    await user.type(screen.getByLabelText('What do you want to tell the flat?'), 'Skiing for a week');
    await user.type(screen.getByLabelText('A few words more, if you like'), 'back on Sunday night');
    await user.press(screen.getByRole('radio', { name: "I'm away" }));
    expect(screen.getByText('The nights you are away come off your share when a bill is split by nights at home.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tell the flat' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'The day you leave: No day. Change' }));
    await user.press(screen.getByRole('button', { name: '20 November 2026' }));
    await user.press(screen.getByRole('button', { name: "The day you're back: No day. Change" }));
    await user.press(screen.getByRole('button', { name: '27 November 2026' }));
    expect(screen.getByRole('button', { name: 'The day you leave: Fri 20 Nov. Change' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "The day you're back: Fri 27 Nov. Change" })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Tell the flat' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'notice', fields: { text: 'Skiing for a week', detail: 'back on Sunday night', what: 'away', from: '2026-11-20', until: '2026-11-27' } }, DAY));
    await waitFor(() => expect(screen.queryByRole('header', { name: 'Tell the flat' })).toBeNull());
  });

  it("opens a notice to see everyone's answer, and takes the viewer's own down", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^I'm away 20 to 27 November\./ }));
    expect(screen.getByText('You · 20 to 27 November · written 3 days ago')).toBeOnTheScreen();
    expect(screen.getByText("It's fine · will water the plants")).toBeOnTheScreen();
    expect(screen.getByText('Waiting for an answer from Lena.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Take it down' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('notice-away'));
  });

  it("has no way to take someone else's notice down", async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^My sister's staying, Friday to Sunday\./ }));
    expect(screen.getByText('Lena · on the sofa · 13 to 15 November · written yesterday')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Take it down' })).toBeNull();
  });

  it('keeps the earlier notices under More, read from the list', async () => {
    list.mockReturnValue(pageOf([notice(), sisterNotice, awayNotice, overNotice]));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Earlier notices. 3 notices' }));
    expect(screen.getByText("At my parents' for a while")).toBeOnTheScreen();
    expect(screen.getByText('Lena · 1 to 20 October · 19 nights')).toBeOnTheScreen();
    // Only what is over: the three on the page aren't listed again.
    expect(screen.getAllByText('Six people over on Saturday, done by midnight')).toHaveLength(1);
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, { kind: 'notice', day: '2026-11-12' }, expect.objectContaining({ query: expect.objectContaining({ enabled: true }) }));
  });

  it('changes the line that always stands, and drops it when it is emptied', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'The line that always stands' }));
    await user.clear(screen.getByLabelText('The line'));
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeBoard).toHaveBeenCalledWith(BOARD_ID, { title: undefined, settings: { standing: '', standingNote: '' } }, DAY));
  });

  it('says so when there is nothing to tell, and why an answer did not work', async () => {
    asked.mockReturnValue(loaded(headsUpBoard(headsUpView({ notices: [], earlier: 0, needYou: 0, standing: null, standingNote: null }))));
    const { rerender } = await render(inApp(<Board />));
    expect(screen.getByText('Nothing to tell just now')).toBeOnTheScreen();
    expect(screen.queryByText('Quiet after 23:00 on weeknights')).toBeNull();

    asked.mockReturnValue(loaded(headsUpBoard()));
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(409, 'your_own', "It's your own notice. The others answer it."));
    await rerender(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Fine by me' }));
    expect(await screen.findByText("It's your own notice. The others answer it.")).toBeOnTheScreen();
  });

  it('lets someone who may only look still answer, but not write', async () => {
    asked.mockReturnValue(loaded(headsUpBoard(headsUpView(), { canEdit: false, mine: false })));
    await render(inApp(<Board />));
    expect(screen.queryByLabelText('Tell the flat something')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Write a notice' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Fine by me' })).toBeOnTheScreen();
  });
});
