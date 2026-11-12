import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { saveJotWays, useGetChecklists, useGetJotWays } from '@/api/generated/homeport';
import Ways from '@/app/(app)/jot/ways';
import { turnOffPinnedNote, turnOnPinnedNote } from '@/features/jot/pinned/service';
import { pushSupport } from '@/features/notifications/support';
import { inApp } from '@/test/phone';
import { failed, loaded, pending } from '@/test/samples';
import { ways } from '@/test/samples/jot';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true, canDismiss: () => false };
const mockCache = { jotWaysSaved: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => jest.requireActual<typeof import('@/test/samples')>('@/test/samples').linds }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/features/notifications/support', () => ({ pushSupport: jest.fn() }));
jest.mock('@/features/jot/pinned/service', () => ({ turnOnPinnedNote: jest.fn(), turnOffPinnedNote: jest.fn(), ensurePinnedNote: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({ useGetJotWays: jest.fn(), useGetChecklists: jest.fn(), saveJotWays: jest.fn(), getGetJotWaysQueryKey: (id: string) => [`/v1/circles/${id}/jot-ways`] }));

const show = (answer = ways()) => jest.mocked(useGetJotWays).mockReturnValue(loaded(answer) as unknown as ReturnType<typeof useGetJotWays>);

describe('14.8 Every way in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(pushSupport).mockReturnValue('browser');
    jest.mocked(turnOnPinnedNote).mockResolvedValue('unavailable');
    jest.mocked(useGetChecklists).mockReturnValue(loaded({ items: [{ id: 'l-party', title: 'Party prep' }] }) as unknown as ReturnType<typeof useGetChecklists>);
    jest.mocked(saveJotWays).mockImplementation(async (_circle, change) => ways(change as Parameters<typeof ways>[0]));
    show();
  });

  it('waits, says when it is offline and says what went wrong, always with the way back', async () => {
    jest.mocked(useGetJotWays).mockReturnValue(pending() as unknown as ReturnType<typeof useGetJotWays>);
    const view = await render(inApp(<Ways />));
    expect(screen.getByRole('header', { name: 'Jot' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    jest.mocked(useGetJotWays).mockReturnValue({ ...pending(), isPaused: true } as unknown as ReturnType<typeof useGetJotWays>);
    await view.rerender(inApp(<Ways />));
    expect(screen.getByRole('header', { name: "You're offline" })).toBeOnTheScreen();
    jest.mocked(useGetJotWays).mockReturnValue(failed(new Error('down')) as unknown as ReturnType<typeof useGetJotWays>);
    await view.rerender(inApp(<Ways />));
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  });

  it('lists the ways in with their switches, and where a jot goes', async () => {
    show(ways({ voice: false, timedAs: 'event', codes: 'vault' }));
    await render(inApp(<Ways />));
    expect(screen.getByText('Ways to add something without opening the app.')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Pinned note', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Voice', checked: false })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Share from any app', checked: true })).toBeOnTheScreen();
    expect(screen.getByText('“Hey Siri, jot…”, or hold any mic')).toBeOnTheScreen();
    // The address to forward to isn't there until receiving email is connected.
    expect(screen.getByText('Not connected yet')).toBeOnTheScreen();
    expect(screen.getByText('Where a jot goes')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Something to buy. Groceries' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'A day or a time. Event' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Anything else. Notes › Inbox' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'A code or a password. The Vault' })).toBeOnTheScreen();
  });

  it('saves a switch the moment it is flipped, and says what its part still needs', async () => {
    const view = await render(inApp(<Ways />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('switch', { name: 'Voice' }));
    await waitFor(() => expect(mockCache.jotWaysSaved).toHaveBeenCalledWith('c-linds', expect.objectContaining({ voice: false })));
    expect(saveJotWays).toHaveBeenLastCalledWith('c-linds', { voice: false });
    await user.press(screen.getByRole('switch', { name: 'Share from any app' }));
    expect(saveJotWays).toHaveBeenLastCalledWith('c-linds', { share: false });

    show(ways({ share: false }));
    await view.rerender(inApp(<Ways />));
    await user.press(screen.getByRole('switch', { name: 'Share from any app' }));
    expect(saveJotWays).toHaveBeenLastCalledWith('c-linds', { share: true });
    expect(screen.getByText('Saved. The share button in other apps comes with the phone build of Homeport. Pasting a letter on the share screen works now.')).toBeOnTheScreen();
  });

  it('saves the pinned note for the account, and says where the real one lives when this is a browser', async () => {
    show(ways({ pinnedNote: false }));
    await render(inApp(<Ways />));
    await userEvent.setup().press(screen.getByRole('switch', { name: 'Pinned note' }));
    expect(saveJotWays).toHaveBeenCalledWith('c-linds', { pinnedNote: true });
    expect(turnOnPinnedNote).toHaveBeenCalledWith({ circleId: 'c-linds', circleName: 'The Linds' });
    expect(await screen.findByText(/^The real note lives in your phone's notifications and comes with the phone build of Homeport\./)).toBeOnTheScreen();
  });

  it('turns the real note on and off on a phone, and says when the phone says no', async () => {
    jest.mocked(pushSupport).mockReturnValue('ready');
    jest.mocked(turnOnPinnedNote).mockResolvedValue('on');
    show(ways({ pinnedNote: false }));
    const view = await render(inApp(<Ways />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('switch', { name: 'Pinned note' }));
    expect(await screen.findByText(/^Apple doesn't let a notification stay for ever/)).toBeOnTheScreen();

    jest.mocked(turnOnPinnedNote).mockResolvedValue('blocked');
    await user.press(screen.getByRole('switch', { name: 'Pinned note' }));
    expect(await screen.findByText(/^Notifications for Homeport are off in your phone's settings/)).toBeOnTheScreen();

    show(ways({ pinnedNote: true }));
    await view.rerender(inApp(<Ways />));
    await user.press(screen.getByRole('switch', { name: 'Pinned note' }));
    expect(saveJotWays).toHaveBeenLastCalledWith('c-linds', { pinnedNote: false });
    await waitFor(() => expect(turnOffPinnedNote).toHaveBeenCalled());
  });

  it('leads from each way to the screen that shows it', async () => {
    await render(inApp(<Ways />));
    const user = userEvent.setup();
    for (const name of ['Pinned note. See how it looks', 'Widgets. See how it looks', 'Voice. See how it looks', 'Share from any app. See how it looks']) await user.press(screen.getByRole('button', { name }));
    expect(mockRouter.push.mock.calls.map(([to]) => to)).toEqual(['/jot/pinned', '/jot/widgets', '/jot/voice', '/jot/share']);
  });

  it('says so when a way needs the phone or a service that is not connected, never a dead tap', async () => {
    await render(inApp(<Ways />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'A button on the phone. Set up' }));
    expect(screen.getByText(/^Once Homeport is installed from a phone build, the phone's own settings can give it a button/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Got it' }));
    await user.press(screen.getByRole('button', { name: 'Copy the address' }));
    expect(screen.getByText(/^Receiving email isn't connected yet\./)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Got it' }));
    await user.press(screen.getByRole('button', { name: 'Anything else. Notes › Inbox' }));
    expect(screen.getByText(/becomes a note in Notes\./)).toBeOnTheScreen();
  });

  it('copies the address to forward email to, once there is one', async () => {
    show(ways({ forwardAddress: 'linds-4f2k@in.homeport.app' }));
    await render(inApp(<Ways />));
    expect(screen.getByText('linds-4f2k@in.homeport.app')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Copy the address' }));
    expect(await screen.findByText('Copied')).toBeOnTheScreen();
  });

  it('changes where a jot goes: a day or a time, a code, and something to buy', async () => {
    await render(inApp(<Ways />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'A day or a time. Reminder' }));
    await user.press(screen.getByRole('button', { name: 'Event. On the calendar, with a start and an end' }));
    expect(saveJotWays).toHaveBeenLastCalledWith('c-linds', { timedAs: 'event' });

    await user.press(screen.getByRole('button', { name: 'A code or a password. Ask first' }));
    await user.press(screen.getByRole('button', { name: 'A note. Kept as a note, like anything else' }));
    expect(saveJotWays).toHaveBeenLastCalledWith('c-linds', { codes: 'note' });

    await user.press(screen.getByRole('button', { name: 'Something to buy. Groceries' }));
    expect(screen.getByRole('header', { name: 'Something to buy goes to' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Party prep' }));
    expect(saveJotWays).toHaveBeenLastCalledWith('c-linds', { buyListId: 'l-party' });
    await user.press(screen.getByRole('button', { name: 'Something to buy. Groceries' }));
    await user.press(screen.getByRole('button', { name: "The circle's shopping list. Everyone adds to the same one" }));
    expect(saveJotWays).toHaveBeenLastCalledWith('c-linds', { useCirclesList: true });
  });

  it("says what the API says when a change can't be saved", async () => {
    const { ApiError } = jest.requireActual<typeof import('@/api/fetcher')>('@/api/fetcher');
    jest.mocked(saveJotWays).mockRejectedValue(new ApiError(400, 'not_in_circle', 'Choose a list from this circle.'));
    await render(inApp(<Ways />));
    await userEvent.setup().press(screen.getByRole('switch', { name: 'Voice' }));
    expect(await screen.findByText('Choose a list from this circle.')).toBeOnTheScreen();
  });
});
