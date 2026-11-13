import { render, screen, userEvent } from '@testing-library/react-native';

import { useGetOverview, useGetSettings, useSaveSettings } from '@/api/generated/homeport';
import SettingsIndex from '@/app/(app)/settings/index';
import PrivacyAndSecurity from '@/app/(app)/settings/security';
import { keep } from '@/lib/keep';
import { forgetKeptChoices } from '@/lib/useKept';
import { inApp, onPhone } from '@/test/phone';
import { loaded, me, pending, settings } from '@/test/samples';
import { setAppearance } from '@/theme/appearance';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockSignOut = jest.fn();
let mockProvider: 'apple' | 'google' | 'email' | null = 'apple';
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn', provider: mockProvider, signOut: mockSignOut }) }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ settingsSaved: jest.fn() }) }));
jest.mock('@/api/generated/homeport', () => ({ useGetMe: jest.fn(() => mockMe), useGetOverview: jest.fn(), useGetSettings: jest.fn(), useSaveSettings: jest.fn(), getGetSettingsQueryKey: () => ['/v1/me/settings'] }));
jest.mock('@/lib/keep', () => ({ keep: { get: jest.fn(() => Promise.resolve(null)), set: jest.fn(() => Promise.resolve()), remove: jest.fn(() => Promise.resolve()) } }));
jest.mock('expo-secure-store', () => ({ setItemAsync: jest.fn(() => Promise.resolve()), getItemAsync: jest.fn(() => Promise.resolve(null)) }));

const mockMe = loaded(me());
const overview = jest.mocked(useGetOverview) as unknown as jest.Mock;
const account = jest.mocked(useGetSettings) as unknown as jest.Mock;
const mockSave = jest.fn();
const KEY = 'homeport.security.a-nora';

describe('12.3 Privacy and security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetKeptChoices();
    mockProvider = 'apple';
    jest.mocked(keep.get).mockResolvedValue(null);
    overview.mockReturnValue(loaded({ circles: [], notes: 0, bytesKept: 0, phones: ['ios', 'android'] }));
    account.mockReturnValue(loaded(settings({ hideDetails: true })));
    (jest.mocked(useSaveSettings) as unknown as jest.Mock).mockReturnValue({ mutate: mockSave, isError: false, error: null });
  });

  it('answers "what can you see?" in the two boxes, word for word', async () => {
    await render(inApp(<PrivacyAndSecurity />));
    expect(screen.getByRole('header', { name: 'Privacy and security' })).toBeOnTheScreen();
    expect(screen.getByText("What we can and can't see")).toBeOnTheScreen();
    expect(screen.getByText('The Vault: nothing')).toBeOnTheScreen();
    expect(screen.getByText('Scrambled on your phone with a key only you hold.')).toBeOnTheScreen();
    expect(screen.getByText('The rest: private, but readable by the service')).toBeOnTheScreen();
    expect(screen.getByText('So search, reminders and scans can work. Never sold, never used for ads.')).toBeOnTheScreen();
  });

  it('has three choices under "This phone", and says where each is kept', async () => {
    await render(inApp(<PrivacyAndSecurity />));
    expect(screen.getByText('This phone')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Open with Face ID' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Lock the Vault after. 2 minutes' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Hide details in notifications' })).toBeChecked();
    expect(screen.getByText('“A bill is due”, not which or how much')).toBeOnTheScreen();
    expect(screen.getByText(/^Face ID and the Vault's timer are remembered on this phone; in a browser the Vault asks for a passcode instead\. Hiding details goes for every phone/)).toBeOnTheScreen();
  });

  it('remembers Face ID and the timer on the phone, for this account', async () => {
    await render(inApp(<PrivacyAndSecurity />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('switch', { name: 'Open with Face ID' }));
    expect(keep.set).toHaveBeenLastCalledWith(KEY, JSON.stringify({ faceId: false, lockAfterMinutes: 2 }));
    await user.press(screen.getByRole('button', { name: /^Lock the Vault after/ }));
    await user.press(screen.getByRole('button', { name: '15 minutes' }));
    expect(screen.getByRole('button', { name: 'Lock the Vault after. 15 minutes' })).toBeOnTheScreen();
    expect(keep.set).toHaveBeenLastCalledWith(KEY, JSON.stringify({ faceId: false, lockAfterMinutes: 15 }));
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("saves \"Hide details in notifications\" to the account: it is the API that writes what a notification says", async () => {
    const view = await render(inApp(<PrivacyAndSecurity />));
    await userEvent.setup().press(screen.getByRole('switch', { name: 'Hide details in notifications' }));
    expect(mockSave).toHaveBeenLastCalledWith({ data: { hideDetails: false } });
    expect(keep.set).not.toHaveBeenCalled();
    // What the account says is what the switch shows.
    account.mockReturnValue(loaded(settings({ hideDetails: false })));
    await view.rerender(inApp(<PrivacyAndSecurity />));
    expect(screen.getByRole('switch', { name: 'Hide details in notifications' })).not.toBeChecked();
  });

  it('shows no guess for hiding details until the account has answered, and takes no press meanwhile', async () => {
    account.mockReturnValue(pending());
    await render(inApp(<PrivacyAndSecurity />));
    expect(screen.getByRole('switch', { name: 'Hide details in notifications' })).not.toBeChecked();
    await userEvent.setup().press(screen.getByRole('switch', { name: 'Hide details in notifications' }));
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('shows what was chosen last time', async () => {
    jest.mocked(keep.get).mockResolvedValue(JSON.stringify({ faceId: false, lockAfterMinutes: 5 }));
    await render(inApp(<PrivacyAndSecurity />));
    expect(await screen.findByRole('button', { name: 'Lock the Vault after. 5 minutes' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Open with Face ID' })).not.toBeChecked();
  });

  it('says which phones are signed in and how the person signed in', async () => {
    const view = await render(inApp(<PrivacyAndSecurity />));
    expect(screen.getByText('Phones signed in')).toBeOnTheScreen();
    expect(screen.getByText('iPhone, Android')).toBeOnTheScreen();
    expect(screen.getByText('Shared with Journey')).toBeOnTheScreen();
    expect(screen.getByText('Apple')).toBeOnTheScreen();
    mockProvider = 'email';
    overview.mockReturnValue(loaded({ circles: [], notes: 0, bytesKept: 0, phones: [] }));
    await view.rerender(inApp(<PrivacyAndSecurity />));
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
});
