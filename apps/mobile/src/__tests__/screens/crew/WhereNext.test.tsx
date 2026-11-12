import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, addBoardEntry, changeBoard, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { pickPhoto, uploadPhoto } from '@/features/templates/media';
import { BOARD_ID, mockBoardRouterState } from '@/test/boards';
import { inApp } from '@/test/phone';
import { crewCircle, loaded } from '@/test/samples';
import { voteBoard, voteOpen, voteView } from '@/test/samples/crew';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockCrew, useCircles: () => [mockCrew], useCircleIfAny: () => mockCrew }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/features/templates/media', () => ({ pickPhoto: jest.fn(), uploadPhoto: jest.fn(), uploadSound: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const mockCrew = { ...crewCircle, myMemberId: 'm-crew-1' };
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };

describe('19.5 Where next?', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(voteBoard()));
    jest.mocked(actOnBoard).mockResolvedValue(voteBoard());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'idea-new', board: voteBoard(voteOpen) });
    jest.mocked(changeBoard).mockResolvedValue(voteBoard(voteOpen));
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
  });

  it('shows a closed vote with the facts, each idea\'s part of the votes and who voted for it, and the winner', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Where next?' })).toBeOnTheScreen();
    expect(screen.getByText('Spring 2027 · 5 of 5 voted')).toBeOnTheScreen();
    expect(screen.getByText('Porto')).toBeOnTheScreen();
    expect(screen.getByText('4 days · about €310 each')).toBeOnTheScreen();
    expect(screen.getByText('3 votes, yours too')).toBeOnTheScreen();
    expect(screen.getByText('The Soča valley, by bike')).toBeOnTheScreen();
    expect(screen.getByText('3 days · about €180 each')).toBeOnTheScreen();
    expect(screen.getByText('6 days · about €520 each')).toBeOnTheScreen();
    expect(screen.getAllByText('1 vote')).toHaveLength(2);
    expect(screen.getAllByRole('progressbar').map((bar) => bar.props.accessibilityValue.now)).toEqual([60, 20, 20]);
    expect(screen.getByRole('button', { name: 'Porto. 4 days · about €310 each. 3 votes, yours too. The winner' })).toBeOnTheScreen();
    expect(screen.getByText('Porto it is')).toBeOnTheScreen();
    expect(screen.getByText('Make it a trip: a space to plan in now, a shared journey when you leave.')).toBeOnTheScreen();
  });

  it('makes the winner a trip, and then leads to its own space', async () => {
    const { rerender } = await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Make Porto a trip' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'make_trip', body: {} }, DAY));

    asked.mockReturnValue(loaded(voteBoard(voteView({ tripFolderId: '66666666-6666-4666-8666-666666666666' }))));
    await rerender(inApp(<Board />));
    expect(screen.getByText('It has a space of its own under Trips, with a page of the facts to plan from.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Make Porto a trip' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Open it' }));
    expect(mockBoardRouterState.push).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'folder', id: '66666666-6666-4666-8666-666666666666' } });
  });

  it('draws nothing of who voted for what while the vote is open: only this person\'s own tick', async () => {
    asked.mockReturnValue(loaded(voteBoard(voteOpen)));
    await render(inApp(<Board />));
    expect(screen.getByText('Spring 2027 · 3 of 5 voted')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/^\d+ votes?\b/)).toBeNull();
    expect(screen.getAllByText('Your vote')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Porto. 4 days · about €310 each. Your vote' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sicily. 6 days · about €520 each' })).toBeOnTheScreen();
    expect(screen.getByText('3 of 5 have voted')).toBeOnTheScreen();
    expect(screen.getByText('Nobody sees who voted for what until it closes. Waiting for Kai and Lena.')).toBeOnTheScreen();
    expect(screen.queryByText(/it is$/)).toBeNull();
  });

  it('moves this person\'s one vote to another idea, and takes it back', async () => {
    asked.mockReturnValue(loaded(voteBoard(voteOpen)));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Sicily. 6 days · about €520 each' }));
    expect(screen.getByText('Added by Lena')).toBeOnTheScreen();
    expect(screen.getByText('Your vote moves here from the place you chose before.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Vote for Sicily' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'vote', body: { ideaId: 'idea-sicily' } }, DAY));

    await user.press(screen.getByRole('button', { name: 'Porto. 4 days · about €310 each. Your vote' }));
    expect(screen.getByText('You added this')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Take my vote back' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'unvote', body: {} }, DAY));
  });

  it('asks someone who has not voted to, and says the vote is private', async () => {
    asked.mockReturnValue(loaded(voteBoard({ ...voteOpen, voted: 2, youVoted: false, ideas: voteOpen.ideas.map((one) => ({ ...one, yours: false })) })));
    await render(inApp(<Board />));
    expect(screen.getByText('Tap a place to vote. Nobody sees who voted for what until it closes.')).toBeOnTheScreen();
    expect(screen.queryByText('Your vote')).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Porto. 4 days · about €310 each' }));
    expect(screen.getByText('Your one vote. Nobody sees it until the vote closes, and it closes when everyone has voted.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Vote for Porto' })).toBeOnTheScreen();
  });

  it('adds an idea with its facts and a photo while the vote is open', async () => {
    asked.mockReturnValue(loaded(voteBoard(voteOpen)));
    jest.mocked(pickPhoto).mockResolvedValue({ uri: 'file:///madeira.jpg', width: 800, height: 600 });
    jest.mocked(uploadPhoto).mockResolvedValue('media-1');
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add an idea' }));
    expect(screen.getByRole('button', { name: 'Add it to the vote' })).toBeDisabled();
    await user.type(screen.getByLabelText('Where to'), 'Madeira');
    await user.type(screen.getByLabelText('Days'), 'a week');
    await user.type(screen.getByLabelText('Roughly, each'), '420');
    await user.press(screen.getByRole('button', { name: 'Add it to the vote' }));
    expect(screen.getByText('A number of days, 1 to 365')).toBeOnTheScreen();
    expect(addBoardEntry).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Days'));
    await user.type(screen.getByLabelText('Days'), '5');
    await user.press(screen.getByRole('button', { name: 'Add a photo' }));
    await user.press(screen.getByRole('button', { name: 'Add it to the vote' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'idea', fields: { name: 'Madeira', days: 5, costCents: 42000, note: undefined, mediaId: 'media-1' } }, DAY));
    expect(uploadPhoto).toHaveBeenCalledWith({ uri: 'file:///madeira.jpg', width: 800, height: 600 });
  });

  it('takes out an idea of this person\'s own while the vote is open', async () => {
    asked.mockReturnValue(loaded(voteBoard(voteOpen)));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Porto. 4 days · about €310 each. Your vote' }));
    await user.press(screen.getByRole('button', { name: 'Take this idea out' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('idea-porto'));
    // Someone else's idea has no such button.
    await user.press(screen.getByRole('button', { name: 'Sicily. 6 days · about €520 each' }));
    expect(screen.queryByRole('button', { name: 'Take this idea out' })).toBeNull();
  });

  it('says plainly that nothing more can be added once the vote is closed, and shows who voted for an idea', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add an idea' }));
    expect(screen.getByText('The vote is closed. Start a new one for the next round.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'OK' }));
    await user.press(screen.getByRole('button', { name: /^Porto\./ }));
    expect(screen.getByText('Voted for by Nora, Lea and Ana')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Vote for Porto' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Take my vote back' })).toBeNull();
    // More holds nothing of the vote's own any longer.
    await user.press(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: /^Close the vote now/ })).toBeNull();
  });

  it('closes the vote early from More after asking, and says so when nobody has voted', async () => {
    asked.mockReturnValue(loaded(voteBoard(voteOpen)));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Close the vote now. Before everyone has voted' }));
    expect(screen.getByRole('header', { name: 'Close the vote now?' })).toBeOnTheScreen();
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(409, 'no_votes', 'Nobody has voted yet. There is nothing to close.'));
    await user.press(screen.getByRole('button', { name: 'Close the vote' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'close', body: {} }, DAY));
    expect((await screen.findAllByText('Nobody has voted yet. There is nothing to close.')).length).toBeGreaterThan(0);
  });

  it('saves when the trip would be, from More', async () => {
    asked.mockReturnValue(loaded(voteBoard(voteOpen)));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'When, and how long to vote' }));
    expect(screen.getByRole('button', { name: 'Last day to vote: Until everyone has voted. Change' })).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('When would it be?'));
    await user.type(screen.getByLabelText('When would it be?'), 'Early summer');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeBoard).toHaveBeenCalledWith(BOARD_ID, { title: undefined, settings: { when: 'Early summer', closesOn: null } }, DAY));
  });

  it('says so when there are no ideas yet, when the winner tied, and when a vote closed without a vote', async () => {
    asked.mockReturnValue(loaded(voteBoard({ ...voteOpen, voted: 0, youVoted: false, ideas: [] })));
    const { rerender } = await render(inApp(<Board />));
    expect(screen.getByText('No ideas yet')).toBeOnTheScreen();
    expect(screen.getByText('Spring 2027')).toBeOnTheScreen();

    asked.mockReturnValue(loaded(voteBoard(voteView({ tied: true }))));
    await rerender(inApp(<Board />));
    expect(screen.getByText('It tied, and won by being added first. Make it a trip: a space to plan in now, a shared journey when you leave.')).toBeOnTheScreen();

    asked.mockReturnValue(loaded(voteBoard(voteView({ voted: 0, youVoted: false, winnerId: null, ideas: voteView().ideas.map((one) => ({ ...one, yours: false, votes: 0, percent: 0, voters: [], winner: false })) }))));
    await rerender(inApp(<Board />));
    expect(screen.getByText('Closed without a vote')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Make/ })).toBeNull();
  });
});
