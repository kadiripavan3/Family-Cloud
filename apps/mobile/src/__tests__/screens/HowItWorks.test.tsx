import { act, render, screen, userEvent } from '@testing-library/react-native';

import HowItWorks from '@/app/(auth)/how-it-works';
import { onPhone } from '@/test/phone';

const mockPush = jest.fn();
/** What the router was last told about leaving: whether to hold the person back, and what to do instead. */
let mockLeaving: { held: boolean; instead: () => void } = { held: false, instead: () => {} };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, canGoBack: () => true, back: jest.fn(), replace: jest.fn() }),
  usePreventRemove: (held: boolean, instead: () => void) => {
    mockLeaving = { held, instead };
  },
}));

const title = (name: string) => screen.getByRole('header', { name });

describe('1.2 How it works', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts with the one picture that explains it: an album, a recipe and a door code, for four people', async () => {
    await render(onPhone(<HowItWorks />));
    expect(title('One home for what you share')).toBeOnTheScreen();
    expect(screen.getByText('Photos, notes, bills and passwords for your family or your friends. Each one is yours alone until you choose who sees it.')).toBeOnTheScreen();
    for (const label of ['Front door code', "Grandma's cookies", 'Saturday at the lake']) expect(screen.getByText(label, { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByLabelText(/shared by The Linds, 4 people/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 1 of 3')).toBeOnTheScreen();
  });

  it('goes through three cards with Next, then on to signing in', async () => {
    await render(onPhone(<HowItWorks />));
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(title('Shared with exactly who you choose')).toBeOnTheScreen();
    for (const who of ['Only you', 'Alex and you', 'The Linds']) expect(screen.getByText(who, { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 2 of 3')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(title('Six places, one tap apart')).toBeOnTheScreen();
    expect(screen.getByLabelText('The six places: Today, Plan, Notes, Library, Money, Vault.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 3 of 3')).toBeOnTheScreen();
    expect(mockPush).not.toHaveBeenCalled();

    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(mockPush).toHaveBeenCalledWith('/sign-in');
  });

  it('always offers Skip', async () => {
    await render(onPhone(<HowItWorks />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Next' }));
    await user.press(screen.getByRole('button', { name: 'Skip' }));
    expect(mockPush).toHaveBeenCalledWith('/sign-in');
  });

  it('goes back one card at a time, and leaves only from the first', async () => {
    await render(onPhone(<HowItWorks />));
    expect(mockLeaving.held).toBe(false);

    await userEvent.setup().press(screen.getByRole('button', { name: 'Next' }));
    expect(mockLeaving.held).toBe(true);
    // The phone's Back button, or a swipe from the edge.
    await act(async () => mockLeaving.instead());
    expect(title('One home for what you share')).toBeOnTheScreen();
    expect(mockLeaving.held).toBe(false);
  });
});
