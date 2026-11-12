import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';

import { actOnBoard, addBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { pickPhoto, uploadPhoto } from '@/features/templates/media';
import { formatDay, formatWeekdayLong, timeAgo } from '@/lib/dates';
import { BOARD_ID } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded } from '@/test/samples';
import { storiesBoard, storiesView, storyWaiting } from '@/test/samples/keepsakes';

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

describe("15.5 Grandma's stories", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(storiesBoard()));
  });

  it("shows this week's question with its answer, what was told before, and what waits to go out", async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: "Astrid's stories" })).toBeOnTheScreen();
    expect(screen.getByText('One question a week · 14 told so far')).toBeOnTheScreen();
    expect(screen.getByText("This week's question")).toBeOnTheScreen();
    expect(screen.getByText('What was your very first job?')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play the answer to: What was your very first job?' })).toBeOnTheScreen();
    expect(screen.getByText('3:12')).toBeOnTheScreen();
    expect(screen.getByText(`Astrid answered ${timeAgo('2026-11-10T16:20:00')}, by talking.`)).toBeOnTheScreen();
    expect(screen.getByText('Already told')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'How did you meet Grandpa?. 4 min 40 s · typed out, with 3 photos' })).toBeOnTheScreen();
    expect(screen.getByText('2 min 5 s')).toBeOnTheScreen();
    expect(screen.getByText(`Mia's question · goes out on ${formatWeekdayLong('2026-11-15')}`)).toBeOnTheScreen();
    expect(screen.getByText("14 stories, in Astrid's words")).toBeOnTheScreen();
  });

  it('opens a story: the recording, the words where they were typed out, its photos, and one more photo', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ uri: 'file:///wedding.jpg', width: 800, height: 600 });
    jest.mocked(uploadPhoto).mockResolvedValue('media-photo');
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'photo-new', board: storiesBoard() });
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^How did you meet Grandpa\?/ }));
    expect(screen.getByText('At a dance in Kiruna.')).toBeOnTheScreen();
    expect(screen.getAllByLabelText('A photo for this story')).toHaveLength(3);
    await user.press(screen.getByRole('button', { name: 'Add a photo to the story' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'photo', fields: { questionId: 'story-grandpa', mediaId: 'media-photo' } }, DAY));
  });

  it('says that typing her words out needs a service that is not connected, and keeps her voice', async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'What was your very first job?. Open the story' }));
    expect(screen.getByText("Typing out Astrid's words needs a speech service, which isn't connected yet. The recording is kept as it is.")).toBeOnTheScreen();
  });

  it('gives the link of a question that waits for its answer: to send through the share sheet, or to copy', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    asked.mockReturnValue(loaded(storiesBoard(storiesView({ thisWeek: storyWaiting }))));
    await render(inApp(<Board />));
    expect(screen.getByText('homeport.app/s/abc123')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Copy the link' })).toBeOnTheScreen();
    expect(screen.getByText("The link is Astrid's alone. Tapping it opens a page to talk to: no app, nothing to type.")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Send it to Astrid' }));
    expect(share).toHaveBeenCalledWith({ message: 'Astrid, a question for you: What did winter look like when you were a child? Tap to answer by talking: https://homeport.app/s/abc123' });
    share.mockRestore();
  });

  it('says to copy the link where there is no share sheet', async () => {
    const share = jest.spyOn(Share, 'share').mockRejectedValue(new Error('no share sheet'));
    asked.mockReturnValue(loaded(storiesBoard(storiesView({ thisWeek: storyWaiting }))));
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Send it to Astrid' }));
    expect(await screen.findByText('This browser has no share sheet. Copy the link and send it yourself.')).toBeOnTheScreen();
    share.mockRestore();
  });

  it('sends a waiting question now', async () => {
    jest.mocked(actOnBoard).mockResolvedValue(storiesBoard());
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^Were you ever in trouble at school\?/ }));
    await user.press(screen.getByRole('button', { name: 'Send it now' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'send_now', body: { entryId: 'story-trouble' } }, DAY));
  });

  it('asks a question from More, for whoever in the circle it is from', async () => {
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'story-new', board: storiesBoard() });
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Ask a question' }));
    await user.type(screen.getByLabelText('The question'), 'What was your first pet?');
    await user.press(screen.getByRole('button', { name: 'Leo' }));
    await user.press(screen.getByRole('button', { name: 'Add it to the queue' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'question', fields: { text: 'What was your first pet?', askedByMemberId: 'm-leo' } }, DAY));
  });

  it('says plainly that the book and telling it elsewhere are still to come', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Book' }));
    expect(screen.getByText('Turning the stories into a book arrives with a later update of Homeport. Every story is kept until then.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'OK' }));
    await user.press(screen.getByRole('button', { name: 'Journey' }));
    expect(screen.getByText("Telling Astrid's stories as a journey in parts arrives when Homeport and Journey are linked.")).toBeOnTheScreen();
  });

  it('says so when no question is out yet, and shows one that was never answered', async () => {
    const never = { ...storyWaiting, id: 'story-never', goesOut: '2026-10-04' };
    asked.mockReturnValue(loaded(storiesBoard(storiesView({ told: 0, thisWeek: null, toldBefore: [], waiting: [], unanswered: [never] }))));
    await render(inApp(<Board />));
    expect(screen.getByText('No question is out yet')).toBeOnTheScreen();
    expect(screen.getByText(`Sent on ${formatDay('2026-10-04')} · no answer yet`)).toBeOnTheScreen();
    expect(screen.getByText("0 stories, in Astrid's words")).toBeOnTheScreen();
  });
});
