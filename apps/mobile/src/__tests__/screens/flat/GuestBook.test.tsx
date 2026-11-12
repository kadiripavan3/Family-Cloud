import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { actOnBoard, addBoardEntry, removeBoardEntry, useGetBoard, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { pickPhoto, uploadPhoto } from '@/features/templates/media';
import { shareText } from '@/lib/share';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { loaded, pending } from '@/test/samples';
import { flatCircle, guestBookBoard, guestBookView, guestLine, lineWaiting, pinClock } from '@/test/samples/flat';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockFlat, useCircles: () => [mockFlat], useCircleIfAny: () => mockFlat }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/features/templates/media', () => ({ pickPhoto: jest.fn(), uploadPhoto: jest.fn(), uploadSound: jest.fn() }));
jest.mock('@/lib/share', () => ({ ...jest.requireActual('@/lib/share'), shareText: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));

const mockFlat = flatCircle;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const list = jest.mocked(useGetBoardEntriesInfinite) as unknown as jest.Mock;
const DAY = { day: '2026-11-12' };
const LINK = 'https://homeport.app/book/6hzd5-vkx3q-4qy6v-6tz5a';
const pageOf = (items: unknown[]) => ({ ...loaded({ pages: [{ items, nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });

describe('18.7 The guest book', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pinClock();
    asked.mockReturnValue(loaded(guestBookBoard()));
    list.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    jest.mocked(actOnBoard).mockResolvedValue(guestBookBoard());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'line-new', board: guestBookBoard() });
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
    jest.mocked(shareText).mockResolvedValue('copied');
  });
  afterEach(() => jest.useRealTimers());

  it('shows the code by the door with the count, and the book, newest first', async () => {
    asked.mockReturnValue(loaded(guestBookBoard(guestBookView({ guests: 23, nights: 61, since: 2024 }))));
    list.mockReturnValue(pageOf(guestBookView().latest));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'The guest book' })).toBeOnTheScreen();
    expect(screen.getByText('The code by the door')).toBeOnTheScreen();
    expect(screen.getByText('23 guests and 61 nights on the sofa since 2024.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Print' })).toBeOnTheScreen();
    // A stay that is still recent names its month; one without nights says who they are.
    expect(screen.getByRole('button', { name: '“Came for a weekend, stayed for the pancakes.”. Tom, from Leeds · 3 nights in October' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "“Best sofa in Ljubljana. Sorry about the glass.”. Maja, Lena's sister · 2 nights" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '“Thank you for New Year. I remember most of it.”. Ana · who used to live here' })).toBeOnTheScreen();
    expect(screen.getByLabelText("Tom's photo")).toBeOnTheScreen();
    // A book longer than what came with the board is read on from the list.
    expect(list).toHaveBeenCalledWith(BOARD_ID, { kind: 'line', day: '2026-11-12' }, expect.objectContaining({ query: expect.objectContaining({ enabled: true }) }));
  });

  it('draws the code from the link behind it, with the link to copy', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    // A short book came whole with the board: the list isn't asked.
    expect(list).toHaveBeenCalledWith(BOARD_ID, expect.anything(), expect.objectContaining({ query: expect.objectContaining({ enabled: false }) }));
    await user.press(screen.getByRole('button', { name: 'Print' }));
    expect(screen.getByRole('header', { name: 'The code by the door' })).toBeOnTheScreen();
    expect(screen.getByRole('image', { name: 'The QR code that opens the guest book' })).toBeOnTheScreen();
    expect(screen.getByText('Scan to write in the guest book')).toBeOnTheScreen();
    expect(screen.getByText('homeport.app/book/6hzd5-vkx3q-4qy6v-6tz5a')).toBeOnTheScreen();
    // A phone build can't print yet: the button says so, and what to do instead.
    await user.press(screen.getByRole('button', { name: 'Print this page' }));
    expect(screen.getByText(/^Printing arrives with the phone app\./)).toBeOnTheScreen();
  });

  it('makes a new code after asking: the old one stops working', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Print' }));
    await user.press(screen.getByRole('button', { name: 'Make a new code' }));
    expect(screen.getByText('The code by the door stops working at once, and so does every copy of its link. Print the new one and put it up.')).toBeOnTheScreen();
    expect(actOnBoard).not.toHaveBeenCalled();
    await user.press(screen.getAllByRole('button', { name: 'Make a new code' })[1]!);
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'new_code', body: {} }, DAY));
  });

  it("shares the door's link from the bar, and says when it was copied instead", async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Share the link' }));
    await waitFor(() => expect(shareText).toHaveBeenCalledWith(`Write a line in the guest book: ${LINK}`));
    expect(await screen.findByText('Link copied')).toBeOnTheScreen();
  });

  it('keeps what came through the door apart until a flatmate lets it in', async () => {
    asked.mockReturnValue(loaded(guestBookBoard(guestBookView({ waiting: [lineWaiting] }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Waiting at the door')).toBeOnTheScreen();
    expect(screen.getByText('“The balcony at sunrise. Thank you.”')).toBeOnTheScreen();
    expect(screen.getByText('Nika, from Maribor · 1 night in November')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: "Let Nika's line in" }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'let_in', body: { entryId: 'line-waiting' } }, DAY));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalled());
  });

  it('turns a line away after asking, which removes it', async () => {
    asked.mockReturnValue(loaded(guestBookBoard(guestBookView({ waiting: [lineWaiting] }))));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "Turn Nika's line away" }));
    expect(screen.getByRole('header', { name: 'Turn this line away?' })).toBeOnTheScreen();
    expect(removeBoardEntry).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Turn away' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('line-waiting'));
  });

  it('opens a line with its photo and who let it in, and takes it out of the book', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^“Came for a weekend/ }));
    expect(screen.getByText('Tom, from Leeds · 3 nights in October · 12 October 2026')).toBeOnTheScreen();
    expect(screen.getByText('Let in by Lea')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Take it out of the book' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('line-tom'));
  });

  it('writes a line in for a guest, with a photo', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ uri: 'file:///guest.jpg', width: 1200, height: 800 });
    jest.mocked(uploadPhoto).mockResolvedValue('media-guest');
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Write a line in for a guest' }));
    expect(screen.getByRole('button', { name: 'Put it in the book' })).toBeDisabled();
    await user.type(screen.getByLabelText("The guest's name"), 'Jure');
    await user.type(screen.getByLabelText('Who they are, in a few words'), "Kai's brother");
    await user.type(screen.getByLabelText('The line they left'), 'The sofa is longer than it looks.');
    await user.type(screen.getByLabelText('Nights they stayed'), 'two');
    expect(screen.getByText('Write a number, like 2.')).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('Nights they stayed'));
    await user.type(screen.getByLabelText('Nights they stayed'), '2');
    await user.press(screen.getByRole('button', { name: 'Add a photo' }));
    expect(await screen.findByRole('button', { name: 'Change the photo' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Put it in the book' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'line', fields: { name: 'Jure', about: "Kai's brother", text: 'The sofa is longer than it looks.', nights: 2, mediaId: 'media-guest' } }, DAY));
  });

  it('shows someone who does not live here the book, and nothing of the door', async () => {
    asked.mockReturnValue(loaded(guestBookBoard(guestBookView({ link: null, decides: false }), { canEdit: false, mine: false })));
    await render(inApp(<Board />));
    expect(screen.getByText('“Came for a weekend, stayed for the pancakes.”')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Print' })).toBeNull();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Share the link' }));
    expect(screen.getByText('The code and its link are for the people who live here.')).toBeOnTheScreen();
    expect(shareText).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'OK' }));
    await user.press(screen.getByRole('button', { name: /^“Came for a weekend/ }));
    expect(screen.queryByRole('button', { name: 'Take it out of the book' })).toBeNull();
  });

  it('says so while nobody has written in it yet', async () => {
    asked.mockReturnValue(loaded(guestBookBoard(guestBookView({ guests: 0, nights: 0, since: null, latest: [] }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Nobody has written in it yet.')).toBeOnTheScreen();
    expect(screen.getByText('Print the code and put it by the door. The first guest to scan it leaves the first line.')).toBeOnTheScreen();
  });

  it('leaves what waits out of the book when a long book is read from the list', async () => {
    asked.mockReturnValue(loaded(guestBookBoard(guestBookView({ guests: 40, waiting: [lineWaiting] }))));
    list.mockReturnValue(pageOf([lineWaiting, guestLine(), guestLine({ id: 'line-old', name: 'Jure', about: "Kai's brother", text: 'First guest. The sofa is longer than it looks.', nights: 2, day: '2024-03-14', photo: null })]));
    await render(inApp(<Board />));
    expect(screen.getAllByText('“The balcony at sunrise. Thank you.”')).toHaveLength(1);
    expect(screen.getByText("Jure, Kai's brother · 2 nights")).toBeOnTheScreen();
  });
});
