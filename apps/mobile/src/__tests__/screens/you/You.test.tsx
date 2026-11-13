import { render, screen, userEvent } from '@testing-library/react-native';

import { useGetJourneySwitch, useGetMe, useGetOverview, useGetStorage } from '@/api/generated/homeport';
import You from '@/app/(app)/(tabs)/you';
import { keep } from '@/lib/keep';
import { forgetKeptChoices } from '@/lib/useKept';
import { onPhone } from '@/test/phone';
import { linds, loaded, me, nora, pending } from '@/test/samples';
import { appSwitch } from '@/test/samples/together';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/api/generated/homeport', () => ({ useGetMe: jest.fn(), useGetOverview: jest.fn(), useGetStorage: jest.fn(), useGetJourneySwitch: jest.fn() }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
// "Your apps" (10.1) has its own test (together/AppSwitch): here only that it opens matters.
jest.mock('@/features/journeyLink/AppSwitchSheet', () => ({ AppSwitchSheet: ({ visible }: { visible: boolean }) => mockApps(visible) }));

function mockApps(visible: boolean) {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return visible ? <Text>the sheet of your apps</Text> : null;
}
jest.mock('@/lib/keep', () => ({ keep: { get: jest.fn(() => Promise.resolve(null)), set: jest.fn(() => Promise.resolve()), remove: jest.fn(() => Promise.resolve()) } }));

const who = jest.mocked(useGetMe) as unknown as jest.Mock;
const overview = jest.mocked(useGetOverview) as unknown as jest.Mock;
const inJourney = jest.mocked(useGetJourneySwitch) as unknown as jest.Mock;
const storage = jest.mocked(useGetStorage) as unknown as jest.Mock;
const mockLinds = linds;
const GB = 1024 ** 3;

