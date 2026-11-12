import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { jot, saveJotWays, useGetJots, useGetJotWays } from '@/api/generated/homeport';
import Pinned from '@/app/(app)/jot/pinned';
import { turnOffPinnedNote, turnOnPinnedNote } from '@/features/jot/pinned/service';
import { pushSupport } from '@/features/notifications/support';
import { inApp } from '@/test/phone';
import { failed, loaded, pending } from '@/test/samples';
import { jotMade, noteJot, ways } from '@/test/samples/jot';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true, canDismiss: () => false };
const mockCache = { jotFiled: jest.fn(), jotWaysSaved: jest.fn() };
let mockIds = 0;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/ui/LightStatusBar', () => ({ LightStatusBar: () => null }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => jest.requireActual<typeof import('@/test/samples')>('@/test/samples').linds }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => `client-${(mockIds += 1)}` }));
jest.mock('@/features/notifications/support', () => ({ pushSupport: jest.fn() }));
jest.mock('@/features/jot/pinned/service', () => ({ turnOnPinnedNote: jest.fn(), turnOffPinnedNote: jest.fn(), ensurePinnedNote: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({ useGetJots: jest.fn(), useGetJotWays: jest.fn(), jot: jest.fn(), undoJot: jest.fn(), moveJot: jest.fn(), saveJotWays: jest.fn(), getGetJotWaysQueryKey: (id: string) => [`/v1/circles/${id}/jot-ways`] }));

const at = (hours: number, minutes: number) => {
  const time = new Date();
  time.setHours(hours, minutes, 0, 0);
  return time.toISOString();
};
/** Milk and bread at 0:12, a note at 0:40: early enough to be today whenever the test runs. */
const morning = () => [{ ...noteJot, createdAt: at(0, 40) }, jotMade({ id: 'j-bread', title: 'Bread', createdAt: at(0, 12) }), jotMade({ createdAt: at(0, 12) })];
const show = (jots = morning(), answer = ways()) => {
  jest.mocked(useGetJots).mockReturnValue(loaded({ items: jots, nextCursor: null }) as unknown as ReturnType<typeof useGetJots>);
  jest.mocked(useGetJotWays).mockReturnValue(loaded(answer) as unknown as ReturnType<typeof useGetJotWays>);
};

describe('14.3 A note pinned in notifications, as the app shows it', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIds = 0;
    jest.mocked(pushSupport).mockReturnValue('browser');
    jest.mocked(turnOnPinnedNote).mockResolvedValue('unavailable');
    jest.mocked(saveJotWays).mockImplementation(async (_circle, change) => ways(change as Parameters<typeof ways>[0]));
    jest.mocked(jot).mockResolvedValue([jotMade()]);
    show();
  });

  it('waits, and says what went wrong, with the way back', async () => {
    jest.mocked(useGetJots).mockReturnValue(pending() as unknown as ReturnType<typeof useGetJots>);
    const view = await render(inApp(<Pinned />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    jest.mocked(useGetJots).mockReturnValue(failed(new Error('down')) as unknown as ReturnType<typeof useGetJots>);
    await view.rerender(inApp(<Pinned />));
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it("draws the note from today's jots: what one line made on one row, with where it went and when", async () => {
    await render(inApp(<Pinned />));
    expect(screen.getByText('pinned · The Linds')).toBeOnTheScreen();
    expect(screen.getByText('Milk, Bread')).toBeOnTheScreen();
    expect(screen.getByText('Groceries · 0:12')).toBeOnTheScreen();
    expect(screen.getByText('Mia needs €5 for the class photo')).toBeOnTheScreen();
    expect(screen.getByText('Note · 0:40')).toBeOnTheScreen();
    // The tiles above it are the phone's own; "Jot" is the app's, and opens the jot bar from anywhere.
    await userEvent.setup().press(screen.getByRole('button', { name: 'Jot. Open the jot bar' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/jot');
  });

  it('says so when nothing was jotted today, and folds', async () => {
    show([]);
    const view = await render(inApp(<Pinned />));
    expect(screen.getByText('Nothing jotted today yet.')).toBeOnTheScreen();
    show();
    await view.rerender(inApp(<Pinned />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Fold the list' }));
    expect(screen.queryByText('Milk, Bread')).toBeNull();
  });

  it('adds what is typed into its line, for real', async () => {
    await render(inApp(<Pinned />));
    const line = screen.getByLabelText('Add anything');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await fireEvent.changeText(line, 'Call the plumber tomorrow at 9');
    await fireEvent(line, 'submitEditing');
    await waitFor(() => expect(mockCache.jotFiled).toHaveBeenCalledWith('c-linds', [expect.objectContaining({ id: 'j-milk' })]));
    expect(jot).toHaveBeenCalledWith('c-linds', expect.objectContaining({ text: 'Call the plumber tomorrow at 9', source: 'app', clientId: 'client-1' }));
    expect(screen.getByLabelText('Add anything').props.value).toBe('');
    await fireEvent.changeText(screen.getByLabelText('Add anything'), 'Stamps');
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(jot).toHaveBeenLastCalledWith('c-linds', expect.objectContaining({ text: 'Stamps' })));
    // Each line is sent under an id of its own.
    expect(jest.mocked(jot).mock.calls[1]![1].clientId).not.toBe('client-1');
  });

  it('says where the real note lives, in a browser and in Expo Go, and still saves the choice', async () => {
    const view = await render(inApp(<Pinned />));
    expect(screen.getByText(/^The real note lives in your phone's notifications and comes with the phone build of Homeport\./)).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Pinned note', checked: true })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('switch', { name: 'Pinned note' }));
    await waitFor(() => expect(mockCache.jotWaysSaved).toHaveBeenCalledWith('c-linds', expect.objectContaining({ pinnedNote: false })));
    expect(saveJotWays).toHaveBeenCalledWith('c-linds', { pinnedNote: false });
    expect(turnOffPinnedNote).toHaveBeenCalled();

    jest.mocked(pushSupport).mockReturnValue('expoGo');
    await view.rerender(inApp(<Pinned />));
    expect(screen.getByText(/^The real note needs the installed Homeport app, not Expo Go\./)).toBeOnTheScreen();
  });

  it('turns the real note on where one can exist, and says when the phone says no', async () => {
    jest.mocked(pushSupport).mockReturnValue('ready');
    jest.mocked(turnOnPinnedNote).mockResolvedValue('on');
    show(morning(), ways({ pinnedNote: false }));
    await render(inApp(<Pinned />));
    // (The tests run as an iPhone.)
    expect(screen.getByText(/^Apple doesn't let a notification stay for ever, so it comes back after each add and every morning\./)).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('switch', { name: 'Pinned note' }));
    await waitFor(() => expect(turnOnPinnedNote).toHaveBeenCalledWith({ circleId: 'c-linds', circleName: 'The Linds' }));
    expect(saveJotWays).toHaveBeenCalledWith('c-linds', { pinnedNote: true });

    jest.mocked(turnOnPinnedNote).mockResolvedValue('blocked');
    await user.press(screen.getByRole('switch', { name: 'Pinned note' }));
    expect(await screen.findByText(/^Notifications for Homeport are off in your phone's settings/)).toBeOnTheScreen();
  });
});
