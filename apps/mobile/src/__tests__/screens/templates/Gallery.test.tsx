import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { startTemplate, useGetBoards, useGetTemplates } from '@/api/generated/homeport';
import Templates from '@/app/(app)/templates';
import { inApp } from '@/test/phone';
import { coupleCircle, failed, linds, loaded, pending } from '@/test/samples';
import { boardCard, coupleGallery, gallery, startedLive, startedPlain } from '@/test/samples/templates';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false) };
const mockStarted = jest.fn(() => Promise.resolve());
let mockCircle = linds;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));
jest.mock('@/api/cache', () => ({ useCache: () => ({ templateStarted: mockStarted }) }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockCircle, useCircles: () => [mockCircle], useCircleIfAny: () => mockCircle }));
jest.mock('@/api/generated/homeport', () => ({ useGetTemplates: jest.fn(), useGetBoards: jest.fn(), startTemplate: jest.fn(), useGetMe: jest.fn(() => ({ data: undefined })) }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const asked = jest.mocked(useGetTemplates) as unknown as jest.Mock;
const boards = jest.mocked(useGetBoards) as unknown as jest.Mock;

describe('5.6 Templates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCircle = linds;
    asked.mockReturnValue(loaded(gallery()));
    boards.mockReturnValue(loaded({ items: [], nextCursor: null }));
  });

  it('shows the chips and counts as served, the cards in their order, and LIVE on the ones that do work', async () => {
    await render(inApp(<Templates />));
    expect(screen.getByRole('header', { name: 'Templates' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
    expect(asked).toHaveBeenCalledWith('c-linds');
    for (const chip of ['All 53', 'Keepsakes', 'Home', 'Kids', 'Food', 'Fair and fun']) expect(screen.getByRole('button', { name: chip })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'All 53' })).toBeSelected();
    // Templates and keepsakes are what "All 53" counts; fair and fun has its own chip.
    expect(screen.getByRole('button', { name: 'Weekly meal plan. Does work for you. Plan dinners, get the shopping list' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'House manual. Wi‑Fi, bins, boiler, who to call' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Whose turn\?/ })).toBeNull();
    expect(screen.getAllByText('LIVE')).toHaveLength(5);
  });

  it('a chip shows its shelf or its topic', async () => {
    await render(inApp(<Templates />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Keepsakes' }));
    expect(screen.getByRole('button', { name: /^Time capsule/ })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^House manual/ })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Fair and fun' }));
    expect(screen.getByRole('button', { name: /^Whose turn\?/ })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Home' }));
    expect(screen.getByRole('button', { name: /^Chore wheel/ })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Whose turn\?/ })).toBeNull();
  });

  it("opens a couple's gallery on their own, with how many there are", async () => {
    mockCircle = coupleCircle;
    asked.mockReturnValue(loaded(coupleGallery));
    await render(inApp(<Templates />));
    expect(screen.getByRole('button', { name: 'For two, 16' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'All 53' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: /^Date ideas/ })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Weekly meal plan/ })).toBeNull();
  });

  it('searches within the cards, and says so when nothing matches', async () => {
    await render(inApp(<Templates />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Search templates' }));
    await user.type(screen.getByLabelText('Search templates'), 'who');
    expect(screen.getByRole('button', { name: /^House manual/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Whose turn\?/ })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Chore wheel/ })).toBeNull();
    await user.type(screen.getByLabelText('Search templates'), 'zzz');
    expect(screen.getByText('Nothing by that name')).toBeOnTheScreen();
    expect(screen.getByText('No template has “whozzz” in its name or its line. Try another word.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.getByRole('button', { name: 'All 53' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Chore wheel/ })).toBeOnTheScreen();
  });

  it('starts a plain template: says what it makes, makes it, and opens the first thing', async () => {
    jest.mocked(startTemplate).mockResolvedValue(startedPlain);
    await render(inApp(<Templates />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^House manual/ }));
    expect(screen.getByText('Starting it makes')).toBeOnTheScreen();
    expect(screen.getByText('Page · House manual')).toBeOnTheScreen();
    expect(screen.getByText('Checklist · When we go away')).toBeOnTheScreen();
    // A family's things start as only yours; the pill changes that before it is made.
    expect(screen.getByRole('button', { name: /Only you/ })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'page', id: '44444444-4444-4444-8444-444444444444' } }));
    expect(startTemplate).toHaveBeenCalledWith('c-linds', 'house_manual', { clientId: 'client-1', audience: 'me', title: undefined, settings: undefined }, { day: '2026-11-11' });
    expect(mockStarted).toHaveBeenCalledWith(startedPlain, 'c-linds', '2026-11-11');
  });

  it('starts one that does work: makes its board and opens it', async () => {
    jest.mocked(startTemplate).mockResolvedValue(startedLive);
    await render(inApp(<Templates />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Things they said/ }));
    expect(screen.getByText('This one does work for you: it keeps itself up to date as you use it.')).toBeOnTheScreen();
    expect(boards).toHaveBeenCalledWith('c-linds', { template: 'said' }, { query: { enabled: true } });
    await user.press(screen.getByRole('button', { name: /Only you/ }));
    await user.press(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: '33333333-3333-4333-8333-333333333333' } }));
    expect(startTemplate).toHaveBeenCalledWith('c-linds', 'said', expect.objectContaining({ clientId: 'client-1', audience: 'circle' }), { day: '2026-11-11' });
  });

  it('offers the ones the circle has already, and opens one', async () => {
    boards.mockReturnValue(loaded({ items: [boardCard()], nextCursor: null }));
    await render(inApp(<Templates />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Weekly meal plan/ }));
    expect(screen.getByText('In The Linds already')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Start another' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Weekly meal plan. 5 dinners this week' }));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'board', id: '33333333-3333-4333-8333-333333333333' } });
    expect(startTemplate).not.toHaveBeenCalled();
  });

  it("says so for one that isn't ready, in the API's words, and doesn't offer to start it", async () => {
    await render(inApp(<Templates />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Fair and fun' }));
    await user.press(screen.getByRole('button', { name: /^Whose turn\?/ }));
    expect(screen.getByText('Coming with the next update')).toBeOnTheScreen();
    expect(screen.getByText("It can't be started yet. Every template without this note can.")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(boards).toHaveBeenCalledWith('c-linds', { template: 'whose_turn' }, { query: { enabled: false } });
  });

  it('shows why starting did not work, and stays', async () => {
    jest.mocked(startTemplate).mockRejectedValue(new ApiError(409, 'coming_soon', "“Packing list” can't be started right now."));
    await render(inApp(<Templates />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Packing list/ }));
    await user.press(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByText("“Packing list” can't be started right now.")).toBeOnTheScreen();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('draws its shape while it loads, and keeps its Close', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<Templates />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
  });

  it('says what went wrong when the gallery cannot be read, and asks again', async () => {
    const answer = failed(new ApiError(500, 'error', 'Something went wrong on our side. Try again.'));
    asked.mockReturnValue(answer);
    await render(inApp(<Templates />));
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(answer.refetch).toHaveBeenCalled();
  });

  it('says so offline when it was never loaded', async () => {
    asked.mockReturnValue({ ...pending(), isPaused: true });
    await render(inApp(<Templates />));
    expect(screen.getByText("You're offline")).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Templates' })).toBeOnTheScreen();
  });
});
