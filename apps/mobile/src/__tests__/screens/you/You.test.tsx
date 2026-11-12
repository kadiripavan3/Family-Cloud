import { render, screen, userEvent } from '@testing-library/react-native';

import { useGetMe } from '@/api/generated/homeport';
import You from '@/app/(app)/(tabs)/you';
import { onPhone } from '@/test/phone';
import { loaded, me, nora } from '@/test/samples';
import { setAppearance } from '@/theme/appearance';

const mockPush = jest.fn();
const mockSignOut = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn', signOut: mockSignOut }) }));
jest.mock('@/api/generated/homeport', () => ({ useGetMe: jest.fn() }));
jest.mock('expo-secure-store', () => ({ setItemAsync: jest.fn(() => Promise.resolve()), getItemAsync: jest.fn(() => Promise.resolve(null)) }));

const who = jest.mocked(useGetMe) as unknown as jest.Mock;

describe('12.1 You', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    who.mockReturnValue(loaded(me()));
    setAppearance('system');
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

  it('opens the notification settings and the appearance, and says which appearance is chosen', async () => {
    setAppearance('dark');
    await render(onPhone(<You />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Notifications' }));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/notifications');
    await user.press(screen.getByRole('button', { name: 'Appearance. Dark' }));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/appearance');
  });

  it('logs out with one tap, and asks on a page of its own before deleting the account', async () => {
    await render(onPhone(<You />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/delete-account');
    expect(mockSignOut).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Log out' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('names the parts that are still to come, and does not pretend they open', async () => {
    await render(onPhone(<You />));
    for (const row of ['Your circles', 'Storage and backup', 'Privacy and security', 'Export and leaving']) {
      expect(screen.getByText(row)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: new RegExp(`^${row}`) })).toBeNull();
    }
    expect(screen.getAllByText('Soon')).toHaveLength(4);
  });
});
