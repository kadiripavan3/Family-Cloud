import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, addBoardEntry, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { BOARD_ID } from '@/test/boards';
import { inApp } from '@/test/phone';
import { crewCircle, loaded } from '@/test/samples';
import { award, awardOpen, awards2025, awardsBoard, awardsView, kaiBrief, leaBrief, nominee, noraCrewBrief } from '@/test/samples/crew';

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

describe('19.8 The awards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The year that is read with `show` answers as that year; the board as it opens answers as this one.
    asked.mockImplementation((_id: string, params: { show?: string }) => loaded(params.show === '2025' ? awardsBoard(awards2025) : awardsBoard()));
    jest.mocked(actOnBoard).mockResolvedValue(awardsBoard());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'new', board: awardsBoard() });
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
  });

  it("shows this year's awards: who won the decided ones and what for, how far the open ones are, and the shelf", async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'The 2026 awards' })).toBeOnTheScreen();
    expect(screen.getAllByText('Decided')).toHaveLength(3);
    expect(screen.getAllByText('Voting')).toHaveLength(2);
    expect(screen.getByText('Most likely to miss the flight')).toBeOnTheScreen();
    expect(screen.getByText('Kai · 4 of 5 votes, their own included')).toBeOnTheScreen();
    expect(screen.getByText('Lena · the tiled bar in Alfama')).toBeOnTheScreen();
    expect(screen.getByText('Ana · the market at six in the morning')).toBeOnTheScreen();
    expect(screen.getByText('Worst idea that worked')).toBeOnTheScreen();
    expect(screen.getByText('3 of 5 have voted')).toBeOnTheScreen();
    expect(screen.getByText('2 of 5 have voted')).toBeOnTheScreen();
    // The pill on an open award is how the card says it can be voted on; the card itself is the button.
    expect(screen.getAllByText('Vote', { includeHiddenElements: true })).toHaveLength(2);
    expect(screen.getByText("Opens on New Year's Eve")).toBeOnTheScreen();
    expect(screen.getByText('With 2025, 2024 and 2023 beside it')).toBeOnTheScreen();
    // The bar is full: who sees it is on More.
    expect(screen.queryByRole('button', { name: /^Seen by/ })).toBeNull();
  });

  it("gives this person's one vote to a nominee, and shows nothing of how the others voted", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Worst idea that worked. Voting. 3 of 5 have voted' }));
    expect(screen.getByText('Voting · 3 of 5 have voted')).toBeOnTheScreen();
    expect(screen.getByText('Your one vote for this award. Nobody sees who voted for whom, and the result shows when everyone has voted.')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Vote for Kai. booking the 6 a.m. flight' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Vote for Lea. the shortcut through the cemetery' })).not.toBeChecked();
    expect(screen.queryByText(/^\d+ votes?$/)).toBeNull();
    await user.press(screen.getByRole('radio', { name: 'Vote for Kai. booking the 6 a.m. flight' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'vote', body: { nomineeId: 'nominee-flight' } }, DAY));
  });

  it('shows the vote this person gave, and takes it back when it is pressed again', async () => {
    const mine = { ...awardOpen, voted: 4, youVoted: true, yourNomineeId: 'nominee-shortcut' };
    asked.mockReturnValue(loaded(awardsBoard(awardsView({ awards: [mine] }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Voted', { includeHiddenElements: true })).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Worst idea that worked. Voting. 4 of 5 have voted' }));
    expect(screen.getByRole('radio', { name: 'Vote for Lea. the shortcut through the cemetery' })).toBeChecked();
    await user.press(screen.getByRole('radio', { name: 'Vote for Lea. the shortcut through the cemetery' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'unvote', body: { awardId: 'award-idea' } }, DAY));
  });

  it('shows how many votes each nominee had once an award is decided', async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^Most likely to miss the flight\. Decided/ }));
    expect(screen.getByText('Decided · 5 votes')).toBeOnTheScreen();
    expect(screen.getByLabelText('Kai. 4 votes. Won')).toBeOnTheScreen();
    expect(screen.getByLabelText('Lea. the Porto bus. 1 vote')).toBeOnTheScreen();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nominate someone' })).toBeNull();
  });

  it('nominates someone for an open award', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Best thing anyone cooked/ }));
    await user.press(screen.getByRole('button', { name: 'Nominate someone' }));
    expect(screen.getByRole('button', { name: 'Nominate' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Kai' }));
    await user.type(screen.getByLabelText('What for? (if you like)'), 'toast');
    await user.press(screen.getByRole('button', { name: 'Nominate' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'nominee', fields: { awardId: 'award-cooked', memberId: 'm-crew-2', what: 'toast', mediaId: undefined } }, DAY));
  });

  it('decides an award early after asking, and says so when nobody has voted', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Worst idea that worked/ }));
    await user.press(screen.getByRole('button', { name: 'Decide it now' }));
    expect(screen.getByText("Decide it now, with the votes there are? It can't be opened again.")).toBeOnTheScreen();
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(409, 'no_votes', 'Nobody has voted yet. There is nothing to decide.'));
    await user.press(screen.getByRole('button', { name: 'Yes, decide it' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'decide', body: { awardId: 'award-idea' } }, DAY));
    expect(await screen.findByText('Nobody has voted yet. There is nothing to decide.')).toBeOnTheScreen();
  });

  it('adds an award with a picture of its own', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add an award' }));
    expect(screen.getByRole('radio', { name: 'Trophy' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Add the award' })).toBeDisabled();
    await user.type(screen.getByLabelText('What is it for?'), 'Best nap');
    await user.press(screen.getByRole('radio', { name: 'Star' }));
    await user.press(screen.getByRole('button', { name: 'Add the award' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'award', fields: { name: 'Best nap', emoji: '⭐' } }, DAY));
  });

  it('reads an earlier year from the shelf, and comes back', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Past years' }));
    expect(screen.getByText('Every year stays on the shelf.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'The 2025 awards' }));
    expect(asked).toHaveBeenCalledWith(BOARD_ID, { day: '2026-11-11', show: '2025' }, expect.anything());
    expect(screen.getByRole('header', { name: 'The 2025 awards' })).toBeOnTheScreen();
    expect(screen.getByText('Best wrong turn')).toBeOnTheScreen();
    expect(screen.getByText('Lena · 4 of 4 votes, their own included')).toBeOnTheScreen();
    expect(screen.getByText('Decided, and on the shelf')).toBeOnTheScreen();
    expect(screen.queryByText('Most likely to miss the flight')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Back to 2026' }));
    expect(screen.getByRole('header', { name: 'The 2026 awards' })).toBeOnTheScreen();
    expect(screen.getByText('Most likely to miss the flight')).toBeOnTheScreen();
  });

  it('names the reader as "You" when they won, and both when two tied', async () => {
    asked.mockReturnValue(
      loaded(
        awardsBoard(
          awardsView({
            awards: [
              award({ id: 'award-packer', name: 'Most improved packer', nominees: [nominee(noraCrewBrief, { votes: 3, winner: true, ownVoteIncluded: true }), nominee(leaBrief, { votes: 2 })] }),
              award({ id: 'award-laugh', name: 'Loudest laugh', voted: 4, totalVotes: 4, nominees: [nominee(kaiBrief, { votes: 2, winner: true }), nominee(leaBrief, { votes: 2, winner: true })] }),
              award({ id: 'award-none', name: 'Best hat', voted: 0, totalVotes: 0, youVoted: false, yourNomineeId: null, nominees: [nominee(kaiBrief, { votes: 0 })] }),
            ],
          }),
        ),
      ),
    );
    await render(inApp(<Board />));
    expect(screen.getByText('You · 3 of 5 votes, your own included')).toBeOnTheScreen();
    expect(screen.getByText('Kai and Lea · tied on 2 votes each')).toBeOnTheScreen();
    expect(screen.getByText('Nobody voted')).toBeOnTheScreen();
  });

  it('says so when there are no awards yet and no earlier year', async () => {
    asked.mockReturnValue(loaded(awardsBoard(awardsView({ awards: [], years: [] }))));
    await render(inApp(<Board />));
    expect(screen.getByText('No awards yet')).toBeOnTheScreen();
    expect(screen.getByText('Whatever is still open is decided then')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Past years' }));
    expect(screen.getByText('This is the first year on the shelf. Next year it stands here.')).toBeOnTheScreen();
  });

  it('says why someone who may only look cannot add an award', async () => {
    asked.mockReturnValue(loaded(awardsBoard(awardsView(), { canEdit: false })));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add an award' }));
    expect(screen.getByText('You can look and vote. Only people who can change this board add an award.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'OK' }));
    // They can still vote; they can't nominate or decide.
    await user.press(screen.getByRole('button', { name: /^Worst idea that worked/ }));
    expect(screen.getByRole('radio', { name: 'Vote for Kai. booking the 6 a.m. flight' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Nominate someone' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Decide it now' })).toBeNull();
  });
});
