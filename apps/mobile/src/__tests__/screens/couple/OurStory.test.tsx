import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addBoardEntry, changeBoard, changeBoardEntry, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { whenOf } from '@/features/couple/our-story/OurStory';
import { pickPhoto, uploadPhoto } from '@/features/templates/media';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { coupleCircle, loaded } from '@/test/samples';
import { storyBoard, storyView } from '@/test/samples/couple';

jest.mock('expo-router', () => jest.requireActual('@/test/boards').mockBoardRouter());
jest.mock('@/api/cache', () => ({ useCache: () => jest.requireActual('@/test/boards').mockBoardCache }));
jest.mock('@/api/generated/homeport', () => jest.requireActual('@/test/boards').mockBoardApi());
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockCircle, useCircles: () => [mockCircle], useCircleIfAny: () => mockCircle }));
jest.mock('@/features/sharing/AudienceSheet', () => ({ AudienceSheet: () => null }));
jest.mock('@/features/templates/media', () => ({ pickPhoto: jest.fn(), uploadPhoto: jest.fn(), uploadSound: jest.fn() }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), today: () => '2026-11-12' }));

const mockCircle = coupleCircle;
const asked = jest.mocked(useGetBoard) as unknown as jest.Mock;
const DAY = { day: '2026-11-12' };

describe('17.3 Our story', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(storyBoard()));
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'moment-new', board: storyBoard() });
    jest.mocked(changeBoardEntry).mockResolvedValue(storyBoard());
  });

  it('counts the days and shows the firsts in order, each with as much of its date as is known', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'Our story' })).toBeOnTheScreen();
    expect(screen.getByText('4,503 days so far')).toBeOnTheScreen();
    expect(screen.getAllByRole('button').map((one) => one.props.accessibilityLabel).filter((label: string) => /\d{4}\./.test(label))).toEqual([
      '14 July 2014. Piran. We met. A milestone',
      'August 2015. First trip. Mallorca by kayak',
      'March 2016. First flat. The keys to Trubarjeva',
      '4 December 2016. Mia. Three of us. A milestone',
    ]);
    expect(screen.getByText("At Jana's wedding. You asked if the seat was taken. It was, by your coat.")).toBeOnTheScreen();
    expect(screen.getByText('A journey you kept · 9 days, 212 photos')).toBeOnTheScreen();
  });

  it('writes a date as a day, a month or only a year', () => {
    expect(whenOf('2014-07-14', 'day')).toBe('14 July 2014');
    expect(whenOf('2015-08-01', 'month')).toBe('August 2015');
    expect(whenOf('2015-01-01', 'year')).toBe('2015');
  });

  it('adds a moment of which only the month is known, with a star', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add a moment' }));
    expect(screen.getByRole('button', { name: 'Add it to the story' })).toBeDisabled();
    await user.type(screen.getByLabelText('What happened'), 'The first garden');
    await user.press(screen.getByRole('radio', { name: 'The month' }));
    await user.type(screen.getByLabelText('A word beside the date'), 'Tomatoes');
    await user.press(screen.getByRole('switch', { name: 'A milestone' }));
    await user.press(screen.getByRole('button', { name: 'Add it to the story' }));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalled());
    expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'moment', fields: { title: 'The first garden', day: '2026-11-12', precision: 'month', label: 'Tomatoes', text: '', star: true, mediaId: undefined } }, DAY);
  });

  it('changes a moment, and one more photo for it goes up first and is added as its own entry', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ uri: 'file:///bench.jpg', width: 800, height: 600 });
    jest.mocked(uploadPhoto).mockResolvedValue('media-1');
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^14 July 2014\. Piran\. We met/ }));
    expect(screen.getByText('Change this moment')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('What happened'), ', at last');
    await user.press(screen.getByRole('button', { name: 'Add another photo' }));
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'photo', fields: { momentId: 'moment-met', mediaId: 'media-1' } }, DAY));
    expect(changeBoardEntry).toHaveBeenCalledWith('moment-met', { fields: { title: 'We met, at last', day: '2014-07-14', precision: 'day', label: 'Piran', text: "At Jana's wedding. You asked if the seat was taken. It was, by your coat.", star: true } }, DAY);
    expect(uploadPhoto).toHaveBeenCalledWith({ uri: 'file:///bench.jpg', width: 800, height: 600 });
  });

  it('takes a moment out of the story', async () => {
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^March 2016\. First flat/ }));
    await user.press(screen.getByRole('button', { name: 'Take it out of the story' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('moment-flat'));
  });

  it('sets the day the count starts from, and what it began with, from More', async () => {
    jest.mocked(changeBoard).mockResolvedValue(storyBoard());
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More' }));
    await user.press(screen.getByRole('button', { name: /^When it began/ }));
    expect(screen.getByRole('button', { name: 'The day it began: 14 July 2014. Change' })).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('What it began with'));
    await user.type(screen.getByLabelText('What it began with'), 'a seat that was taken');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(changeBoard).toHaveBeenCalledWith(BOARD_ID, { title: undefined, settings: { since: '2014-07-14', sinceWords: 'a seat that was taken' } }, DAY));
  });

  it('says why a change did not arrive', async () => {
    jest.mocked(changeBoardEntry).mockRejectedValue(new ApiError(409, 'gone', 'Someone took this moment out a moment ago.'));
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^4 December 2016/ }));
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Someone took this moment out a moment ago.')).toBeOnTheScreen();
    expect(mockBoardCache.boardSaved).not.toHaveBeenCalled();
  });

  it('opens on a friendly page while there are no moments, with a way to add the first', async () => {
    asked.mockReturnValue(loaded(storyBoard(storyView({ since: null, days: null, sinceWords: null, count: 0, moments: [] }))));
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'The firsts, in order' })).toBeOnTheScreen();
    expect(screen.queryByText(/days so far/)).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add the first moment' }));
    expect(screen.getByLabelText('What happened')).toBeOnTheScreen();
  });

  it('lets someone who may only look read a moment, and offers them nothing to change', async () => {
    asked.mockReturnValue(loaded(storyBoard(storyView(), { canEdit: false, mine: false })));
    await render(inApp(<Board />));
    expect(screen.queryByRole('button', { name: 'Add a moment' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: /^14 July 2014/ }));
    expect(screen.getByText('14 July 2014 · Piran')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Take it out of the story' })).toBeNull();
  });
});