describe('12.1 You', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetKeptChoices();
    jest.mocked(keep.get).mockResolvedValue(null);
    who.mockReturnValue(loaded(me()));
    overview.mockReturnValue(loaded({ circles: ['The Linds', 'Lisbon crew', 'Nora and Alex'], notes: 214, bytesKept: 48 * GB, phones: ['ios'] }));
    inJourney.mockReturnValue(loaded(appSwitch()));
    storage.mockReturnValue(loaded({ usedBytes: 48 * GB, quotaBytes: 200 * GB }));
  });

  it('shows who you are: the first name large, the whole name under it', async () => {
    await render(onPhone(<You />));
    expect(screen.getByRole('header', { name: 'Nora' })).toBeOnTheScreen();
    expect(screen.getByText('Nora Lind')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nora Lind')).toBeOnTheScreen(); // the picture, or the initials in its place
  });

  it('says a one-word name once', async () => {
    who.mockReturnValue(loaded(me({ ...nora, displayName: 'Biscuit' })));
    await render(onPhone(<You />));
    expect(screen.getAllByText('Biscuit')).toHaveLength(1);
  });

  it('counts your circles, your notes and what you keep', async () => {
    await render(onPhone(<You />));
    expect(screen.getByLabelText('3 Circles')).toBeOnTheScreen();
    expect(screen.getByLabelText('214 Notes')).toBeOnTheScreen();
    expect(screen.getByLabelText('48 GB Kept')).toBeOnTheScreen();
  });

  it('shows a dash for a number it does not know yet, never a nought', async () => {
    overview.mockReturnValue(pending());
    storage.mockReturnValue(pending());
    await render(onPhone(<You />));
    expect(screen.getByLabelText('– Circles')).toBeOnTheScreen();
    expect(screen.getByLabelText('– Kept')).toBeOnTheScreen();
    expect(screen.queryByText(/ of 200 GB/)).toBeNull();
  });

  it('lists circles, storage, security, notifications and appearance, and the way out, each with where it leads', async () => {
    await render(onPhone(<You />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Your circles. The Linds, Lisbon crew, Nora and Alex' }));
    expect(mockPush).toHaveBeenLastCalledWith('/circles');
    // What the current circle keeps, of what it may keep.
    expect(storage).toHaveBeenCalledWith('c-linds');
    await user.press(screen.getByRole('button', { name: 'Storage and backup. 48 of 200 GB' }));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/storage');
    await user.press(screen.getByRole('button', { name: 'Privacy and security. Face ID on · Vault locks after 2 minutes' }));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/security');
    await user.press(screen.getAllByRole('button', { name: 'Notifications and appearance' }).pop()!);
    expect(mockPush).toHaveBeenLastCalledWith('/settings');
    await user.press(screen.getByRole('button', { name: 'Export and leaving' }));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/leaving');
  });

  it('says the unit of each when what is kept and what may be kept are far apart', async () => {
    storage.mockReturnValue(loaded({ usedBytes: 7.9 * 1024 ** 2, quotaBytes: 200 * GB }));
    await render(onPhone(<You />));
    expect(screen.getByText('7.9 MB of 200 GB')).toBeOnTheScreen();
  });

  it('says what was chosen on this phone for security', async () => {
    jest.mocked(keep.get).mockImplementation((key: string) => Promise.resolve(key === 'homeport.security.a-nora' ? JSON.stringify({ faceId: false, lockAfterMinutes: 1 }) : null));
    await render(onPhone(<You />));
    expect(await screen.findByText('Face ID off · Vault locks after 1 minute')).toBeOnTheScreen();
  });

  it('the gear opens notifications and appearance', async () => {
    await render(onPhone(<You />));
    await userEvent.setup().press(screen.getAllByRole('button', { name: 'Notifications and appearance' })[0]!);
    expect(mockPush).toHaveBeenLastCalledWith('/settings');
  });

  it('the swap button opens "Your apps", the way to Journey', async () => {
    await render(onPhone(<You />));
    expect(screen.queryByText('the sheet of your apps')).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Switch to Journey' }));
    expect(screen.getByText('the sheet of your apps')).toBeOnTheScreen();
  });

  it('draws the line about the one account with what it holds in Journey, and opens "Your apps" from it', async () => {
    await render(onPhone(<You />));
    expect(screen.getByText('One account with Journey')).toBeOnTheScreen();
    expect(screen.getByText('3 journeys · 58 following')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'One account with Journey. 3 journeys · 58 following' }));
    expect(screen.getByText('the sheet of your apps')).toBeOnTheScreen();
  });

  it('says so when the account has no profile in Journey yet, when Journey could not be asked, and when this app runs without it', async () => {
    inJourney.mockReturnValue(loaded(appSwitch({ journey: null })));
    await render(onPhone(<You />));
    expect(screen.getByText('No Journey profile yet. The account is ready for it.')).toBeOnTheScreen();
    inJourney.mockReturnValue(loaded(appSwitch({ journey: null, note: 'Journey is not answering just now.' })));
    await render(onPhone(<You />));
    expect(screen.getByText('Journey is not answering just now.')).toBeOnTheScreen();
    inJourney.mockReturnValue(loaded(appSwitch({ available: false, journey: null })));
    await render(onPhone(<You />));
    expect(screen.getByText('This Homeport runs without Journey. The two are linked when both are switched on.')).toBeOnTheScreen();
  });

  it('is quiet about Journey until it is known', async () => {
    inJourney.mockReturnValue(pending());
    await render(onPhone(<You />));
    expect(screen.getByRole('button', { name: 'One account with Journey. –' })).toBeOnTheScreen();
  });

  it('writes what is kept in the unit that reads well', async () => {
    overview.mockReturnValue(loaded({ circles: ['The Linds'], notes: 4, bytesKept: 203622, phones: [] }));
    await render(onPhone(<You />));
    expect(screen.getByLabelText('199 KB Kept')).toBeOnTheScreen();
    expect(screen.getByLabelText('1 Circles')).toBeOnTheScreen();
  });
});
