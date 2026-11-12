import { render, screen, userEvent } from '@testing-library/react-native';

import { useGetOverview } from '@/api/generated/homeport';
import Leaving from '@/app/(app)/settings/leaving';
import SettingsIndex from '@/app/(app)/settings/index';
import PrivacyAndSecurity from '@/app/(app)/settings/security';
import { keep } from '@/lib/keep';
import { forgetKeptChoices } from '@/lib/useKept';
import { onPhone } from '@/test/phone';
import { loaded, me } from '@/test/samples';
import { setAppearance } from '@/theme/appearance';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockSignOut = jest.fn();
let mockProvider: 'apple' | 'google' | 'email' | null = 'apple';
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn', provider: mockProvider, signOut: mockSignOut }) }));
jest.mock('@/api/generated/homeport', () => ({ useGetMe: jest.fn(() => mockMe), useGetOverview: jest.fn() }));
jest.mock('@/lib/keep', () => ({ keep: { get: jest.fn(() => Promise.resolve(null)), set: jest.fn(() => Promise.resolve()), remove: jest.fn(() => Promise.resolve()) } }));
jest.mock('expo-secure-store', () => ({ setItemAsync: jest.fn(() => Promise.resolve()), getItemAsync: jest.fn(() => Promise.resolve(null)) }));

const mockMe = loaded(me());
const overview = jest.mocked(useGetOverview) as unknown as jest.Mock;
const KEY = 'homeport.security.a-nora';

describe('12.3 Privacy and security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetKeptChoices();
    mockProvider = 'apple';
    jest.mocked(keep.get).mockResolvedValue(null);
    overview.mockReturnValue(loaded({ circles: [], notes: 0, bytesKept: 0, phones: ['ios', 'android'] }));
  });

  it('answers "what can you see?" in the two boxes, word for word', async () => {
    await render(onPhone(<PrivacyAndSecurity />));
    expect(screen.getByRole('header', { name: 'Privacy and security' })).toBeOnTheScreen();
    expect(screen.getByText("What we can and can't see")).toBeOnTheScreen();
    expect(screen.getByText('The Vault: nothing')).toBeOnTheScreen();
    expect(screen.getByText('Scrambled on your phone with a key only you hold.')).toBeOnTheScreen();
    expect(screen.getByText('The rest: private, but readable by the service')).toBeOnTheScreen();
    expect(screen.getByText('So search, reminders and scans can work. Never sold, never used for ads.')).toBeOnTheScreen();
  });

  it('has three choices for this phone, and says what they need before they do anything', async () => {
    await render(onPhone(<PrivacyAndSecurity />));
    expect(screen.getByText('This phone')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Open with Face ID' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Lock the Vault after. 2 minutes' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Hide details in notifications' })).toBeChecked();
    expect(screen.getByText('“A bill is due”, not which or how much')).toBeOnTheScreen();
    expect(screen.getByText(/^These are remembered on this phone\. The Vault locks itself after the time you choose here\./)).toBeOnTheScreen();
  });

  it('remembers each choice on the phone, for this account', async () => {
    await render(onPhone(<PrivacyAndSecurity />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('switch', { name: 'Open with Face ID' }));
    expect(keep.set).toHaveBeenLastCalledWith(KEY, JSON.stringify({ faceId: false, lockAfterMinutes: 2, hideDetails: true }));
    await user.press(screen.getByRole('button', { name: /^Lock the Vault after/ }));
    await user.press(screen.getByRole('button', { name: '15 minutes' }));
    expect(screen.getByRole('button', { name: 'Lock the Vault after. 15 minutes' })).toBeOnTheScreen();
    await user.press(screen.getByRole('switch', { name: 'Hide details in notifications' }));
    expect(keep.set).toHaveBeenLastCalledWith(KEY, JSON.stringify({ faceId: false, lockAfterMinutes: 15, hideDetails: false }));
  });

  it('shows what was chosen last time', async () => {
    jest.mocked(keep.get).mockResolvedValue(JSON.stringify({ faceId: false, lockAfterMinutes: 5, hideDetails: false }));
    await render(onPhone(<PrivacyAndSecurity />));
    expect(await screen.findByRole('button', { name: 'Lock the Vault after. 5 minutes' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Open with Face ID' })).not.toBeChecked();
  });

  it('says which phones are signed in and how the person signed in', async () => {
    const view = await render(onPhone(<PrivacyAndSecurity />));
    expect(screen.getByText('Phones signed in')).toBeOnTheScreen();
    expect(screen.getByText('iPhone, Android')).toBeOnTheScreen();
    expect(screen.getByText('Shared with Journey')).toBeOnTheScreen();
    expect(screen.getByText('Apple')).toBeOnTheScreen();
    mockProvider = 'email';
    overview.mockReturnValue(loaded({ circles: [], notes: 0, bytesKept: 0, phones: [] }));
    await view.rerender(onPhone(<PrivacyAndSecurity />));
    expect(screen.getByText('Email code')).toBeOnTheScreen();
    expect(screen.getByText('None yet')).toBeOnTheScreen();
  });
});

describe('the pages around it', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setAppearance('system');
  });

  it('"Notifications and appearance" leads to each of the two, and says which appearance is chosen', async () => {
    setAppearance('dark');
    await render(onPhone(<SettingsIndex />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Notifications' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/settings/notifications');
    await user.press(screen.getByRole('button', { name: 'Appearance. Dark' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/settings/appearance');
  });

  it('"Export and leaving" says what arrives later, logs out with one tap, and asks on a page of its own before deleting the account', async () => {
    await render(onPhone(<Leaving />));
    expect(screen.getByRole('header', { name: 'Export and leaving' })).toBeOnTheScreen();
    expect(screen.getByText('Exporting everything and leaving a circle arrive later. Until then, the two things that end a sign-in are here.')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete account. You choose: only Homeport, or Journey too' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/settings/delete-account');
    expect(mockSignOut).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Log out' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
