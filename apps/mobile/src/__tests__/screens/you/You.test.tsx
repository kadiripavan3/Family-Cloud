import { render, screen, userEvent } from '@testing-library/react-native';

import { useGetMe, useGetOverview } from '@/api/generated/homeport';
import You from '@/app/(app)/(tabs)/you';
import { keep } from '@/lib/keep';
import { forgetKeptChoices } from '@/lib/useKept';
import { onPhone } from '@/test/phone';
import { loaded, me, nora, pending } from '@/test/samples';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/api/generated/homeport', () => ({ useGetMe: jest.fn(), useGetOverview: jest.fn() }));
jest.mock('@/lib/keep', () => ({ keep: { get: jest.fn(() => Promise.resolve(null)), set: jest.fn(() => Promise.resolve()), remove: jest.fn(() => Promise.resolve()) } }));

const who = jest.mocked(useGetMe) as unknown as jest.Mock;
const overview = jest.mocked(useGetOverview) as unknown as jest.Mock;
const GB = 1024 ** 3;

describe('12.1 You', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetKeptChoices();
    jest.mocked(keep.get).mockResolvedValue(null);
    who.mockReturnValue(loaded(me()));
    overview.mockReturnValue(loaded({ circles: ['The Linds', 'Lisbon crew', 'Nora and Alex'], notes: 214, bytesKept: 48 * GB, phones: ['ios'] }));
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
    await render(onPhone(<You />));
    expect(screen.getByLabelText('– Circles')).toBeOnTheScreen();
    expect(screen.getByLabelText('– Kept')).toBeOnTheScreen();
    expect(screen.queryByText(/kept · backup/)).toBeNull();
  });

  it('lists circles, storage, security, notifications and appearance, and the way out, each with where it leads', async () => {
    await render(onPhone(<You />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Your circles. The Linds, Lisbon crew, Nora and Alex' }));
    expect(mockPush).toHaveBeenLastCalledWith('/circles');
    await user.press(screen.getByRole('button', { name: 'Storage and backup. 48 GB kept · backup arrives with the Library' }));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/storage');
    await user.press(screen.getByRole('button', { name: 'Privacy and security. Face ID on · Vault locks after 2 minutes' }));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/security');
    await user.press(screen.getAllByRole('button', { name: 'Notifications and appearance' }).pop()!);
    expect(mockPush).toHaveBeenLastCalledWith('/settings');
    await user.press(screen.getByRole('button', { name: 'Export and leaving' }));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/leaving');
  });

  it('says what was chosen on this phone for security', async () => {
    jest.mocked(keep.get).mockImplementation((key: string) => Promise.resolve(key === 'homeport.security.a-nora' ? JSON.stringify({ faceId: false, lockAfterMinutes: 1, hideDetails: true }) : null));
    await render(onPhone(<You />));
    expect(await screen.findByText('Face ID off · Vault locks after 1 minute')).toBeOnTheScreen();
  });

  it('the gear opens notifications and appearance', async () => {
    await render(onPhone(<You />));
    await userEvent.setup().press(screen.getAllByRole('button', { name: 'Notifications and appearance' })[0]!);
    expect(mockPush).toHaveBeenLastCalledWith('/settings');
  });

  it('the swap button says that Journey opens from here once both apps are on the phone', async () => {
    await render(onPhone(<You />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Switch to Journey' }));
    expect(screen.getByText("The other app, Journey, opens from here once both apps are on this phone. It's the same account: nothing to sign in to again.")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('header', { name: 'Over to Journey' })).toBeNull();
  });

  it('draws the line about the one account, and says the link arrives later', async () => {
    await render(onPhone(<You />));
    expect(screen.getByText('One account with Journey')).toBeOnTheScreen();
    expect(screen.getByText('The link between the two apps arrives later')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'One account with Journey' }));
    expect(screen.getByText('What you post in Journey shows up here, and the way over there, once the link between the two apps is built.')).toBeOnTheScreen();
  });

  it('writes what is kept in the unit that reads well', async () => {
    overview.mockReturnValue(loaded({ circles: ['The Linds'], notes: 4, bytesKept: 203622, phones: [] }));
    await render(onPhone(<You />));
    expect(screen.getByLabelText('199 KB Kept')).toBeOnTheScreen();
    expect(screen.getByLabelText('1 Circles')).toBeOnTheScreen();
  });
});
