import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { addBoardEntry, changeBoardEntry, removeBoardEntry, useGetBoard, useGetBoardEntriesInfinite } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { pickPhoto, uploadPhoto } from '@/features/templates/media';
import { BOARD_ID } from '@/test/boards';
import { inApp } from '@/test/phone';
import { crewCircle, loaded, pending } from '@/test/samples';
import { word, wordBreakfast, wordPlate, wordRamiro, wordsBoard, wordsView } from '@/test/samples/crew';

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
const list = jest.mocked(useGetBoardEntriesInfinite) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };
/** A list that has answered with these words, as the hook that reads a page at a time hands them over. */
const pageOf = (items: unknown[]) => ({ ...loaded({ pages: [{ items, nextCursor: null }], pageParams: [undefined] }), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });
const notYet = () => ({ ...pending(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() });

describe('19.6 The dictionary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(wordsBoard()));
    list.mockReturnValue(notYet());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'word-new', board: wordsBoard() });
    jest.mocked(changeBoardEntry).mockResolvedValue(wordsBoard());
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
  });

  it('shows the newest words at once, each with what kind it is, what it means and where it came from', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'The dictionary' })).toBeOnTheScreen();
    expect(screen.getByText('31 words')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Seen by: / })).toBeOnTheScreen();
    expect(screen.getByText(/^doing a Kai\s+verb$/)).toBeOnTheScreen();
    expect(screen.getByText('Reaching the gate as it closes, with a pastry.')).toBeOnTheScreen();
    expect(screen.getByText('First recorded at Lisbon airport, 4 Oct 2026, by Lea')).toBeOnTheScreen();
    expect(screen.getByText(/^the Ramiro incident\s+noun$/)).toBeOnTheScreen();
    expect(screen.getByText('Ana · see also: “just one more plate”')).toBeOnTheScreen();
    expect(screen.getByText('You · every trip since 2019')).toBeOnTheScreen();
    expect(screen.getByLabelText('A new word, and what it means')).toBeOnTheScreen();
    expect(list).toHaveBeenCalledWith(BOARD_ID, { kind: 'word', q: undefined, day: '2026-11-11' }, expect.anything());
  });

  it('reads the rest of the words from the list, a page at a time', async () => {
    list.mockReturnValue(pageOf([word(), wordRamiro, wordBreakfast, wordPlate]));
    await render(inApp(<Board />));
    expect(screen.getByText('The plate after the last plate. See: the Ramiro incident.')).toBeOnTheScreen();
    expect(screen.getByText('Kai')).toBeOnTheScreen();
  });

  it('searches the words from More, and says so when nothing is found', async () => {
    list.mockImplementation((_id: string, params: { q?: string }) => (params.q === 'plate' ? pageOf([wordRamiro, wordPlate]) : params.q ? pageOf([]) : notYet()));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Search the words' }));
    await user.type(screen.getByLabelText('Search the words'), 'plate');
    expect(list).toHaveBeenLastCalledWith(BOARD_ID, { kind: 'word', q: 'plate', day: '2026-11-11' }, expect.anything());
    expect(screen.getByText(/^just one more plate\s+noun$/)).toBeOnTheScreen();
    expect(screen.queryByText(/^doing a Kai/)).toBeNull();
    await user.type(screen.getByLabelText('Search the words'), 'zz');
    expect(screen.getByText('Not in the dictionary')).toBeOnTheScreen();
    expect(screen.getByText('No word or meaning has “platezz” in it.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.queryByLabelText('Search the words')).toBeNull();
    expect(screen.getByText(/^doing a Kai/)).toBeOnTheScreen();
  });

  it('starts a new word from the box: the word and its meaning are taken apart, and the rest is asked', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('A new word, and what it means'), 'gate cardio: The sprint from security to boarding.');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('header', { name: 'A new word' })).toBeOnTheScreen();
    expect(screen.getByLabelText('The word')).toHaveProp('value', 'gate cardio');
    expect(screen.getByLabelText('What it means')).toHaveProp('value', 'The sprint from security to boarding.');
    // The box is empty again: what was typed lives in the form now.
    expect(screen.getByLabelText('A new word, and what it means')).toHaveProp('value', '');
    await user.press(screen.getByRole('button', { name: 'noun' }));
    await user.press(screen.getByRole('button', { name: 'Kai' }));
    await user.type(screen.getByLabelText('Where it came from (if you know)'), 'Lisbon airport');
    await user.press(screen.getByRole('button', { name: 'Put it in the dictionary' }));
    await waitFor(() =>
      expect(addBoardEntry).toHaveBeenCalledWith(
        BOARD_ID,
        { clientId: 'client-1', kind: 'word', fields: { word: 'gate cardio', meaning: 'The sprint from security to boarding.', part: 'noun', coinedByMemberId: 'm-crew-2', origin: 'Lisbon airport', firstRecorded: null, seeAlso: null } },
        DAY,
      ),
    );
  });

  it('asks for the meaning when only the word was typed, and counts the writer as who coined it', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('A new word, and what it means'), 'hill tax');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByLabelText('The word')).toHaveProp('value', 'hill tax');
    expect(screen.getByRole('button', { name: 'Put it in the dictionary' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Nora' })).toBeSelected();
    await user.type(screen.getByLabelText('What it means'), 'What Lisbon charges for every nice view.');
    await user.press(screen.getByRole('button', { name: 'Put it in the dictionary' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, expect.objectContaining({ kind: 'word', fields: expect.objectContaining({ word: 'hill tax', meaning: 'What Lisbon charges for every nice view.', part: null, coinedByMemberId: 'm-crew-1' }) }), DAY));
  });

  it('keeps a photo with a word: it goes up first', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ uri: 'file:///gate.jpg', width: 800, height: 600 });
    jest.mocked(uploadPhoto).mockResolvedValue('media-1');
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('A new word, and what it means'), 'bag jail = Where the wine goes');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await user.press(screen.getByRole('button', { name: 'Add a photo' }));
    await user.press(screen.getByRole('button', { name: 'Put it in the dictionary' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, expect.objectContaining({ fields: expect.objectContaining({ word: 'bag jail', meaning: 'Where the wine goes', mediaId: 'media-1' }) }), DAY));
    expect(uploadPhoto).toHaveBeenCalledWith({ uri: 'file:///gate.jpg', width: 800, height: 600 });
  });

  it('opens a word, puts it right, and takes it out', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^the Ramiro incident, noun\./ }));
    expect(screen.getAllByText("We don't talk about the bill.")).toHaveLength(2);
    await user.press(screen.getByRole('button', { name: 'Change it' }));
    expect(screen.getByRole('header', { name: 'Change the word' })).toBeOnTheScreen();
    expect(screen.getByLabelText('The word')).toHaveProp('value', 'the Ramiro incident');
    expect(screen.getByRole('button', { name: 'Ana' })).toBeSelected();
    await user.clear(screen.getByLabelText('See also (another word)'));
    await user.type(screen.getByLabelText('What it means'), ' Ever.');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(changeBoardEntry).toHaveBeenCalledWith(
        'word-ramiro',
        { fields: { word: 'the Ramiro incident', meaning: "We don't talk about the bill. Ever.", part: 'noun', coinedByMemberId: 'm-crew-4', origin: null, firstRecorded: null, seeAlso: null } },
        DAY,
      ),
    );

    await user.press(screen.getByRole('button', { name: /^second breakfast, noun\./ }));
    await user.press(screen.getByRole('button', { name: 'Take it out' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('word-breakfast'));
  });

  it("says that saying a word out loud is the phone's own dictation", async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Say it out loud' }));
    expect(screen.getByText(/^Saying it out loud is the phone's own dictation/)).toBeOnTheScreen();
  });

  it('has no box and no way to change a word for someone who may only look', async () => {
    asked.mockReturnValue(loaded(wordsBoard(wordsView(), { canEdit: false })));
    await render(inApp(<Board />));
    expect(screen.queryByLabelText('A new word, and what it means')).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: /^doing a Kai, verb\./ }));
    expect(screen.queryByRole('button', { name: 'Change it' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Take it out' })).toBeNull();
  });

  it('says so when no word is written down yet', async () => {
    asked.mockReturnValue(loaded(wordsBoard(wordsView({ total: 0, words: [] }))));
    await render(inApp(<Board />));
    expect(screen.getAllByText('No words yet')).toHaveLength(2);
    expect(screen.getByText('Every crew has words nobody else understands. Write the first one down, with what it means.')).toBeOnTheScreen();
  });
});
