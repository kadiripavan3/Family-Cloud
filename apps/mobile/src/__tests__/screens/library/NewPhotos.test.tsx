import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/fetcher';
import { addToLibrary, checkLibrary, completeUpload, startUpload } from '@/api/generated/homeport';
import { sendFile } from '@/api/transfer';
import NewPhotos from '@/app/(app)/new/photos';
import { bytesOf, pickForLibrary, stillOf } from '@/features/library/adding/pick';
import type { Picked } from '@/features/library/adding/picked';
import { inApp } from '@/test/phone';
import { linds } from '@/test/samples';
import { id, photo } from '@/test/samples/library';

const mockRouter = { push: jest.fn(), dismissTo: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: { audience?: string } = {};
let mockGuardOn = false;
let mockIds = 0;
const mockCache = { libraryAdded: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  usePreventRemove: (on: boolean) => {
    mockGuardOn = on;
    return jest.fn();
  },
}));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => `client-${(mockIds += 1)}` }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/features/library/adding/pick', () => ({ pickForLibrary: jest.fn(), bytesOf: jest.fn(), stillOf: jest.fn() }));
jest.mock('@/api/transfer', () => ({ sendFile: jest.fn(), removeFile: jest.fn() }));
// A file's fingerprint here is its first byte, sixty-four times over: two files differ when their first bytes do.
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digest: jest.fn(async (_how: string, bytes: Uint8Array) => new Uint8Array(32).fill(bytes[0]!).buffer) }));
jest.mock('@/api/generated/homeport', () => ({ checkLibrary: jest.fn(), startUpload: jest.fn(), completeUpload: jest.fn(), addToLibrary: jest.fn() }));

const mockLinds = linds;
const hash = (byte: number) => byte.toString(16).padStart(2, '0').repeat(32);
const picked = (name: string, over: Partial<Picked> = {}): Picked => ({ uri: `blob:${name}`, name, contentType: 'image/jpeg', kind: 'photo', bytes: 2048, takenAt: '2026-11-12T10:00:00+01:00', ...over });
const lake = picked('lake.jpg');
const hill = picked('hill.jpg');

