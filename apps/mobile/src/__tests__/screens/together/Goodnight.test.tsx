import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { completeUpload, deleteThing, loveGoodnight, sendGoodnight, startUpload, unloveGoodnight, useGetGoodnight } from '@/api/generated/homeport';
import { sendFile } from '@/api/transfer';
import Goodnight from '@/app/(app)/goodnight/[id]';
import { chooseClip, recordClip } from '@/features/journeyLink/goodnight/pickClip';
import { openFile } from '@/features/library/save';
import { inApp } from '@/test/phone';
import { coupleCircle, failed, linds, loaded, pending } from '@/test/samples';
import { goodnight, id, leoBrief, NIGHT, noraBrief } from '@/test/samples/together';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => false), dismissAll: jest.fn(), navigate: jest.fn() };
let mockParams = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000007' };
const mockCache = { goodnightLoved: jest.fn(), goodnightSent: jest.fn(() => Promise.resolve()), goodnightDeleted: jest.fn(() => Promise.resolve()) };
let mockCircles = [linds];
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, useIsFocused: () => true, Stack: { Screen: () => null } }));
jest.mock('@/auth/session', () => ({ useSession: () => ({ status: 'signedIn' }) }));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/circles/current', () => ({ useCircles: () => mockCircles, useCircleIfAny: () => mockCircles[0] }));
jest.mock('@/features/library/save', () => ({ openFile: jest.fn() }));
jest.mock('@/features/journeyLink/goodnight/pickClip', () => ({ chooseClip: jest.fn(), recordClip: jest.fn() }));
jest.mock('@/api/transfer', () => ({ sendFile: jest.fn(), removeFile: jest.fn() }));
jest.mock('@/api/generated/homeport', () => ({ useGetGoodnight: jest.fn(), loveGoodnight: jest.fn(), unloveGoodnight: jest.fn(), sendGoodnight: jest.fn(), deleteThing: jest.fn(), startUpload: jest.fn(), completeUpload: jest.fn() }));

const asked = jest.mocked(useGetGoodnight) as unknown as jest.Mock;
const play = jest.mocked(openFile);
const CLIP = { uri: 'file:///clip.mp4', name: 'clip.mp4', contentType: 'video/mp4', durationSeconds: 9 };

