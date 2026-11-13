import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { pickPhoto, uploadPhoto } from '@/features/templates/media';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded } from '@/test/samples';
import { mission, missionsBoard, missionsView } from '@/test/samples/perks';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/features/templates/media', () => ({ pickPhoto: jest.fn(), uploadPhoto: jest.fn(), uploadSound: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const mockLinds = linds;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };

describe('16.3 Secret missions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(missionsBoard()));
    jest.mocked(actOnBoard).mockResolvedValue(missionsBoard());
  });

  it("shows this week's mission to its own person, and last week's as they were revealed", async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Secret missions' })).toBeOnTheScreen();
    expect(screen.getByText('Week 46 · only you can see this')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: "Do one of Mia's jobs before she notices." })).toBeOnTheScreen();
    expect(screen.getByText('Everyone has one this week. Yours is for Mia.')).toBeOnTheScreen();
    expect(screen.getByText('Last week, revealed on Sunday')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Alex for you: made your coffee three mornings running. You guessed by Wednesday' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mia for Leo: let him win at cards, twice. Leo had no idea' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Leo for Alex: hid a drawing in Dad's bag. Found in Reine, on day 3" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Leo's photo of it")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "You for Biscuit: one very long walk. Biscuit can't read, but knew" })).toBeOnTheScreen();
    // The heart is for the one a mission was done for.
    expect(screen.getByRole('checkbox', { name: 'A heart for this' })).toBeChecked();
    expect(screen.getAllByRole('checkbox', { name: 'A heart for this' })).toHaveLength(1);
  });

  it("shows a parent the mission of a child they read it to, and nobody else's", async () => {
    await render(inApp(<Board />));
    expect(screen.getByText("Week 46 · Leo's, for you to read out")).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Give Biscuit ten minutes of scratches behind the ears.' })).toBeOnTheScreen();
    expect(screen.getByText("Leo's is for Biscuit. Tick it here when it is done.")).toBeOnTheScreen();
    // What the API didn't hand over isn't drawn: two cards, each with its own two buttons.
    expect(screen.getAllByRole('button', { name: 'Done' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'A different one' })).toHaveLength(2);
  });

  it('asks what was done before a mission is ticked, in the words everyone reads on Sunday', async () => {
    const after = missionsBoard(missionsView({ yours: [mission({ done: true, did: 'emptied the dishwasher for her' })] }));
    jest.mocked(actOnBoard).mockResolvedValue(after);
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getAllByRole('button', { name: 'Done' })[0]!);
    expect(screen.getByRole('header', { name: 'What did you do?' })).toBeOnTheScreen();
    expect(screen.getByText('In your own words, if you like. Everyone reads it on Sunday, and nobody before.')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('What you did'), 'emptied the dishwasher for her');
    await user.press(screen.getAllByRole('button', { name: 'Done' }).at(-1)!);
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalledWith(after));
    expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'done', body: { memberId: 'm-nora', did: 'emptied the dishwasher for her', mediaId: undefined } }, DAY);
  });

  it('sends a photo of it along', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ uri: 'file:///note.jpg', width: 600, height: 600 });
    jest.mocked(uploadPhoto).mockResolvedValue('media-note');
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getAllByRole('button', { name: 'Done' })[0]!);
    await user.press(screen.getByRole('button', { name: 'Add a photo' }));
    expect(await screen.findByLabelText('The photo you chose')).toBeOnTheScreen();
    await user.press(screen.getAllByRole('button', { name: 'Done' }).at(-1)!);
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'done', body: { memberId: 'm-nora', did: undefined, mediaId: 'media-note' } }, DAY));
  });

  it("ticks a child's mission for them, by their name", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getAllByRole('button', { name: 'Done' })[1]!);
    await user.press(screen.getAllByRole('button', { name: 'Done' }).at(-1)!);
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'done', body: { memberId: 'm-leo', did: undefined, mediaId: undefined } }, DAY));
  });

  it('asks for a different mission for the same person', async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getAllByRole('button', { name: 'A different one' })[0]!);
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'another', body: { memberId: 'm-nora' } }, DAY));
  });

  it('says a mission is done until Sunday, and lets the tick be taken back', async () => {
    asked.mockReturnValue(loaded(missionsBoard(missionsView({ yours: [mission({ done: true, did: 'emptied the dishwasher for her' })] }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Done. Everyone reads about it on Sunday.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'A different one' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Not done after all' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'done', body: { memberId: 'm-nora', done: false } }, DAY));
  });

  it('gives a heart to what was done for you, and takes it back', async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('checkbox', { name: 'A heart for this' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'like', body: { entryId: 'mission-alex', liked: false } }, DAY));
  });

  it('opens a revealed mission: what it was, the photo, and a line to add under it', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Alex for you/ }));
    expect(screen.getByRole('header', { name: 'Alex for you' })).toBeOnTheScreen();
    expect(screen.getByText("The mission was: Make Nora's coffee before she asks.")).toBeOnTheScreen();
    expect(screen.getByText('Alex made your coffee three mornings running.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Take the heart back' })).toBeOnTheScreen();
    const line = screen.getByLabelText('A line under it');
    expect(line).toHaveDisplayValue('You guessed by Wednesday');
    await user.clear(line);
    await user.type(line, 'I knew on Tuesday');
    await user.press(screen.getByRole('button', { name: 'Keep the line' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'reply', body: { entryId: 'mission-alex', text: 'I knew on Tuesday' } }, DAY));
  });

  it('lets a parent give the heart for a child or the dog, and nobody for a grown-up', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    // Mia's was for Leo, who has no phone: Nora presses for him.
    await user.press(screen.getByRole('button', { name: /^Mia for Leo/ }));
    await user.press(screen.getByRole('button', { name: 'Give it a heart for Leo' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'like', body: { entryId: 'mission-mia', liked: true } }, DAY));
  });

  it("leaves another grown-up's heart and line to them", async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^Leo for Alex/ }));
    expect(screen.getByRole('header', { name: 'Leo for Alex' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /heart/ })).toBeNull();
    // Leo did it, and Nora stands in for Leo: she may add the line he would.
    expect(screen.getByLabelText('A line under it')).toBeOnTheScreen();
  });

  it('looks at the week before, and comes back', async () => {
    const earlier = missionsBoard(missionsView({ revealedWeekStart: '2026-10-26', revealed: [mission({ id: 'mission-old', weekStart: '2026-10-26', doer: { memberId: 'm-alex', name: 'Alex', avatarUrl: null }, yours: false, done: true, revealed: true, did: 'raked the leaves', reply: null })] }));
    asked.mockImplementation((_id: string, params: { show?: string }) => loaded(params.show ? earlier : missionsBoard()));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'The week before' }));
    expect(asked).toHaveBeenCalledWith(BOARD_ID, { day: '2026-11-11', show: '2026-10-26' }, expect.anything());
    expect(screen.getByText('26 October to 1 November, revealed')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Alex for Mia: raked the leaves' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Back to the last week revealed' }));
    expect(screen.getByText('Last week, revealed on Sunday')).toBeOnTheScreen();
  });

  it('says so when there is no mission this week and nothing was revealed', async () => {
    asked.mockReturnValue(loaded(missionsBoard(missionsView({ yours: [], revealedWeekStart: null, revealed: [] }))));
    await render(inApp(<Board />));
    expect(screen.getByText('No mission for you this week')).toBeOnTheScreen();
    expect(screen.getByText('A new one comes on Monday, one for everyone.')).toBeOnTheScreen();
    expect(screen.getByText('What gets done this week shows up here on Sunday, for everyone to read.')).toBeOnTheScreen();
  });

  it('says why a mission could not be changed', async () => {
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(409, 'done', 'This one is done. A new one comes on Monday.'));
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getAllByRole('button', { name: 'A different one' })[0]!);
    expect(await screen.findByText('This one is done. A new one comes on Monday.')).toBeOnTheScreen();
  });
});
