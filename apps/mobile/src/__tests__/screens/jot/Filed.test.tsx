import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { moveJot, undoJot, useGetChecklists, useGetJots } from '@/api/generated/homeport';
import Filed from '@/app/(app)/jot/filed';
import { takeHeldCode } from '@/features/jot/heldCode';
import { inApp } from '@/test/phone';
import { failed, loaded, pending } from '@/test/samples';
import { codeJot, eggsJot, jotMade, noteJot, plumberJot, ways } from '@/test/samples/jot';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true, canDismiss: () => false };
const mockCache = { jotUndone: jest.fn(), jotMoved: jest.fn(), jotFiled: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/ui/LightStatusBar', () => ({ LightStatusBar: () => null }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => jest.requireActual<typeof import('@/test/samples')>('@/test/samples').linds }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/api/generated/homeport', () => ({ useGetJots: jest.fn(), useGetJotWays: () => ({ data: mockWays }), useGetChecklists: jest.fn(), jot: jest.fn(), undoJot: jest.fn(), moveJot: jest.fn() }));
let mockWays = ways();

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
/** Three just now (one of them held back) and two from earlier today, the latest first. */
const today = () => [plumberJot, eggsJot, codeJot, { ...noteJot, createdAt: hoursAgo(3) }, jotMade({ createdAt: hoursAgo(3.5) })];
const show = (items = today()) => jest.mocked(useGetJots).mockReturnValue(loaded({ items, nextCursor: null }) as unknown as ReturnType<typeof useGetJots>);

