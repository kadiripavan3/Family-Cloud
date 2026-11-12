import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { addBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { uploadSound } from '@/features/templates/media';
import { pickSound, sound } from '@/features/templates/sound';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded } from '@/test/samples';
import { interviewBoard, interviewView } from '@/test/samples/keepsakes';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds, useCircles: () => [mockLinds], useCircleIfAny: () => mockLinds }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/features/templates/media', () => ({ pickPhoto: jest.fn(), uploadPhoto: jest.fn(), uploadSound: jest.fn() }));
jest.mock('@/features/templates/sound', () => ({ sound: { canAdd: false, canPlay: false }, pickSound: jest.fn(), playSound: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const mockLinds = linds;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };

describe('15.2 The birthday interview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sound.canAdd = false;
    asked.mockReturnValue(loaded(interviewBoard()));
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'a-new', board: interviewBoard() });
  });

  it('lines the answers up by age, marks the newest round, and says how far the next birthday is', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: "Mia's birthday interview" })).toBeOnTheScreen();
    expect(screen.getByText('Three questions, every 4 December')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seen by: Alex and you. Change who can see this' })).toBeOnTheScreen();
    expect(screen.getByText('A vet')).toBeOnTheScreen();
    expect(screen.getByText('A vet with a horse')).toBeOnTheScreen();
    expect(screen.getByText('A marine biologist. With a horse.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: "Play Mia's answer at 8" })).toBeOnTheScreen();
    expect(screen.getByText('Not asked yet')).toBeOnTheScreen();
    // The API's own line about the next birthday.
    expect(screen.getByText("Mia's 10th is in 23 days")).toBeOnTheScreen();
    expect(screen.getByText('The questions are ready')).toBeOnTheScreen();
  });

  it("writes this year's answer to a question", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'What makes you laugh the most?. Not asked yet. Answer it' }));
    expect(screen.getByRole('button', { name: 'Keep the answer' })).toBeDisabled();
    await user.type(screen.getByLabelText('What Mia says'), 'When Dad dances.');
    await user.press(screen.getByRole('button', { name: 'Keep the answer' }));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalled());
    expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'answer', fields: { questionId: 'q-laugh', text: 'When Dad dances.', mediaId: undefined } }, DAY);
  });

  it('keeps an answer in her own voice where a recording can be added, and says so where it cannot', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^What makes you laugh the most\?/ }));
    await user.press(screen.getByRole('button', { name: "Add Mia's voice" }));
    expect(screen.getByText(/^Recording with the microphone arrives with the phone app\./)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'OK' }));

    sound.canAdd = true;
    jest.mocked(pickSound).mockResolvedValue({ uri: 'blob:answer', contentType: 'audio/wav', seconds: 12, name: 'answer.wav' });
    jest.mocked(uploadSound).mockResolvedValue('media-voice');
    await user.press(screen.getByRole('button', { name: "Add Mia's voice" }));
    expect(await screen.findByText('Recording attached · 0:12')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Keep the answer' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'answer', fields: { questionId: 'q-laugh', text: undefined, mediaId: 'media-voice' } }, DAY));
  });

  it('"Get ready" lists the questions and adds another', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Get ready' }));
    expect(screen.getByRole('header', { name: 'The questions' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'What do you want to be?. Answered three times' })).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Add a question'), 'What scares you?');
    await user.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'question', fields: { text: 'What scares you?' } }, DAY));
  });

  it('has no bar when no birthday is known, and no way to answer for someone who may only look', async () => {
    asked.mockReturnValue(loaded(interviewBoard(interviewView({ next: null, birthday: null }), { canEdit: false, mine: false })));
    await render(inApp(<Board />));
    expect(screen.getByText('Three questions')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Get ready' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: /^What makes you laugh the most\?/ }));
    expect(screen.getByText('You can read the answers. Only the people it is shared with for editing can add one.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Keep the answer' })).toBeNull();
  });
});
