import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { actOnBoard, addBoardEntry, changeBoardEntry, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { formatDay, toISODate } from '@/lib/dates';
import { BOARD_ID } from '@/test/boards';
import { inApp } from '@/test/phone';
import { crewCircle, loaded } from '@/test/samples';
import { anaBrief, draftAboutKai, kaiBrief, predictionsBoard, predictionsOpened, predictionsView } from '@/test/samples/crew';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockCrew, useCircles: () => [mockCrew], useCircleIfAny: () => mockCrew }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-11' }));

const mockCrew = { ...crewCircle, myMemberId: 'm-crew-1' };
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-11' };
/** The day the sample predictions were sealed, as this phone's clock has it. */
const SEALED = formatDay(toISODate(new Date('2026-11-10T19:50:00Z')));

/** Nora with all four written, one of them still a draft about Kai. */
function withDraft() {
  const view = predictionsView();
  return predictionsView({ writers: view.writers.map((one) => (one.you ? { ...one, written: 4, drafts: 1, stillAbout: [] } : one)), items: [...view.items, draftAboutKai] });
}

describe('19.7 Predictions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(predictionsBoard()));
    jest.mocked(actOnBoard).mockResolvedValue(predictionsBoard());
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'p-new', board: predictionsBoard() });
    jest.mocked(changeBoardEntry).mockResolvedValue(predictionsBoard());
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
  });

  it('shows who has written how many, the reader last, and what is still to write', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Predictions for 2031' })).toBeOnTheScreen();
    expect(screen.getByText('Sealed until the reunion on 4 October 2031')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Seen by: / })).toBeOnTheScreen();
    // Whoever has written most stands first; the API's own order had Nora second and Kai third.
    expect(screen.getAllByText(/has written|hasn't started|You've written/).map((line) => line.props.children)).toEqual(['Lea has written all four', 'Lena has written all four', 'Ana has written two', "Kai hasn't started", "You've written three"]);
    expect(screen.getAllByText('One about each of you')).toHaveLength(1);
    expect(screen.getByText('One to go: about Kai')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Write the last one' })).toBeOnTheScreen();
    expect(screen.getByText('Nobody can read any of them before the day. Not even their own, once sealed.')).toBeOnTheScreen();
  });

  it("tells whoever presses someone's row that theirs are sealed, and nothing more", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Lea has written all four. Sealed' }));
    expect(screen.getByRole('header', { name: "Lea's predictions" })).toBeOnTheScreen();
    expect(screen.getByText('Sealed until 4 October 2031. Nobody can read them before then, Lea included.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'OK' }));
    await user.press(screen.getByRole('button', { name: "Kai hasn't started" }));
    expect(screen.getByText("Kai hasn't written any yet.")).toBeOnTheScreen();
  });

  it('writes the one that is missing and seals it at once', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Write the last one' }));
    expect(screen.getByRole('header', { name: 'A prediction' })).toBeOnTheScreen();
    expect(screen.getByText('What will be true of them on 4 October 2031? One about each of the others.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seal it' })).toBeDisabled();
    await user.type(screen.getByLabelText('Your prediction about Kai'), 'Still late. Still forgiven.');
    await user.press(screen.getByRole('button', { name: 'Seal it' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'prediction', fields: { aboutMemberId: kaiBrief.memberId, text: 'Still late. Still forgiven.', seal: true } }, DAY));
  });

  it('asks who it is about when more than one is missing, and keeps one as a draft', async () => {
    const view = predictionsView();
    asked.mockReturnValue(loaded(predictionsBoard(predictionsView({ writers: view.writers.map((one) => (one.you ? { ...one, written: 2, stillAbout: [kaiBrief, anaBrief] } : one)) }))));
    await render(inApp(<Board />));
    expect(screen.getByText('Two to go: about Kai and Ana')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Write the next one' }));
    expect(screen.getByText('Who is it about?')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Ana' }));
    await user.type(screen.getByLabelText('Your prediction about Ana'), 'Runs the bakery.');
    await user.press(screen.getByRole('button', { name: 'Keep it as a draft' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'prediction', fields: { aboutMemberId: anaBrief.memberId, text: 'Runs the bakery.', seal: false } }, DAY));
  });

  it("shows this person's own as envelopes without their words, and takes one out unread", async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "You've written three. One to go: about Kai. See your own" }));
    expect(screen.getByRole('header', { name: 'Your predictions' })).toBeOnTheScreen();
    expect(screen.getAllByText(`Sealed on ${SEALED}`)).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Write one about Kai' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: `About Lena. Sealed on ${SEALED}` }));
    expect(screen.getByText(`Sealed on ${SEALED}. It opens on 4 October 2031, and nobody can read it before then. You can still take it out, unread.`)).toBeOnTheScreen();
    // Sealed means there is nothing to read or to change, for its writer too.
    expect(screen.queryByLabelText(/^Your prediction/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Seal it' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Take it out, unread' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('p-nora-lena'));
  });

  it('seals the drafts with the big button once there is nothing left to write', async () => {
    asked.mockReturnValue(loaded(predictionsBoard(withDraft())));
    await render(inApp(<Board />));
    expect(screen.getByText("You've written all four")).toBeOnTheScreen();
    expect(screen.getByText('One is still a draft')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Write/ })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Seal your draft' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'seal', body: {} }, DAY));
  });

  it('lets a draft be changed, sealed or deleted by its writer', async () => {
    asked.mockReturnValue(loaded(predictionsBoard(withDraft())));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^You've written all four/ }));
    await user.press(screen.getByRole('button', { name: 'About Kai. Draft · only you can see it' }));
    expect(screen.getByText('A draft. Only you can see it until you seal it.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Your prediction about Kai')).toHaveProp('value', 'Still late. Still forgiven.');
    expect(screen.getByRole('button', { name: 'Save the draft' })).toBeDisabled();
    await user.type(screen.getByLabelText('Your prediction about Kai'), ' Mostly.');
    await user.press(screen.getByRole('button', { name: 'Save the draft' }));
    await waitFor(() => expect(changeBoardEntry).toHaveBeenCalledWith('p-draft', { fields: { text: 'Still late. Still forgiven. Mostly.', seal: false } }, DAY));

    await user.press(screen.getByRole('button', { name: 'About Kai. Draft · only you can see it' }));
    await user.press(screen.getByRole('button', { name: 'Seal it' }));
    await waitFor(() => expect(changeBoardEntry).toHaveBeenLastCalledWith('p-draft', { fields: { text: 'Still late. Still forgiven.', seal: true } }, DAY));

    await user.press(screen.getByRole('button', { name: 'About Kai. Draft · only you can see it' }));
    await user.press(screen.getByRole('button', { name: 'Delete the draft' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('p-draft'));
  });

  it('says why when the API refuses a prediction', async () => {
    jest.mocked(addBoardEntry).mockRejectedValue(new ApiError(409, 'written_already', "You've already written one about Kai. One each is all there is."));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Write the last one' }));
    await user.type(screen.getByLabelText('Your prediction about Kai'), 'Again.');
    await user.press(screen.getByRole('button', { name: 'Seal it' }));
    expect(await screen.findByText("You've already written one about Kai. One each is all there is.")).toBeOnTheScreen();
  });

  it('has no button when everything is written and sealed', async () => {
    const view = predictionsView();
    asked.mockReturnValue(loaded(predictionsBoard(predictionsView({ writers: view.writers.map((one) => (one.you ? { ...one, written: 4, stillAbout: [] } : one)) }))));
    await render(inApp(<Board />));
    expect(screen.queryByRole('button', { name: /^Write|^Seal/ })).toBeNull();
    expect(screen.getByText('Nobody can read any of them before the day. Not even their own, once sealed.')).toBeOnTheScreen();
  });

  it('opens them all on the day, under who each is about, and lets the others say who was right', async () => {
    asked.mockReturnValue(loaded(predictionsBoard(predictionsOpened)));
    await render(inApp(<Board />));
    expect(screen.getByText('Opened at the reunion, 4 October 2031')).toBeOnTheScreen();
    expect(screen.getByText('About Kai')).toBeOnTheScreen();
    expect(screen.getByText('About Lea')).toBeOnTheScreen();
    expect(screen.getByText('Still late. Now with a child who is also late.')).toBeOnTheScreen();
    expect(screen.getByText("Lea wrote this · 2 said it came true, 1 said it didn't")).toBeOnTheScreen();
    expect(screen.getByText('Lena wrote this · nobody has said yet')).toBeOnTheScreen();
    expect(screen.getByText("You wrote this · 3 said it came true, 0 said it didn't")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Write/ })).toBeNull();
    // Nobody marks their own: two of the three can be marked.
    expect(screen.getAllByRole('button', { name: /prediction came true$/ })).toHaveLength(2);

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: "Lena's prediction didn't come true" }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'mark', body: { predictionId: 'p-lena-kai', right: false } }, DAY));
    // Pressing what was said already takes it back.
    expect(screen.getByRole('button', { name: "Lea's prediction came true" })).toBeSelected();
    await user.press(screen.getByRole('button', { name: "Lea's prediction came true" }));
    await waitFor(() => expect(actOnBoard).toHaveBeenLastCalledWith(BOARD_ID, { verb: 'mark', body: { predictionId: 'p-lea-kai', right: null } }, DAY));
  });
});
