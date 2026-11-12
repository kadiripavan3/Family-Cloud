import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, addBoardEntry, changeBoardEntry, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { pickPhoto, uploadPhoto } from '@/features/templates/media';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded } from '@/test/samples';
import { whereAnswered, whereBoard, whereView } from '@/test/samples/perks';

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
/** The board as the API answers it: everything put away, or the answer to a question when one is asked. */
const answering = (answer = whereAnswered) => (_id: string, params: { show?: string }) => loaded(whereBoard(params.show ? { ...answer, asked: params.show } : whereView()));

describe('16.6 Where is it?', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockImplementation(answering());
    jest.mocked(actOnBoard).mockResolvedValue(whereBoard());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'item-new', board: whereBoard() });
    jest.mocked(changeBoardEntry).mockResolvedValue(whereBoard());
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined);
  });

  it('opens on a box to ask in, with everything that is put away under it', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Where is it?' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'More' })).toBeOnTheScreen();
    expect(screen.getByLabelText("Where's the…?")).toBeOnTheScreen();
    expect(screen.getByText('Things put away')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Spare car key. With Marta next door' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Christmas lights. Cellar, top shelf, on the left' })).toBeOnTheScreen();
    // Where it was last seen since stands in for where it was put: who said so, and the time for today.
    expect(screen.getByRole('button', { name: "Leo's swimming bag. Last seen on the hall hook · Mia, 7:50" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'The passports. Bedroom, grey folder' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tent. Attic, blue crate 3' })).toBeOnTheScreen();
    expect(screen.getByText('Putting something away?')).toBeOnTheScreen();
    expect(screen.getByText('A photo and a place')).toBeOnTheScreen();
  });

  it('says who each thing is kept to: a few people, or everyone who sees the list', async () => {
    await render(inApp(<Board />));
    expect(screen.getAllByLabelText('Seen by: Alex and you')).toHaveLength(2);
    expect(screen.getAllByLabelText('Seen by: The Linds')).toHaveLength(3);
  });

  it('answers a question with the place, the photo and who put it there, as the drawing has it', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Where's the…?"), "where's the tent");
    expect(await screen.findByText('Found')).toBeOnTheScreen();
    expect(asked).toHaveBeenCalledWith(BOARD_ID, { day: '2026-11-11', show: "where's the tent" }, expect.anything());
    expect(screen.getByText('Attic, blue crate 3')).toBeOnTheScreen();
    expect(screen.getByText('Tent, pegs and both mats. Alex put them there on 14 September.')).toBeOnTheScreen();
    expect(screen.getByLabelText('A photo of where Tent is')).toBeOnTheScreen();
    expect(screen.getByText('Other things put away')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Tent. Attic, blue crate 3' })).toBeNull();
  });

  it("gives the top of the page to the question while one is asked: the board's own bar makes way, and Cancel brings it back", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Where's the…?"), 'tent');
    // The frame draws the bar a template hands it in place of its own.
    expect(screen.queryByRole('header', { name: 'Where is it?' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(await screen.findByText('Found')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('header', { name: 'Where is it?' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'More' })).toBeOnTheScreen();
    expect(screen.getByLabelText("Where's the…?")).toHaveDisplayValue('');
    expect(screen.queryByText('Found')).toBeNull();
    expect(screen.getByText('Things put away')).toBeOnTheScreen();
  });

  it('clears the question with the cross', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Where's the…?"), 'tent');
    await user.press(screen.getByRole('button', { name: 'Clear the question' }));
    expect(screen.getByLabelText("Where's the…?")).toHaveDisplayValue('');
    expect(screen.queryByRole('button', { name: 'Clear the question' })).toBeNull();
  });

  it('says so when nothing that is put away answers', async () => {
    asked.mockImplementation(answering(whereView({ found: null })));
    await render(inApp(<Board />));
    await userEvent.setup().type(screen.getByLabelText("Where's the…?"), 'the hamster');
    expect(await screen.findByText('Nothing put away answers “the hamster”')).toBeOnTheScreen();
    expect(screen.getByText("Try the name of the thing itself. If it isn't on the list yet, add where it is.")).toBeOnTheScreen();
    expect(screen.getByText('Things put away')).toBeOnTheScreen();
  });

  it('opens a thing: where it is, who put it there, and saying where it was last seen', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Spare car key/ }));
    expect(screen.getByRole('header', { name: 'Spare car key' })).toBeOnTheScreen();
    // One key is "it"; the tent with its pegs and mats was "them".
    expect(screen.getByText('Nora put it there on 15 July.')).toBeOnTheScreen();
    const say = screen.getByRole('button', { name: 'Say where you saw it' });
    expect(say).toBeDisabled();
    await user.type(screen.getByLabelText('Seen it somewhere else? Say where'), 'in the fruit bowl');
    await user.press(say);
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalled());
    expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'seen', body: { entryId: 'item-key', place: 'in the fruit bowl' } }, DAY);
  });

  it('gives a thing a new place, or takes it off the list', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Christmas lights/ }));
    await user.type(screen.getByLabelText('It lives somewhere new'), 'Attic, red crate');
    await user.press(screen.getByRole('button', { name: 'Give it its new place' }));
    await waitFor(() => expect(changeBoardEntry).toHaveBeenCalledWith('item-lights', { fields: { place: 'Attic, red crate' } }, DAY));

    await user.press(screen.getByRole('button', { name: /^The passports/ }));
    await user.press(screen.getByRole('button', { name: 'Take it off the list' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('item-passports'));
  });

  it('puts something away: what it is, where, a photo, and who it is for', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ uri: 'file:///cellar.jpg', width: 800, height: 600 });
    jest.mocked(uploadPhoto).mockResolvedValue('media-cellar');
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('header', { name: 'Put something away' })).toBeOnTheScreen();
    const save = screen.getByRole('button', { name: 'Put it on the list' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('What it is'), 'Sledge');
    await user.type(screen.getByLabelText('Where it is'), 'Cellar, behind the bikes');
    await user.type(screen.getByLabelText('What else to know'), 'The rope is in the box');
    await user.press(screen.getByRole('radio', { name: 'Tools' }));
    await user.press(screen.getByRole('button', { name: 'Add a photo of the place' }));
    expect(await screen.findByLabelText('The photo you chose')).toBeOnTheScreen();
    // Kept to Alex: whoever keeps it to some people is always one of them, so Nora isn't offered herself.
    expect(screen.getByRole('checkbox', { name: 'Everyone who sees the list' })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Nora' })).toBeNull();
    await user.press(screen.getByRole('checkbox', { name: 'Alex' }));
    await user.press(save);
    await waitFor(() =>
      expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'item', fields: { name: 'Sledge', place: 'Cellar, behind the bikes', emoji: '🛠️', note: 'The rope is in the box', mediaId: 'media-cellar', onlyMemberIds: ['m-alex'] } }, DAY),
    );
  });

  it('lets someone who may only look say where they saw a thing, and nothing more', async () => {
    asked.mockReturnValue(loaded(whereBoard(whereView(), { mine: false, canEdit: false })));
    await render(inApp(<Board />));
    expect(screen.queryByText('Putting something away?')).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: /^Tent/ }));
    expect(screen.getByRole('button', { name: 'Say where you saw it' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Take it off the list' })).toBeNull();
    expect(screen.queryByLabelText('It lives somewhere new')).toBeNull();
  });

  it('says why saying so did not work', async () => {
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(400, 'not_yours_to_say', 'You can say what you saw, or what a child of yours saw.'));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Tent/ }));
    await user.type(screen.getByLabelText('Seen it somewhere else? Say where'), 'in the car');
    await user.press(screen.getByRole('button', { name: 'Say where you saw it' }));
    expect(await screen.findByText('You can say what you saw, or what a child of yours saw.')).toBeOnTheScreen();
  });

  it('says a list with nothing on it is empty', async () => {
    asked.mockReturnValue(loaded(whereBoard(whereView({ items: [], count: 0 }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Nothing is put away yet' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add' })).toBeOnTheScreen();
  });
});
