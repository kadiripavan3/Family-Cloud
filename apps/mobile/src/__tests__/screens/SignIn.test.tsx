import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import SignIn from '@/app/(auth)/sign-in';
import { onPhone } from '@/test/phone';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockService: { apple: jest.Mock | null; google: jest.Mock | null } = { apple: null, google: null };
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }), useIsFocused: () => true }));
jest.mock('@/auth/mode', () => ({ authMode: 'local' }));
jest.mock('@/auth/signIn', () => ({
  signInService: {
    get apple() {
      return mockService.apple;
    },
    get google() {
      return mockService.google;
    },
  },
}));

describe('1.3 Log in or sign up', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockService.apple = null;
    mockService.google = null;
  });

  it('says that the Journey account works here, and offers Apple, Google and email', async () => {
    await render(onPhone(<SignIn />));
    expect(screen.getByRole('header', { name: 'Log in or sign up' })).toBeOnTheScreen();
    expect(screen.getByText('Your Journey account works here too.')).toBeOnTheScreen();
    for (const way of ['Continue with Apple', 'Continue with Google', 'Continue with email']) expect(screen.getByRole('button', { name: way })).toBeOnTheScreen();
    // Nothing offers a Journey sign-in yet, so there is no "Continue as" and no "or".
    expect(screen.queryByText('Your Journey account')).toBeNull();
    expect(screen.queryByText('or use another account')).toBeNull();
  });

  it('goes on to the email, and closes back to where the person came from', async () => {
    await render(onPhone(<SignIn />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Continue with email' }));
    expect(mockPush).toHaveBeenCalledWith('/email');
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('says plainly when Apple or Google is not offered here, instead of doing nothing', async () => {
    await render(onPhone(<SignIn />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Continue with Apple' }));
    expect(screen.getByText('Apple sign-in is switched on later. Use your email for now.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByText('Google sign-in is switched on later. Use your email for now.')).toBeOnTheScreen();
  });

  it('signs in with Apple where it is offered, says why when that fails, and nothing when the person changed their mind', async () => {
    mockService.apple = jest.fn();
    await render(onPhone(<SignIn />));
    const user = userEvent.setup();

    mockService.apple.mockRejectedValueOnce(new ApiError(0, 'sign_in_failed', "Apple didn't sign you in. Try again, or use your email."));
    await user.press(screen.getByRole('button', { name: 'Continue with Apple' }));
    expect(await screen.findByText("Apple didn't sign you in. Try again, or use your email.")).toBeOnTheScreen();

    mockService.apple.mockRejectedValueOnce(new ApiError(0, 'cancelled', ''));
    await user.press(screen.getByRole('button', { name: 'Continue with Apple' }));
    await waitFor(() => expect(screen.queryByText(/Apple didn't sign you in/)).toBeNull());
    expect(mockService.apple).toHaveBeenCalledTimes(2);
  });

  it('puts "Continue as" first when Journey\'s sign-in is handed over, and takes it with one tap', async () => {
    const accept = jest.fn(() => Promise.resolve());
    await render(onPhone(<SignIn journey={{ displayName: 'Nora Lind', avatarUrl: null, accept }} />));
    expect(screen.getByText('Nora Lind')).toBeOnTheScreen();
    expect(screen.getByText('Your Journey account')).toBeOnTheScreen();
    expect(screen.getByText('or use another account')).toBeOnTheScreen();
    // The other ways in are still there.
    expect(screen.getByRole('button', { name: 'Continue with email' })).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Continue as Nora Lind' }));
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it('says why when the Journey sign-in could not be taken', async () => {
    const accept = jest.fn(() => Promise.reject(new ApiError(0, 'unreachable', "Can't reach Homeport right now.")));
    await render(onPhone(<SignIn journey={{ displayName: 'Nora Lind', avatarUrl: null, accept }} />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Continue as Nora Lind' }));
    expect(await screen.findByText("Can't reach Homeport right now.")).toBeOnTheScreen();
  });
});