describe('/new/photos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockIds = 0;
    jest.mocked(bytesOf).mockImplementation(async (file) => new Uint8Array([file.name === 'lake.jpg' ? 1 : file.name === 'hill.jpg' ? 2 : 3]));
    jest.mocked(stillOf).mockResolvedValue(null);
    jest.mocked(checkLibrary).mockResolvedValue({ known: [] });
    jest.mocked(startUpload).mockImplementation(async () => ({ mediaId: `media-${jest.mocked(startUpload).mock.calls.length}`, uploadUrl: 'https://up.test/put', method: 'PUT', headers: {} }));
    jest.mocked(sendFile).mockResolvedValue(200);
    jest.mocked(completeUpload).mockResolvedValue(undefined);
  });

  it('says where the photos go and who will see them, before anything is chosen', async () => {
    await render(inApp(<NewPhotos />));
    expect(screen.getByRole('header', { name: 'Add photos' })).toBeOnTheScreen();
    expect(screen.getByText('Choose photos or a video from this device. They go into The Linds, at full size.')).toBeOnTheScreen();
    // In a family a new thing is only yours until it is shared.
    expect(screen.getByRole('button', { name: 'Seen by Only you. Change' })).toBeOnTheScreen();
    expect(mockGuardOn).toBe(false);
  });

  it('takes the fingerprint of each file, asks which are there already, sends the rest at full size and adds them', async () => {
    jest.mocked(pickForLibrary).mockResolvedValue([lake, hill]);
    jest.mocked(addToLibrary).mockResolvedValue({
      items: [
        { clientId: 'client-1', item: photo({ id: id(91) }), alreadyThere: false },
        { clientId: 'client-2', item: photo({ id: id(92) }), alreadyThere: false },
      ],
    });
    await render(inApp(<NewPhotos />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Choose photos or a video' }));
    await waitFor(() => expect(screen.getByText('2 added.')).toBeOnTheScreen());

    expect(checkLibrary).toHaveBeenCalledWith({ circleId: 'c-linds', hashes: [hash(1), hash(2)] });
    expect(startUpload).toHaveBeenCalledWith({ kind: 'photo', contentType: 'image/jpeg', fileName: 'lake.jpg', durationSeconds: undefined, keepOriginal: true });
    expect(sendFile).toHaveBeenCalledWith('blob:lake.jpg', expect.objectContaining({ uploadUrl: 'https://up.test/put' }), expect.any(Function));
    expect(completeUpload).toHaveBeenCalledWith('media-1');
    expect(addToLibrary).toHaveBeenCalledWith({
      circleId: 'c-linds',
      items: [
        { clientId: 'client-1', mediaId: 'media-1', contentHash: hash(1), takenAt: '2026-11-12T10:00:00+01:00', lat: undefined, lng: undefined, posterMediaId: undefined, audience: 'me' },
        { clientId: 'client-2', mediaId: 'media-2', contentHash: hash(2), takenAt: '2026-11-12T10:00:00+01:00', lat: undefined, lng: undefined, posterMediaId: undefined, audience: 'me' },
      ],
    });
    expect(mockCache.libraryAdded).toHaveBeenCalledWith('c-linds');
    expect(screen.getByText('lake.jpg')).toBeOnTheScreen();
    expect(screen.getAllByText('Added')).toHaveLength(2);

    // From here to the wall, or to one of them.
    await user.press(screen.getByRole('button', { name: 'See them on the wall' }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/', params: { place: 'library' } });
    await user.press(screen.getByRole('button', { name: 'Open lake.jpg' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'photo', id: id(91), moment: id(91) } });
  });

  it('does not send a file the Library has already, and says it is there', async () => {
    jest.mocked(pickForLibrary).mockResolvedValue([lake, hill]);
    jest.mocked(checkLibrary).mockResolvedValue({ known: [{ hash: hash(1), id: id(91) }] });
    jest.mocked(addToLibrary).mockResolvedValue({ items: [{ clientId: 'client-2', item: photo({ id: id(92) }), alreadyThere: false }] });
    await render(inApp(<NewPhotos />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Choose photos or a video' }));
    await waitFor(() => expect(screen.getByText('1 added. 1 was already in your Library.')).toBeOnTheScreen());
    expect(screen.getByText('Already in your Library')).toBeOnTheScreen();
    expect(startUpload).toHaveBeenCalledTimes(1);
    expect(startUpload).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'hill.jpg' }));
  });

  it('believes the API when it says a file was there after all, and adds nothing to the lists', async () => {
    jest.mocked(pickForLibrary).mockResolvedValue([lake]);
    jest.mocked(addToLibrary).mockResolvedValue({ items: [{ clientId: 'client-1', item: photo({ id: id(91) }), alreadyThere: true }] });
    await render(inApp(<NewPhotos />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Choose photos or a video' }));
    await waitFor(() => expect(screen.getByText('1 was already in your Library.')).toBeOnTheScreen());
    expect(mockCache.libraryAdded).not.toHaveBeenCalled();
  });

  it('sends who sees them as the + sheet said, and as changed here', async () => {
    mockParams = { audience: 'circle' };
    jest.mocked(pickForLibrary).mockResolvedValue([lake]);
    jest.mocked(addToLibrary).mockResolvedValue({ items: [{ clientId: 'client-1', item: photo({ id: id(91) }), alreadyThere: false }] });
    await render(inApp(<NewPhotos />));
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'Seen by The Linds. Change' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Choose photos or a video' }));
    await waitFor(() => expect(addToLibrary).toHaveBeenCalledWith({ circleId: 'c-linds', items: [expect.objectContaining({ audience: 'circle' })] }));
  });

  it('sends a video with its length, and a still when the device can make one', async () => {
    const clip = picked('clip.mp4', { contentType: 'video/mp4', kind: 'video', durationSeconds: 42 });
    jest.mocked(pickForLibrary).mockResolvedValue([clip]);
    jest.mocked(stillOf).mockResolvedValue('blob:still');
    jest.mocked(addToLibrary).mockResolvedValue({ items: [{ clientId: 'client-1', item: photo({ id: id(93), kind: 'video' }), alreadyThere: false }] });
    await render(inApp(<NewPhotos />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Choose photos or a video' }));
    await waitFor(() => expect(screen.getByText('1 added.')).toBeOnTheScreen());
    expect(startUpload).toHaveBeenNthCalledWith(1, { kind: 'video', contentType: 'video/mp4', fileName: 'clip.mp4', durationSeconds: 42, keepOriginal: false });
    expect(startUpload).toHaveBeenNthCalledWith(2, { kind: 'photo', contentType: 'image/jpeg' });
    expect(addToLibrary).toHaveBeenCalledWith({ circleId: 'c-linds', items: [expect.objectContaining({ mediaId: 'media-1', posterMediaId: 'media-2' })] });
  });

  it('refuses a file the Library can not keep before anything is sent', async () => {
    jest.mocked(pickForLibrary).mockResolvedValue([picked('scan.heic', { contentType: 'image/heic' })]);
    await render(inApp(<NewPhotos />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Choose photos or a video' }));
    await waitFor(() => expect(screen.getByText("That kind of file can't be added.")).toBeOnTheScreen());
    expect(checkLibrary).not.toHaveBeenCalled();
    expect(screen.getByText("1 didn't go up.")).toBeOnTheScreen();
  });

  it("says why one didn't go up, adds the others, and sends the failed one again with the same id", async () => {
    jest.mocked(pickForLibrary).mockResolvedValue([lake, hill]);
    jest.mocked(sendFile).mockResolvedValueOnce(0).mockResolvedValue(200);
    jest.mocked(addToLibrary).mockResolvedValueOnce({ items: [{ clientId: 'client-2', item: photo({ id: id(92) }), alreadyThere: false }] });
    await render(inApp(<NewPhotos />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Choose photos or a video' }));
    await waitFor(() => expect(screen.getByText("1 added. 1 didn't go up.")).toBeOnTheScreen());
    expect(screen.getByText("A file couldn't be uploaded. Try again.")).toBeOnTheScreen();

    jest.mocked(addToLibrary).mockResolvedValueOnce({ items: [{ clientId: 'client-1', item: photo({ id: id(91) }), alreadyThere: false }] });
    await user.press(screen.getByRole('button', { name: 'Try those again' }));
    await waitFor(() => expect(screen.getByText('2 added.')).toBeOnTheScreen());
    expect(addToLibrary).toHaveBeenLastCalledWith({ circleId: 'c-linds', items: [expect.objectContaining({ clientId: 'client-1' })] });
  });

  it("shows the API's own words when it refuses one of them", async () => {
    jest.mocked(pickForLibrary).mockResolvedValue([lake]);
    jest.mocked(addToLibrary).mockResolvedValue({ items: [{ clientId: 'client-1', problem: { code: 'not_ready', message: "A file didn't finish uploading. Add it again." } }] });
    await render(inApp(<NewPhotos />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Choose photos or a video' }));
    await waitFor(() => expect(screen.getByText("A file didn't finish uploading. Add it again.")).toBeOnTheScreen());
  });

  it('says so when the Library can not be asked', async () => {
    jest.mocked(pickForLibrary).mockResolvedValue([lake]);
    jest.mocked(checkLibrary).mockRejectedValue(new ApiError(0, 'unreachable', "Can't reach Homeport right now. Check your connection and try again."));
    await render(inApp(<NewPhotos />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Choose photos or a video' }));
    await waitFor(() => expect(screen.getByText("Can't reach Homeport right now. Check your connection and try again.")).toBeOnTheScreen());
    expect(startUpload).not.toHaveBeenCalled();
  });

  it('does nothing when the picker is closed without choosing', async () => {
    jest.mocked(pickForLibrary).mockResolvedValue([]);
    await render(inApp(<NewPhotos />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Choose photos or a video' }));
    expect(screen.getByRole('button', { name: 'Choose photos or a video' })).toBeOnTheScreen();
    expect(checkLibrary).not.toHaveBeenCalled();
  });
});
