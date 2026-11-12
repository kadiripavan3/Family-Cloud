import { render, screen, userEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';

import Welcome from '@/app/(auth)/index';
import { onPhone } from '@/test/phone';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useIsFocused: () => true }));

describe('1.1 Welcome', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  });

  it('opens with the name, the one promise, and the line that matters to someone who has Journey', async () => {
    await render(onPhone(<Welcome />));
    expect(screen.getByText('Homeport')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Everything your people keep, together.' })).toBeOnTheScreen();
    expect(screen.getByText('Notes, photos, plans, money and passwords. Yours alone until you share them.')).toBeOnTheScreen();
    expect(screen.getByText('One account with Journey')).toBeOnTheScreen();
  });

  it('leads a new person through how it works, and someone with an account straight to signing in', async () => {
    await render(onPhone(<Welcome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Get started' }));
    expect(mockPush).toHaveBeenLastCalledWith('/how-it-works');
    await user.press(screen.getByRole('button', { name: 'I already have an account' }));
    expect(mockPush).toHaveBeenLastCalledWith('/sign-in');
  });

  it('opens the terms and the privacy policy, which are pages anyone can read', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(onPhone(<Welcome />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('link', { name: 'Terms' }));
    expect(open).toHaveBeenLastCalledWith('http://api.test/terms');
    await user.press(screen.getByRole('link', { name: 'Privacy Policy' }));
    expect(open).toHaveBeenLastCalledWith('http://api.test/privacy');
    open.mockRestore();
  });
});
