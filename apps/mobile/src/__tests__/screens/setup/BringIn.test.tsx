import { render, screen, userEvent } from '@testing-library/react-native';

import BringThingsIn from '@/app/(setup)/setup/bring-in';
import { keep } from '@/lib/keep';
import { forgetKeptChoices } from '@/lib/useKept';
import { onPhone } from '@/test/phone';
import { loaded, me } from '@/test/samples';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ circle: 'c-linds' }) }));
jest.mock('@/api/generated/homeport', () => ({ useGetMe: jest.fn(() => mockMe) }));
jest.mock('@/lib/keep', () => ({ keep: { get: jest.fn(() => Promise.resolve(null)), set: jest.fn(() => Promise.resolve()), remove: jest.fn(() => Promise.resolve()) } }));

const mockMe = loaded(me());
const KEY = 'homeport.bringIn.a-nora';

describe('2.3 Bring your things in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetKeptChoices();
    jest.mocked(keep.get).mockResolvedValue(null);
  });

  it('offers the five things to start with, three as switches', async () => {
    await render(onPhone(<BringThingsIn />));
    expect(screen.getByRole('header', { name: 'Bring your things in' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 3 of 3')).toBeOnTheScreen();
    for (const name of ['Photos on this phone', 'Journey', 'Calendars']) expect(screen.getByRole('switch', { name })).not.toBeChecked();
    expect(screen.getByText('Apple Notes, Notion or Evernote')).toBeOnTheScreen();
    expect(screen.getByText('iCloud Keychain, 1Password or a file')).toBeOnTheScreen();
    expect(screen.getByText('It all starts as “Only you”')).toBeOnTheScreen();
    expect(screen.getByText('Nothing you bring in is shared until you share it.')).toBeOnTheScreen();
  });

  it('remembers the switches on the phone, for this account, and says what they do today', async () => {
    await render(onPhone(<BringThingsIn />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('switch', { name: 'Photos on this phone' }));
    expect(screen.getByRole('switch', { name: 'Photos on this phone' })).toBeChecked();
    expect(keep.set).toHaveBeenLastCalledWith(KEY, JSON.stringify({ photos: true, journey: false, calendars: false }));
    expect(screen.getByText(/^Your choices are remembered\. Each one starts by itself when its part of Homeport is built/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Bring them in' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/setup/ready', params: { circle: 'c-linds' } });
  });

  it('shows what was chosen last time', async () => {
    jest.mocked(keep.get).mockResolvedValue(JSON.stringify({ photos: false, journey: true, calendars: true }));
    await render(onPhone(<BringThingsIn />));
    expect(await screen.findByRole('switch', { name: 'Calendars', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Journey' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Photos on this phone' })).not.toBeChecked();
  });

  it('says when notes and passwords can be brought in, instead of doing nothing', async () => {
    await render(onPhone(<BringThingsIn />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Notes\./ }));
    expect(screen.getByText('Bringing notes in arrives with Notes: you pick the files those apps export.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: /^Passwords\./ }));
    expect(screen.getByText('Bringing passwords in arrives with the Vault: you pick the file your password app exports.')).toBeOnTheScreen();
  });

  it('"Not now" switches everything off and goes on', async () => {
    jest.mocked(keep.get).mockResolvedValue(JSON.stringify({ photos: true, journey: true, calendars: false }));
    await render(onPhone(<BringThingsIn />));
    await screen.findByRole('switch', { name: 'Journey', checked: true });
    await userEvent.setup().press(screen.getByRole('button', { name: 'Not now' }));
    expect(keep.set).toHaveBeenLastCalledWith(KEY, JSON.stringify({ photos: false, journey: false, calendars: false }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/setup/ready', params: { circle: 'c-linds' } });
  });

  it('just goes on when nothing is switched on', async () => {
    await render(onPhone(<BringThingsIn />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });
});