describe('10.9 Goodnight from far away', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: NIGHT };
    mockCircles = [linds];
    asked.mockReturnValue(loaded(goodnight()));
    play.mockResolvedValue(true);
    jest.mocked(startUpload).mockResolvedValue({ mediaId: id(30), uploadUrl: 'https://up.test/x', method: 'PUT', headers: {} });
    jest.mocked(sendFile).mockResolvedValue(200);
    jest.mocked(completeUpload).mockResolvedValue({} as never);
  });

  it('says who sent it and from where, what it is called, and that it is for the circle only', async () => {
    await render(inApp(<Goodnight />));
    expect(screen.getByText('Alex')).toBeOnTheScreen();
    expect(screen.getByText('Day 6 · Reine, Norway')).toBeOnTheScreen();
    expect(screen.getByText('Only for The Linds')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Goodnight, you two' })).toBeOnTheScreen();
    expect(screen.getByText("Recorded at 19:10 in Reine, Norway, for bedtime at home. It isn't part of the journey other people see.")).toBeOnTheScreen();
  });

  it('plays the clip, and says how long it is', async () => {
    await render(inApp(<Goodnight />));
    expect(screen.getByText('0:48 · tap to play')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Play the goodnight' }));
    expect(play).toHaveBeenCalledWith('https://img.test/clip.mp4');
  });

  it("says so when the clip can't be opened", async () => {
    play.mockResolvedValue(false);
    await render(inApp(<Goodnight />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Play the goodnight' }));
    expect(await screen.findByText("The clip couldn't be opened here.")).toBeOnTheScreen();
  });

  it("says who loved it, and gives a child's heart in a home with children", async () => {
    jest.mocked(loveGoodnight).mockResolvedValue(goodnight());
    await render(inApp(<Goodnight />));
    expect(screen.getByText('Leo loved it')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Leo loved it. Change' }));
    expect(screen.getByRole('header', { name: 'A heart from' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Leo' }).props['aria-checked']).toBe(true);
    await user.press(screen.getByRole('switch', { name: 'Mia' }));
    await waitFor(() => expect(loveGoodnight).toHaveBeenCalledWith(NIGHT, { as: 'm-mia' }));
    await waitFor(() => expect(mockCache.goodnightLoved).toHaveBeenCalledWith(goodnight()));
    await user.press(screen.getByRole('switch', { name: 'You' }));
    await waitFor(() => expect(loveGoodnight).toHaveBeenLastCalledWith(NIGHT, undefined));
  });

  it('counts the hearts on its small button once there are several, and says them all aloud', async () => {
    asked.mockReturnValue(loaded(goodnight({ lovedBy: [leoBrief, noraBrief], loved: true })));
    await render(inApp(<Goodnight />));
    expect(screen.getByText('2 loved it')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'You and Leo loved it. Change' })).toBeOnTheScreen();
  });

  it('gives and takes back the heart at once where nobody is without a phone', async () => {
    mockCircles = [{ ...coupleCircle, id: 'c-linds' }];
    asked.mockReturnValue(loaded(goodnight({ lovedBy: [], loved: false })));
    jest.mocked(loveGoodnight).mockResolvedValue(goodnight({ loved: true }));
    await render(inApp(<Goodnight />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Love it' }));
    await waitFor(() => expect(loveGoodnight).toHaveBeenCalledWith(NIGHT, undefined));
    expect(unloveGoodnight).not.toHaveBeenCalled();
  });

  it('sends one back: a chosen video goes up, then the goodnight in answer, for the circle', async () => {
    jest.mocked(chooseClip).mockResolvedValue(CLIP);
    const sent = goodnight({ id: id(31), replyTo: NIGHT, mine: true, title: 'Goodnight, Alex' });
    jest.mocked(sendGoodnight).mockResolvedValue(sent);
    await render(inApp(<Goodnight />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Send one back' }));
    expect(screen.getByText('A short clip for bedtime where they are. It goes to The Linds only, never to Journey.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Choose a video. From this device' }));
    await waitFor(() => expect(sendGoodnight).toHaveBeenCalledWith({ clientId: 'client-1', circleId: 'c-linds', mediaId: id(30), replyTo: NIGHT, title: 'Goodnight, Alex', recordedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/) }));
    expect(startUpload).toHaveBeenCalledWith({ kind: 'video', contentType: 'video/mp4', fileName: 'clip.mp4', durationSeconds: 9 });
    expect(sendFile).toHaveBeenCalledWith('file:///clip.mp4', expect.objectContaining({ uploadUrl: 'https://up.test/x' }), expect.any(Function));
    expect(completeUpload).toHaveBeenCalledWith(id(30));
    await waitFor(() => expect(mockCache.goodnightSent).toHaveBeenCalledWith(sent));
    expect(await screen.findByText('Sent. It waits for them at home.')).toBeOnTheScreen();
  });

  it('records one with the camera of a phone, and says so where there is none', async () => {
    jest.mocked(recordClip).mockResolvedValue('unavailable');
    await render(inApp(<Goodnight />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Send one back' }));
    await user.press(screen.getByRole('button', { name: 'Record one now. With the camera of this phone' }));
    expect(await screen.findByText('Recording needs the camera of a phone. In a browser, choose a video file instead.')).toBeOnTheScreen();
    expect(sendGoodnight).not.toHaveBeenCalled();
  });

  it('sends nothing when no video was chosen, and refuses a file that is no video', async () => {
    jest.mocked(chooseClip).mockResolvedValueOnce(null).mockResolvedValueOnce({ ...CLIP, contentType: 'application/pdf' });
    await render(inApp(<Goodnight />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Send one back' }));
    await user.press(screen.getByRole('button', { name: 'Choose a video. From this device' }));
    await user.press(screen.getByRole('button', { name: 'Send one back' }));
    await user.press(screen.getByRole('button', { name: 'Choose a video. From this device' }));
    expect(await screen.findByText("That isn't a video the app can keep. Choose an MP4, a MOV or a WebM.")).toBeOnTheScreen();
    expect(startUpload).not.toHaveBeenCalled();
  });

  it("says why the clip didn't go up", async () => {
    jest.mocked(chooseClip).mockResolvedValue(CLIP);
    jest.mocked(sendFile).mockResolvedValue(0);
    await render(inApp(<Goodnight />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Send one back' }));
    await user.press(screen.getByRole('button', { name: 'Choose a video. From this device' }));
    expect(await screen.findByText("A file couldn't be uploaded. Try again.")).toBeOnTheScreen();
    expect(sendGoodnight).not.toHaveBeenCalled();
  });

  it('leads to what was sent back, and from an answer to the goodnight it answers', async () => {
    asked.mockReturnValue(loaded(goodnight({ replies: [id(31), id(32)] })));
    await render(inApp(<Goodnight />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: '2 sent back' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'goodnight', id: id(32) } });
    asked.mockReturnValue(loaded(goodnight({ id: id(31), replyTo: NIGHT, mine: true, from: noraBrief, title: 'Goodnight, Alex', place: null, dayLabel: null })));
    await render(inApp(<Goodnight />));
    expect(screen.getByText("Recorded at 19:10, in answer. It isn't part of the journey other people see.")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'It answers another goodnight' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'goodnight', id: NIGHT } });
  });

  it('lets its sender delete it, after asking; nobody else is offered that', async () => {
    await render(inApp(<Goodnight />));
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    asked.mockReturnValue(loaded(goodnight({ mine: true })));
    jest.mocked(deleteThing).mockResolvedValue(undefined);
    await render(inApp(<Goodnight />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: 'Delete this goodnight' }));
    expect(screen.getByText('The clip goes for everyone in the circle.')).toBeOnTheScreen();
    expect(deleteThing).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Delete it' }));
    await waitFor(() => expect(deleteThing).toHaveBeenCalledWith(NIGHT));
    await waitFor(() => expect(mockCache.goodnightDeleted).toHaveBeenCalled());
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('keeps its Close while it loads, and closes', async () => {
    asked.mockReturnValue(pending());
    await render(inApp(<Goodnight />));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("says so when it isn't there, or isn't shared with this person", async () => {
    asked.mockReturnValue(failed(new ApiError(404, 'not_found', "That isn't there any more, or it isn't shared with you.")));
    await render(inApp(<Goodnight />));
    expect(screen.getByRole('header', { name: "This isn't available" })).toBeOnTheScreen();
  });

  it('is the "nothing at this address" page for an address that names no goodnight', async () => {
    mockParams = { id: 'whatever' };
    asked.mockReturnValue(pending());
    await render(inApp(<Goodnight />));
    expect(screen.getByRole('header', { name: "There's nothing at this address" })).toBeOnTheScreen();
  });
});
