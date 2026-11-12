import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, addBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { coupleCircle, loaded } from '@/test/samples';
import { bothYesBoard, bothYesView, deck, idea } from '@/test/samples/couple';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockCircle, useCircles: () => [mockCircle], useCircleIfAny: () => mockCircle }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-12' }));

const mockCircle = coupleCircle;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-12' };

describe('17.7 Both said yes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(bothYesBoard()));
    jest.mocked(actOnBoard).mockResolvedValue(bothYesBoard());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'new', board: bothYesBoard() });
  });

  it('shows the next idea of the open deck, what both said yes to, and the other decks', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Both said yes' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Dinner' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Names' })).not.toBeChecked();
    expect(screen.getByRole('header', { name: 'Tacos from the place on Trubarjeva' })).toBeOnTheScreen();
    expect(screen.getByText("6 of 8 · Alex can't see your answers")).toBeOnTheScreen();
    expect(screen.getByText('You both said yes to Thai')).toBeOnTheScreen();
    expect(screen.getByText('What only one of you wanted stays secret.')).toBeOnTheScreen();
    expect(screen.getByText('Also deciding')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Friday's film. You've done 3 of 10" })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Summer 2027. Alex has finished. You haven't." })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Names. 214 seen · 6 you both like' })).toBeOnTheScreen();
    // The open deck is asked for by its id, so it stays open while it is answered.
    expect(asked).toHaveBeenCalledWith(BOARD_ID, { day: '2026-11-12', show: 'deck-dinner' }, expect.anything());
  });

  it('says yes or no to the idea, in private', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Yes to Tacos from the place on Trubarjeva' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'say', body: { ideaId: 'idea-tacos', yes: true } }, DAY));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalledTimes(1));
    await user.press(screen.getByRole('button', { name: 'No to Tacos from the place on Trubarjeva' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'say', body: { ideaId: 'idea-tacos', yes: false } }, DAY));
  });

  it('opens another deck from its tab or its row', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('radio', { name: 'Film' }));
    expect(asked).toHaveBeenLastCalledWith(BOARD_ID, { day: '2026-11-12', show: 'deck-film' }, expect.anything());
    await user.press(screen.getByRole('button', { name: /^Summer 2027/ }));
    expect(asked).toHaveBeenLastCalledWith(BOARD_ID, { day: '2026-11-12', show: 'deck-holiday' }, expect.anything());
  });

  it("keeps a locked deck shut where there is no phone's lock to open it with, whatever the API hands out", async () => {
    asked.mockReturnValue(loaded(bothYesBoard(bothYesView({ deck: { id: 'deck-names', card: idea({ id: 'idea-ida', deckId: 'deck-names', text: 'Ida', emoji: null }), number: 215, of: 228, matches: [idea({ id: 'idea-oskar', deckId: 'deck-names', text: 'Oskar', match: true })] } }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: "Names is kept behind the phone's lock" })).toBeOnTheScreen();
    expect(screen.queryByText('Ida')).toBeNull();
    expect(screen.queryByText(/Oskar/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Yes to/ })).toBeNull();
  });

  it('says a deck is through once every idea is answered, and still shows the matches', async () => {
    asked.mockReturnValue(loaded(bothYesBoard(bothYesView({ decks: [deck({ seen: 8, youFinished: true, matches: 2 })], deck: { id: 'deck-dinner', card: null, number: 8, of: 8, matches: [idea({ id: 'idea-thai', text: 'Thai', match: true }), idea({ id: 'idea-tacos', text: 'tacos', match: true })] } }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: "You're through Dinner" })).toBeOnTheScreen();
    expect(screen.getByText('All 8 ideas answered. Only the matches show.')).toBeOnTheScreen();
    expect(screen.getByText('You both said yes to Thai and tacos')).toBeOnTheScreen();
    // With one deck there is nothing else to decide.
    expect(screen.queryByText('Also deciding')).toBeNull();
  });

  it('says a deck with nothing in it is empty, and how to add the first idea', async () => {
    asked.mockReturnValue(loaded(bothYesBoard(bothYesView({ decks: [deck({ ideas: 0, seen: 0, matches: 0 })], deck: { id: 'deck-dinner', card: null, number: 0, of: 0, matches: [] } }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Nothing in Dinner yet' })).toBeOnTheScreen();
    expect(screen.getByText('Add the first idea with the plus.')).toBeOnTheScreen();
  });

  it('adds an idea to the open deck', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add an idea or a deck' }));
    expect(screen.getByRole('radio', { name: 'To Dinner' })).toBeChecked();
    await user.type(screen.getByLabelText('The idea'), 'Ramen');
    await user.press(screen.getByRole('button', { name: 'Add the idea' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'idea', fields: { deckId: 'deck-dinner', text: 'Ramen', emoji: undefined } }, DAY));
  });

  it('starts a new deck, kept behind the lock when asked, and opens it', async () => {
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'deck-new', board: bothYesBoard() });
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add an idea or a deck' }));
    await user.press(screen.getByRole('radio', { name: 'A new deck' }));
    await user.type(screen.getByLabelText('What you are deciding'), 'The dog’s name');
    await user.type(screen.getByLabelText('A short word for its tab'), 'Dog');
    await user.press(screen.getByRole('switch', { name: "Keep it behind the phone's lock" }));
    await user.press(screen.getByRole('button', { name: 'Start the deck' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'deck', fields: { name: 'The dog’s name', label: 'Dog', emoji: undefined, day: undefined, locked: true } }, DAY));
    await waitFor(() => expect(asked).toHaveBeenLastCalledWith(BOARD_ID, { day: '2026-11-12', show: 'deck-new' }, expect.anything()));
  });

  it("says in the API's words why an answer did not arrive", async () => {
    jest.mocked(actOnBoard).mockRejectedValue(new ApiError(403, 'not_yours', 'Only people can say yes.'));
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^Yes to/ }));
    expect(await screen.findByText('Only people can say yes.')).toBeOnTheScreen();
  });

  it('lets someone who does not answer look, and offers them no yes or no', async () => {
    asked.mockReturnValue(loaded(bothYesBoard(bothYesView({ youAnswer: false }), { canEdit: false, mine: false })));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Nora and Alex answer here' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Yes to/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add an idea or a deck' })).toBeNull();
  });

  it('opens on a friendly page while there is no deck', async () => {
    asked.mockReturnValue(loaded(bothYesBoard(bothYesView({ decks: [], deck: null }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Nothing to decide yet' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Start a deck' }));
    expect(screen.getByLabelText('What you are deciding')).toBeOnTheScreen();
  });
});
