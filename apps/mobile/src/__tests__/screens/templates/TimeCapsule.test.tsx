import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { actOnBoard, addBoardEntry, removeBoardEntry, useGetBoard } from '@/api/generated/homeport';
import Board from '@/app/(app)/board/[id]';
import { pickPhoto, uploadPhoto } from '@/features/templates/media';
import { formatDay } from '@/lib/dates';
import { BOARD_ID, mockBoardCache } from '@/test/boards';
import { inApp } from '@/test/phone';
import { linds, loaded } from '@/test/samples';
import { capsuleBoard, capsuleItem, capsuleView, picture } from '@/test/samples/templates';

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

describe('5.9 The time capsule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asked.mockReturnValue(loaded(capsuleBoard()));
    jest.mocked(addBoardEntry).mockResolvedValue({ entryId: 'item-new', board: capsuleBoard() });
  });

  it('shows how long until it opens and what is sealed inside, as closed envelopes', async () => {
    await render(inApp(<Board />));
    expect(screen.getByRole('header', { name: 'For Mia, on her 18th birthday' })).toBeOnTheScreen();
    expect(screen.getByText('Opens 4 December 2034 · 8 years to go')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar')).toHaveProp('accessibilityValue', { min: 0, max: 100, now: 55 });
    expect(screen.getByRole('button', { name: 'Seen by: Not Mia. Change who can see this' })).toBeOnTheScreen();
    expect(screen.getByText('Sealed inside')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: `A letter from Nora. 2 pages · sealed ${formatDay('2026-11-03')}. Sealed` })).toBeOnTheScreen();
    expect(screen.getByText('2 min 14 s')).toBeOnTheScreen();
    expect(screen.getByText('In her handwriting, with a photo')).toBeOnTheScreen();
    expect(screen.getByText('One a month, picked by the family')).toBeOnTheScreen();
    expect(screen.getByText('Sealed means sealed. You can add, but nobody can read it before the date.')).toBeOnTheScreen();
  });

  it('tells its own writer, too, that a sealed letter cannot be read before the day', async () => {
    await render(inApp(<Board />));
    await userEvent.setup().press(screen.getByRole('button', { name: /^A letter from Nora/ }));
    expect(screen.getByText('Sealed means sealed. It opens on 4 December 2034, and nobody can read it before then.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Seal it in' })).toBeNull();
  });

  it('adds a letter and seals it at once', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add to the capsule' }));
    expect(screen.getByRole('radio', { name: 'Letter' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Seal it in' })).toBeDisabled();
    await user.type(screen.getByLabelText('Your letter'), 'Dear Mia, today you lost a tooth.');
    await user.press(screen.getByRole('button', { name: 'Seal it in' }));
    await waitFor(() => expect(mockBoardCache.boardSaved).toHaveBeenCalled());
    expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'letter', fields: { text: 'Dear Mia, today you lost a tooth.', seal: true } }, DAY);
  });

  it('keeps a letter as a draft, which only its writer sees and can still seal or throw away', async () => {
    const draft = capsuleItem({ id: 'item-draft', title: 'A letter from Nora', draft: true, sealed: false, sealedAt: null, text: 'Dear Mia, a first try.' });
    asked.mockReturnValue(loaded(capsuleBoard(capsuleView({ items: [draft] }))));
    jest.mocked(actOnBoard).mockResolvedValue(capsuleBoard());
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add to the capsule' }));
    await user.type(screen.getByLabelText('Your letter'), 'Another one.');
    await user.press(screen.getByRole('button', { name: 'Keep it as a draft' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'letter', fields: { text: 'Another one.', seal: false } }, DAY));

    expect(screen.getByText('Draft · only you can see it')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'A letter from Nora. Draft · only you can see it' }));
    expect(screen.getByText('Dear Mia, a first try.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Seal it in' }));
    await waitFor(() => expect(actOnBoard).toHaveBeenCalledWith(BOARD_ID, { verb: 'seal', body: { entryId: 'item-draft' } }, DAY));
  });

  it('throws a draft away', async () => {
    const draft = capsuleItem({ id: 'item-draft', draft: true, sealed: false, sealedAt: null, text: 'Dear Mia, a first try.' });
    asked.mockReturnValue(loaded(capsuleBoard(capsuleView({ items: [draft] }))));
    jest.mocked(removeBoardEntry).mockResolvedValue(undefined as never);
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /^A letter from Nora/ }));
    await user.press(screen.getByRole('button', { name: 'Throw the draft away' }));
    await waitFor(() => expect(removeBoardEntry).toHaveBeenCalledWith('item-draft'));
  });

  it('adds a photo: it goes up first, then into the capsule with its line', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ uri: 'file:///recipe.jpg', width: 800, height: 600 });
    jest.mocked(uploadPhoto).mockResolvedValue('media-1');
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add to the capsule' }));
    await user.press(screen.getByRole('radio', { name: 'Photo' }));
    expect(screen.getByRole('button', { name: 'Seal it in' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Choose a photo' }));
    await user.type(screen.getByLabelText('A line for the outside'), 'In her handwriting');
    await user.press(screen.getByRole('button', { name: 'Seal it in' }));
    await waitFor(() => expect(addBoardEntry).toHaveBeenCalledWith(BOARD_ID, { clientId: 'client-1', kind: 'photo', fields: { mediaId: 'media-1', note: 'In her handwriting', seal: true } }, DAY));
    expect(uploadPhoto).toHaveBeenCalledWith({ uri: 'file:///recipe.jpg', width: 800, height: 600 });
  });

  it('says on a phone that recording arrives with the phone app', async () => {
    await render(inApp(<Board />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add to the capsule' }));
    await user.press(screen.getByRole('radio', { name: 'Voice' }));
    await user.press(screen.getByRole('button', { name: 'Add a recording' }));
    expect(screen.getByText(/^Recording with the microphone arrives with the phone app\./)).toBeOnTheScreen();
  });

  it('shows what is inside once it has opened, and takes nothing more', async () => {
    const opened = capsuleView({ open: true, openForYou: true, daysToGo: 0, progress: 100, items: [capsuleItem({ sealed: false, text: 'Dear Mia, you are eighteen.' }), capsuleItem({ id: 'item-photo', kind: 'photo', title: 'A photo from Alex', pages: null, sealed: false, media: picture() })] });
    asked.mockReturnValue(loaded(capsuleBoard(opened)));
    await render(inApp(<Board />));
    expect(screen.getByText('Opened on 4 December 2034')).toBeOnTheScreen();
    expect(screen.getByText('Inside')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add to the capsule' })).toBeNull();
    expect(screen.getByText('It opened on 4 December 2034. Everything inside is there to read and keep.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: /^A letter from Nora/ }));
    expect(screen.getByText('Dear Mia, you are eighteen.')).toBeOnTheScreen();
  });

  it('says an empty capsule is empty, and offers no Add to someone who may only look', async () => {
    asked.mockReturnValue(loaded(capsuleBoard(capsuleView({ items: [], sealedInside: 0 }), { canEdit: false, mine: false })));
    await render(inApp(<Board />));
    expect(screen.getByText('Nothing inside yet. A letter is a good first thing.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add to the capsule' })).toBeNull();
  });
});
