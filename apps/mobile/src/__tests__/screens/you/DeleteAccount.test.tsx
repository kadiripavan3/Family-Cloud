import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { useDeleteAccount } from '@/api/generated/homeport';
import DeleteAccount from '@/app/(app)/settings/delete-account';
import { Farewell, sayFarewell } from '@/features/leaving/farewell';
import { inApp, onPhone } from '@/test/phone';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockSignOut = jest.fn(() => Promise.resolve());
const mockDelete = jest.fn();
let mockState = { isPending: false, isError: false, error: null as unknown };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn', signOut: mockSignOut }) }));
jest.mock('@/api/generated/homeport', () => ({ useDeleteAccount: jest.fn() }));

/** The answer the API would give, handed to the screen's own "it worked". */
function answers(answer: { signIn: string; message: string }) {
  (jest.mocked(useDeleteAccount) as unknown as jest.Mock).mockImplementation((options: { mutation: { onSuccess: (answer: unknown) => Promise<void> } }) => ({
    ...mockState,
    mutate: (sent: unknown) => {
      mockDelete(sent);
      void options.mutation.onSuccess(answer);
    },
  }));
}

describe('Delete account', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState = { isPending: false, isError: false, error: null };
    sayFarewell(null);
    answers({ signIn: 'kept', message: 'Your Homeport account is deleted. Your sign-in is untouched, so Journey goes on as it was.' });
  });

  it('says what goes, and asks which: only Homeport, or Journey too', async () => {
    await render(inApp(<DeleteAccount />));
    expect(screen.getByRole('header', { name: 'Delete your account?' })).toBeOnTheScreen();
    expect(screen.getByText(/^This can't be undone\. Your profile and everything you keep in Homeport are removed for good\./)).toBeOnTheScreen();
    expect(screen.getByText('You sign in to Journey with the same account. What should go?')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Only Homeport. Your sign-in stays, and Journey goes on as it was.', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /^Homeport, and Journey too\. The sign-in goes as well\./, checked: false })).toBeOnTheScreen();
  });

  it('deletes only Homeport unless told otherwise, signs out, and keeps what the API said for the welcome screen', async () => {
    await render(inApp(<DeleteAccount />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Delete my account' }));
    expect(mockDelete).toHaveBeenCalledWith({ params: { journeyToo: false } });
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    await render(onPhone(<Farewell />));
    expect(screen.getByText('Your Homeport account is deleted. Your sign-in is untouched, so Journey goes on as it was.')).toBeOnTheScreen();
  });

  it('asks for Journey too when that is chosen, and passes on how to finish there', async () => {
    const message = 'Your Homeport account is deleted. The sign-in is shared with Journey, so it is still there: use Delete account in Journey to remove it and your journeys.';
    answers({ signIn: 'left_to_journey', message });
    await render(inApp(<DeleteAccount />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('radio', { name: /^Homeport, and Journey too/ }));
    expect(screen.getByRole('radio', { name: /^Homeport, and Journey too/, checked: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Delete my account' }));
    expect(mockDelete).toHaveBeenCalledWith({ params: { journeyToo: true } });
    await render(onPhone(<Farewell />));
    expect(screen.getByText(message)).toBeOnTheScreen();
  });

  it('keeps the account when asked to, and changes nothing', async () => {
    await render(inApp(<DeleteAccount />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Keep my account' }));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('says why it did not work, and stays signed in', async () => {
    mockState = { isPending: false, isError: true, error: new ApiError(409, 'owner_needed', 'You are the only adult in The Linds. Make someone else an adult first.') };
    (jest.mocked(useDeleteAccount) as unknown as jest.Mock).mockImplementation(() => ({ ...mockState, mutate: mockDelete }));
    await render(inApp(<DeleteAccount />));
    expect(screen.getByText('You are the only adult in The Linds. Make someone else an adult first.')).toBeOnTheScreen();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});

describe('what the welcome screen says afterwards', () => {
  beforeEach(() => sayFarewell(null));

  it('says nothing to someone who has not just deleted an account', async () => {
    await render(onPhone(<Farewell />));
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('can be put away', async () => {
    sayFarewell('Your Homeport account is deleted.');
    await render(onPhone(<Farewell />));
    expect(screen.getByText('Your Homeport account is deleted.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Your Homeport account is deleted.')).toBeNull();
  });

  it('is only about what has just happened: it is gone ten minutes later', async () => {
    jest.useFakeTimers({ now: new Date(2026, 10, 11, 21, 0), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      sayFarewell('Your Homeport account is deleted.');
      jest.setSystemTime(new Date(2026, 10, 11, 21, 11));
      await render(onPhone(<Farewell />));
      expect(screen.queryByText('Your Homeport account is deleted.')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