describe('14.4 It files itself: what was filed today', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWays = ways();
    jest.mocked(useGetChecklists).mockReturnValue(loaded({ items: [{ id: 'l-groceries', title: 'Groceries' }, { id: 'l-party', title: 'Party prep' }] }) as unknown as ReturnType<typeof useGetChecklists>);
    jest.mocked(undoJot).mockResolvedValue(undefined);
    show();
  });

  it("asks for today's jots, and waits or says what went wrong, with the way back", async () => {
    jest.mocked(useGetJots).mockReturnValue(pending() as unknown as ReturnType<typeof useGetJots>);
    const view = await render(inApp(<Filed />));
    expect(jest.mocked(useGetJots).mock.calls[0]!.slice(0, 2)).toEqual(['c-linds', { day: expect.stringMatching(/^\d{4}-\d\d-\d\d$/), limit: 100 }]);
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();

    jest.mocked(useGetJots).mockReturnValue({ ...pending(), isPaused: true } as unknown as ReturnType<typeof useGetJots>);
    await view.rerender(inApp(<Filed />));
    expect(screen.getByRole('header', { name: "You're offline" })).toBeOnTheScreen();

    jest.mocked(useGetJots).mockReturnValue(failed(new Error('down')) as unknown as ReturnType<typeof useGetJots>);
    await view.rerender(inApp(<Filed />));
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('shows what was filed just now, each with where it went, and what came earlier with its time', async () => {
    await render(inApp(<Filed />));
    expect(screen.getByText('pinned · 3 filed just now')).toBeOnTheScreen();
    expect(screen.getByText('Call the plumber')).toBeOnTheScreen();
    expect(screen.getByText('Reminder · tomorrow 9:00')).toBeOnTheScreen();
    expect(screen.getByText('Eggs')).toBeOnTheScreen();
    expect(screen.getByText('earlier today')).toBeOnTheScreen();
    expect(screen.getByText(/^Note · \d+:\d\d$/)).toBeOnTheScreen();
    expect(screen.getByText(/^Groceries · \d+:\d\d$/)).toBeOnTheScreen();
    // Something that looks like a code hasn't been put anywhere.
    expect(screen.getByText('“Gate code 4471” looks like a code')).toBeOnTheScreen();
    expect(screen.getByText("It hasn't been kept anywhere yet.")).toBeOnTheScreen();
  });

  it('says "today" when nothing is from just now, leaves "pinned" out when the note is off, and says when nothing was jotted', async () => {
    mockWays = ways({ pinnedNote: false });
    show([{ ...noteJot, createdAt: hoursAgo(1) }, jotMade({ createdAt: hoursAgo(1.2) })]);
    const view = await render(inApp(<Filed />));
    expect(screen.getByText('2 filed today')).toBeOnTheScreen();
    expect(screen.queryByText('earlier today')).toBeNull();

    show([]);
    await view.rerender(inApp(<Filed />));
    expect(screen.getByText('nothing filed today')).toBeOnTheScreen();
    expect(screen.getByText('Nothing jotted today yet. Whatever you add shows up here, with where it went.')).toBeOnTheScreen();
  });

  it('undoes a line', async () => {
    await render(inApp(<Filed />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Undo Eggs' }));
    await waitFor(() => expect(mockCache.jotUndone).toHaveBeenCalledWith('c-linds', expect.objectContaining({ id: 'j-eggs' })));
    expect(undoJot).toHaveBeenCalledWith('j-eggs');
  });

  it('moves a line to another kind, or to another list', async () => {
    jest.mocked(moveJot).mockResolvedValue({ ...plumberJot, became: 'event', where: 'Event · tomorrow 9:00' });
    await render(inApp(<Filed />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Move Call the plumber' }));
    expect(screen.getByRole('header', { name: 'Move “Call the plumber”' })).toBeOnTheScreen();
    // What it is now is marked, and the circle's lists are offered.
    expect(screen.getByRole('button', { name: 'A reminder. It is this now' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'The list “Party prep”' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'An event' }));
    await waitFor(() => expect(mockCache.jotMoved).toHaveBeenCalledWith('c-linds', expect.objectContaining({ id: 'j-plumber' }), expect.objectContaining({ became: 'event' })));
    expect(moveJot).toHaveBeenCalledWith('j-plumber', expect.objectContaining({ to: 'event', listId: undefined, day: expect.any(String) }));
    await waitFor(() => expect(screen.queryByRole('header', { name: 'Move “Call the plumber”' })).toBeNull());

    await user.press(screen.getByRole('button', { name: 'Move Eggs' }));
    await user.press(screen.getByRole('button', { name: 'The list “Party prep”' }));
    await waitFor(() => expect(moveJot).toHaveBeenLastCalledWith('j-eggs', expect.objectContaining({ to: 'list_item', listId: 'l-party' })));
  });

  it("says what the API says when a move isn't possible, and keeps the sheet", async () => {
    const { ApiError } = jest.requireActual<typeof import('@/api/fetcher')>('@/api/fetcher');
    jest.mocked(moveJot).mockRejectedValue(new ApiError(403, 'forbidden', "You can't add to that list."));
    await render(inApp(<Filed />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Move Eggs' }));
    await user.press(screen.getByRole('button', { name: 'The list “Party prep”' }));
    expect(await screen.findByText("You can't add to that list.")).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Move “Eggs”' })).toBeOnTheScreen();
  });

  it('lets a held-back code become a note, or go on to the Vault in memory', async () => {
    jest.mocked(moveJot).mockResolvedValue({ ...codeJot, became: 'note', where: 'Note' });
    await render(inApp(<Filed />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "It's just a note" }));
    await waitFor(() => expect(moveJot).toHaveBeenCalledWith('j-code', expect.objectContaining({ to: 'note' })));
    await user.press(screen.getByRole('button', { name: 'Keep in the Vault' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/new/password');
    expect(takeHeldCode()?.words).toBe('the gate code is 4471');
  });

  it('folds, and its line opens the jot bar and voice', async () => {
    await render(inApp(<Filed />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Fold the list' }));
    expect(screen.queryByText('Call the plumber')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Unfold the list' }));
    expect(screen.getByText('Call the plumber')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Add anything' }));
    await user.press(screen.getByRole('button', { name: 'Say it all at once' }));
    expect(mockRouter.push.mock.calls.map(([to]) => to)).toEqual(['/jot', '/jot/voice']);
  });
});
