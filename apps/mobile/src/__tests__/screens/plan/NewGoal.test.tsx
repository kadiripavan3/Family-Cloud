import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { createGoal } from '@/api/generated/homeport';
import NewGoal from '@/app/(app)/new/goal';
import { inApp } from '@/test/phone';
import { linds } from '@/test/samples';
import { goal, onSampleToday } from '@/test/samples/plan';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const mockCache = { goalMade: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}), usePreventRemove: () => jest.fn() }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/api/generated/homeport', () => ({ createGoal: jest.fn() }));

const mockLinds = linds;

describe('/new/goal', () => {
  beforeAll(onSampleToday);
  afterAll(() => jest.useRealTimers());
  beforeEach(() => jest.clearAllMocks());

  it('starts a money goal: how much, what there is already, and opens it', async () => {
    jest.mocked(createGoal).mockResolvedValue(goal({ id: 'g-new' }));
    await render(inApp(<NewGoal />));
    expect(screen.getByRole('header', { name: 'New goal' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Money', checked: true })).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('What are you working towards?'), 'Norway 2027');
    await user.type(screen.getByLabelText('A few words about it'), 'Two weeks by train and ferry');
    await user.type(screen.getByLabelText('How much, in euros'), '8000');
    await user.type(screen.getByLabelText('Already saved, in euros'), '120.50');
    await user.press(screen.getByRole('button', { name: 'Start it' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'goal', id: 'g-new' } }));
    expect(createGoal).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', title: 'Norway 2027', blurb: 'Two weeks by train and ferry', emoji: '🎯', targetDay: undefined, day: '2026-11-11', audience: 'me', unit: 'money', unitWords: undefined, target: 800000, current: 12050 });
    expect(mockCache.goalMade).toHaveBeenCalled();
  });

  it('starts a goal that counts something, with its own picture', async () => {
    jest.mocked(createGoal).mockResolvedValue(goal());
    await render(inApp(<NewGoal />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('What are you working towards?'), 'Read 20 books');
    await user.press(screen.getByRole('radio', { name: '📚' }));
    await user.press(screen.getByRole('radio', { name: 'A number' }));
    expect(screen.getByText('Books, stars, runs: anything you count. Each tick adds one.')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('How many'), '20');
    await user.type(screen.getByLabelText('What is counted'), 'books');
    await user.press(screen.getByRole('button', { name: 'Start it' }));
    await waitFor(() => expect(createGoal).toHaveBeenCalledWith(expect.objectContaining({ title: 'Read 20 books', emoji: '📚', unit: 'count', unitWords: 'books', target: 20, current: undefined })));
  });

  it('starts a goal that counts the ticked steps of a list', async () => {
    jest.mocked(createGoal).mockResolvedValue(goal());
    await render(inApp(<NewGoal />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('What are you working towards?'), 'Move house');
    await user.press(screen.getByRole('radio', { name: 'Steps' }));
    expect(screen.queryByLabelText('How many')).toBeNull();
    await user.type(screen.getByLabelText('The steps, one on each line'), 'Pack the kitchen\n\nBook the van');
    await user.press(screen.getByRole('button', { name: 'Start it' }));
    await waitFor(() => expect(createGoal).toHaveBeenCalledWith(expect.objectContaining({ title: 'Move house', how: 'ticks', steps: ['Pack the kitchen', 'Book the van'] })));
  });

  it('asks for a name and for how much before it sends anything, and shows what the API said', async () => {
    jest.mocked(createGoal).mockRejectedValue(new ApiError(400, 'ends_before_it_starts', "The day to be done by can't be before it began."));
    await render(inApp(<NewGoal />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Start it' }));
    expect(screen.getByText('Give the goal a name first.')).toBeOnTheScreen();
    expect(screen.getByText('Say how much, or how many.')).toBeOnTheScreen();
    expect(createGoal).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('What are you working towards?'), 'Skates');
    await user.type(screen.getByLabelText('How much, in euros'), 'a lot');
    await user.press(screen.getByRole('button', { name: 'Start it' }));
    expect(createGoal).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('How much, in euros'));
    await user.type(screen.getByLabelText('How much, in euros'), '90');
    await user.press(screen.getByRole('button', { name: 'Start it' }));
    expect(await screen.findByText("The day to be done by can't be before it began.")).toBeOnTheScreen();
  });
});
