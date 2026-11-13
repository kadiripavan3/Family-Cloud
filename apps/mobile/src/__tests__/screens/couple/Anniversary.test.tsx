import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addBoardEntry, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { AnniversarySetup } from '@/features/couple/anniversary/AnniversarySetup';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { coupleCircle, loaded } from '@/test/samples';
import { alex2, anniversaryBoard, anniversaryView } from '@/test/samples/couple';
import { inWords } from '@/words/en/couple';

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
const next = anniversaryView().next;

describe('17.5 The anniversary questions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(anniversaryBoard()));
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'answer-new', board: anniversaryBoard() });
  });

  it('shows the year that has opened: every question with both answers side by side, and the word they share', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: '14 July 2026' })).toBeOnTheScreen();
    expect(screen.getByText('Year twelve')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'The best day of this year?' })).toBeOnTheScreen();
    expect(screen.getByLabelText('You: The canoe at Bled, when Mia steered.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Alex: Bled. Obviously Bled.')).toBeOnTheScreen();
    expect(screen.getByText('You both said Bled')).toBeOnTheScreen();
    expect(screen.getByText("Remembering my mother's birthday. Every year.")).toBeOnTheScreen();
  });

  it('says when the year being written opens, how far yours are, and whether the other one has finished: never their words', async () => {
    await render(inApp(<Board />));
    expect(screen.getByText('Year thirteen opens on 14 July')).toBeOnTheScreen();
    expect(screen.getByText("You've answered 2 of 3. Alex's are sealed.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Write mine' })).toBeOnTheScreen();
  });

  it.each([
    [{ youAreDone: true, answered: 3 }, "Yours are sealed. So are Alex's.", 'Change mine'],
    [{ answered: 0 }, "Yours aren't written yet. Alex's are sealed.", 'Write mine'],
    [{ youAreDone: true, answered: 3, others: [{ person: alex2, done: false }] }, "Yours are sealed. Alex hasn't finished.", 'Change mine'],
  ])('words the bar by where both stand', async (over, line, button) => {
    asked.mockReturnValue(loaded(anniversaryBoard(anniversaryView({ next: { ...next, ...over } }))));
    await render(inApp(<Board />));
    expect(screen.getByText(line)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: button })).toBeOnTheScreen();
  });

  it('says a year opens once both have answered, when its day has come', async () => {
    asked.mockReturnValue(loaded(anniversaryBoard(anniversaryView({ next: { ...next, dayHasCome: true, daysToGo: 0 } }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Year thirteen opens when you have both answered')).toBeOnTheScreen();
  });

  it('writes this year’s answers: what was typed or reworded is sent, question by question', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Write mine' }));
    expect(screen.getByText('Year thirteen, yours')).toBeOnTheScreen();
    expect(screen.getByText("Alex can't read yours until the year opens, and you can't read theirs. Until then you can change yours; once it has opened, every answer stays as it is.")).toBeOnTheScreen();
    expect(screen.getByLabelText('The best day of this year?')).toHaveDisplayValue('The first snow, and nobody had gloves.');
    expect(screen.getByRole('button', { name: 'Seal my answers' })).toBeDisabled();
    await user.type(screen.getByLabelText('What did I not thank you for?'), 'The glove box.');
    await user.press(screen.getByRole('button', { name: 'Seal my answers' }));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalled());
    expect(jest.mocked(addBoardEntry).mock.calls).toEqual([[BOARD_ID, { clientId: 'client-1', kind: 'answer', fields: { questionId: 'q-thank', text: 'The glove box.' } }, DAY]]);
  });

  it('takes an answer out again when it is emptied', async () => {
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Write mine' }));
    await user.clear(screen.getByLabelText('What should we do more of?'));
    await user.press(screen.getByRole('button', { name: 'Seal my answers' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('a-more'));
    expect(addBoardEntry).not.toHaveBeenCalled();
  });

  it("says in the API's words why an answer was not taken", async () => {
    jest.mocked(addBoardEntry).mockRejectedValue(new ApiError(409, 'opened', 'That year has been opened. Its answers stay as they are.'));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Write mine' }));
    await user.type(screen.getByLabelText('What did I not thank you for?'), 'Too late.');
    await user.press(screen.getByRole('button', { name: 'Seal my answers' }));
    expect(await screen.findByText('That year has been opened. Its answers stay as they are.')).toBeOnTheScreen();
  });

  it('adds a question from More, asked from the year that is being written', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: /^Add a question/ }));
    expect(screen.getByText('Everyone answers it from year thirteen on. The years that have opened stay as they are.')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('The question'), 'What surprised you?');
    await user.press(screen.getByRole('button', { name: 'Add the question' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'question', fields: { text: 'What surprised you?' } }, DAY));
  });

  it('shows another year that has opened when there is more than one', async () => {
    asked.mockReturnValue(loaded(anniversaryBoard(anniversaryView({ years: [12, 11] }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('button', { name: 'Year twelve' })).toBeSelected();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Year eleven' }));
    expect(asked).toHaveBeenLastCalledWith(BOARD_ID, { day: '2026-11-12', show: '11' }, expect.anything());
  });

  it('says nothing has opened yet before the first anniversary, and lets someone who does not answer only look', async () => {
    asked.mockReturnValue(loaded(anniversaryBoard(anniversaryView({ years: [], shown: null, youAnswer: false }), { canEdit: false, mine: false })));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Nothing has opened yet' })).toBeOnTheScreen();
    expect(screen.getByText('You each answer the same questions, apart. They open side by side on 14 July, once everyone has answered.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Write mine' })).toBeNull();
    expect(screen.getByText("Alex's are sealed.")).toBeOnTheScreen();
  });

  it('writes a number of years out the way an anniversary is said', () => {
    expect([1, 12, 13, 20, 31, 99, 100].map(inWords)).toEqual(['one', 'twelve', 'thirteen', 'twenty', 'thirty-one', 'ninety-nine', '100']);
  });
});

describe('17.5 The anniversary questions, before they start', () => {
  it('needs the day it all began, and hands it over as the board’s setting', async () => {
    const onChange = jest.fn();
    await render(inApp(<AnniversarySetup circle={coupleCircle} onChange={onChange} />));
    expect(onChange).toHaveBeenLastCalledWith(null);
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'The day it all began: Choose a day. Change' }));
    await user.press(screen.getByRole('button', { name: '5 November 2026' }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ settings: { since: '2026-11-05' } }));
  });
});
