import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { addBoardEntry, useGetBoard, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { pickPhoto, uploadPhoto } from '@/features/templates/media';
import { formatDayLong } from '@/lib/dates';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded, pending } from '@/test/samples';
import { jarBoard, jarView, slip } from '@/test/samples/keepsakes';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/features/templates/media', () => ({ pickPhoto: jest.fn(), uploadPhoto: jest.fn(), uploadSound: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const mockLinds = linds;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const list = jest.mocked(useGetBoardEntriesInfinite) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };
const pageOf = (items: unknown[]) => ({ ...loaded({ pages: [{ items, nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });

describe('15.6 The good things jar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(jarBoard()));
    list.mockReturnValue({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'slip-new', board: jarBoard(jarView({ count: 144 })) });
  });

  it('counts the good things, says when the jar opens, and shows the newest slips folded', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: '143 good things' })).toBeOnTheScreen();
    expect(screen.getByText("The jar opens on New Year's Eve. Until then nobody can read it, only add to it.")).toBeOnTheScreen();
    expect(screen.getByText('Leo put in a drawing')).toBeOnTheScreen();
    expect(screen.getByText('Alex added one from Reine')).toBeOnTheScreen();
    expect(screen.getByText(`${formatDayLong('2026-11-10')} · from a journey`)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: `Alex added one from Reine. ${formatDayLong('2026-11-10')}. Folded` })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Read the year back' })).toBeNull();
  });

  it("lets the person who wrote a slip down read it, and nobody else until the jar opens", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Leo put in a drawing/ }));
    expect(screen.getByText('Leo drew all five of us on the tricycle.')).toBeOnTheScreen();
    expect(screen.getByLabelText('The picture on the slip')).toBeOnTheScreen();
  });

  it("says of someone else's slip only when it opens", async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^Alex added one from Reine/ }));
    expect(screen.getByText('It stays folded until the jar opens on 31 December. Only the person who wrote it down can read it before then.')).toBeOnTheScreen();
  });

  it('drops a slip in, and the count that comes back is kept', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Something good from this week'), 'First snow, and nobody was late.');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalledWith(expect.objectContaining({ view: expect.objectContaining({ count: 144 }) })));
    expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'slip', fields: { text: 'First snow, and nobody was late.', mediaId: undefined } }, DAY);
  });

  it('drops in a photo or a drawing with the line', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ uri: 'file:///drawing.jpg', width: 600, height: 600 });
    jest.mocked(uploadPhoto).mockResolvedValue('media-drawing');
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add a photo or a drawing' }));
    expect(await screen.findByLabelText('The picture you chose')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Something good from this week'), 'Leo drew the dog.');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'slip', fields: { text: 'Leo drew the dog.', mediaId: 'media-drawing' } }, DAY));
  });

  it('says that saying it out loud arrives with the phone app', async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Say it out loud' }));
    expect(screen.getByText('Saying it out loud arrives with the phone app. For now, type it: it goes into the jar the same way.')).toBeOnTheScreen();
  });

  it('reads the year back once the jar is open', async () => {
    asked.mockReturnValue(loaded(jarBoard(jarView({ open: true, daysToGo: 0, latest: [slip(), slip({ id: 'slip-reine', who: { memberId: 'm-alex', name: 'Alex', avatarUrl: null }, what: 'note', place: 'Reine', mine: false, sealed: false, text: 'The northern lights, at last.', picture: null })] }))));
    list.mockReturnValue(pageOf([slip({ text: 'Leo drew all five of us on the tricycle.' }), slip({ id: 'slip-2', what: 'note', text: 'Pancakes for dinner.', picture: null })]));
    await render(inApp(<Board />));
    expect(screen.getByText('The jar is open. Read the year back, one slip at a time.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Read the year back' }));
    expect(screen.getByRole('header', { name: 'The good things of 2026' })).toBeOnTheScreen();
    expect(screen.getByText('Pancakes for dinner.')).toBeOnTheScreen();
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, { kind: 'slip', filter: '2026', day: '2026-11-11' }, expect.objectContaining({ query: expect.objectContaining({ enabled: true }) }));
  });

  it("opens an earlier year's jar, which stays open for good", async () => {
    const last = jarBoard(jarView({ year: 2025, count: 120, opensOn: '2025-12-31', open: true, latest: [slip({ id: 'slip-2025', day: '2025-12-30', text: 'The last swim of the year.', picture: null, what: 'note' })], years: [{ year: 2025, count: 120 }] }));
    asked.mockImplementation((_id: string, params: { show?: string }) => loaded(params.show ? last : jarBoard(jarView({ years: [{ year: 2025, count: 120 }] }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Earlier jars')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'The jar of 2025. 120 good things' }));
    expect(asked).toHaveBeenCalledWith(BOARD_ID, { day: '2026-11-11', show: '2025' }, expect.anything());
    expect(screen.getByRole('header', { name: '120 good things' })).toBeOnTheScreen();
    expect(screen.getByText('The jar of 2025, open for good.')).toBeOnTheScreen();
    // Nothing more goes into a jar that was opened.
    expect(screen.queryByLabelText('Something good from this week')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Back to 2026. 143 good things' }));
    expect(screen.getByRole('header', { name: '143 good things' })).toBeOnTheScreen();
  });

  it('says an empty jar is empty', async () => {
    asked.mockReturnValue(loaded(jarBoard(jarView({ count: 0, latest: [] }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: '0 good things' })).toBeOnTheScreen();
    expect(screen.getByText('The jar is empty. Drop in the first good thing.')).toBeOnTheScreen();
  });
});
