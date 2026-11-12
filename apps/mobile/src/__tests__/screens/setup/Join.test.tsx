import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { joinCircle, usePreviewJoin } from '@/api/generated/homeport';
import Join from '@/app/(setup)/join/[code]';
import { inApp } from '@/test/phone';
import { failed, linds, loaded, pending } from '@/test/samples';

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockFinish = jest.fn();
const mockJoined = jest.fn(() => Promise.resolve());
const mockSwitch = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ code: 'the-linds' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ circleJoined: mockJoined }) }));
jest.mock('@/features/circles/current', () => ({ switchCircle: (id: string) => mockSwitch(id) }));
jest.mock('@/features/circles/useFinishSetup', () => ({ useFinishSetup: () => mockFinish }));
jest.mock('@/api/generated/homeport', () => ({ usePreviewJoin: jest.fn(), joinCircle: jest.fn() }));

const preview = jest.mocked(usePreviewJoin) as unknown as jest.Mock;

describe('an invitation to a circle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    preview.mockReturnValue(loaded({ circleId: 'c-linds', name: 'The Linds', kind: 'family', people: 4, alreadyIn: false }));
  });

  it('says which circle it is for, and how many are in it', async () => {
    await render(inApp(<Join />));
    expect(preview).toHaveBeenCalledWith('the-linds');
    expect(screen.getByRole('header', { name: 'Join The Linds?' })).toBeOnTheScreen();
    expect(screen.getByText(/^Family · 4 people\./)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
  });

  it('joins with one button: the circle becomes the current one and Home opens on it', async () => {
    jest.mocked(joinCircle).mockResolvedValue(linds);
    await render(inApp(<Join />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(mockFinish).toHaveBeenCalledTimes(1));
    expect(joinCircle).toHaveBeenCalledWith('the-linds');
    expect(mockJoined).toHaveBeenCalledWith(linds);
    expect(mockSwitch).toHaveBeenCalledWith('c-linds');
  });

  it("says what the API says when joining doesn't work, and stays", async () => {
    jest.mocked(joinCircle).mockRejectedValue(new ApiError(409, 'circle_full', 'That circle is full.'));
    await render(inApp(<Join />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByText('That circle is full.')).toBeOnTheScreen();
    expect(mockFinish).not.toHaveBeenCalled();
  });

  it('just opens a circle the person is in already', async () => {
    preview.mockReturnValue(loaded({ circleId: 'c-linds', name: 'The Linds', kind: 'family', people: 5, alreadyIn: true }));
    await render(inApp(<Join />));
    expect(screen.getByRole('header', { name: "You're already in The Linds" })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Open The Linds' }));
    expect(joinCircle).not.toHaveBeenCalled();
    expect(mockSwitch).toHaveBeenCalledWith('c-linds');
    expect(mockFinish).toHaveBeenCalledTimes(1);
  });

  it('says so when the link no longer works', async () => {
    preview.mockReturnValue(failed(new ApiError(404, 'link_gone', "That link doesn't work any more. Ask for a new one.")));
    await render(inApp(<Join />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
    expect(screen.getByText("That link doesn't work any more. Ask for a new one.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Go to Home' })).toBeOnTheScreen();
  });

  it('keeps its Close while it loads', async () => {
    preview.mockReturnValue(pending());
    await render(inApp(<Join />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
  });
});
