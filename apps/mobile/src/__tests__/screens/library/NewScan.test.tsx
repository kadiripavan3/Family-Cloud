import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { addToLibrary, checkLibrary, completeUpload, startUpload } from '@/api/generated/homeport';
import { sendFile } from '@/api/transfer';
import NewScan from '@/app/(app)/new/scan';
import { bytesOf, pickDocument } from '@/features/library/adding/pick';
import type { Picked } from '@/features/library/adding/picked';
import { inApp } from '@/test/phone';
import { linds } from '@/test/samples';
import { doc, id } from '@/test/samples/library';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
let mockGuardOn = false;
const mockRelease = jest.fn();
const mockCache = { libraryAdded: jest.fn(() => Promise.resolve()) };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  usePreventRemove: (on: boolean) => {
    mockGuardOn = on;
    return mockRelease;
  },
}));
jest.mock('@/api/cache', () => ({ useCache: () => mockCache }));
jest.mock('@/lib/ids', () => ({ newClientId: () => 'client-1' }));
jest.mock('@/features/circles/current', () => ({ useCircle: () => mockLinds }));
jest.mock('@/features/library/adding/pick', () => ({ pickDocument: jest.fn(), bytesOf: jest.fn() }));
jest.mock('@/api/transfer', () => ({ sendFile: jest.fn(), removeFile: jest.fn() }));
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digest: jest.fn(async (_how: string, bytes: Uint8Array) => new Uint8Array(32).fill(bytes[0]!).buffer) }));
jest.mock('@/api/generated/homeport', () => ({ checkLibrary: jest.fn(), startUpload: jest.fn(), completeUpload: jest.fn(), addToLibrary: jest.fn() }));

const mockLinds = linds;
const hash = '07'.repeat(32);
const scan: Picked = { uri: 'blob:scan', name: 'library-card.jpg', contentType: 'image/jpeg', kind: 'photo', bytes: 20480 };
const letter: Picked = { uri: 'blob:letter', name: 'school letter.pdf', contentType: 'application/pdf', kind: 'file', bytes: 1024 };

describe('/new/scan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(bytesOf).mockResolvedValue(new Uint8Array([7]));
    jest.mocked(checkLibrary).mockResolvedValue({ known: [] });
    jest.mocked(startUpload).mockResolvedValue({ mediaId: 'media-1', uploadUrl: 'https://up.test/put', method: 'PUT', headers: {} });
    jest.mocked(sendFile).mockResolvedValue(200);
    jest.mocked(completeUpload).mockResolvedValue(undefined);
    jest.mocked(addToLibrary).mockResolvedValue({ items: [{ clientId: 'client-1', item: { id: id(95) }, alreadyThere: false }] });
  });

  it('says what a phone does by itself and what is typed here, and asks for a file', async () => {
    await render(inApp(<NewScan />));
    expect(screen.getByRole('header', { name: 'Scan a document' })).toBeOnTheScreen();
    expect(screen.getByText(/A phone scans with its camera and reads the words by itself\. Here you type or paste them/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose a picture or a PDF' })).toBeOnTheScreen();
    expect(mockGuardOn).toBe(false);
  });

  it('adds a picture of a document with its name and the words inside it, and opens it', async () => {
    jest.mocked(pickDocument).mockResolvedValue(scan);
    await render(inApp(<NewScan />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Choose a picture or a PDF' }));
    // The name starts as the file's, and leaving now would lose what was chosen.
    expect(screen.getByDisplayValue('library-card')).toBeOnTheScreen();
    expect(screen.getByText('20 KB')).toBeOnTheScreen();
    expect(mockGuardOn).toBe(true);
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Library card');
    await user.type(screen.getByLabelText('The words inside it'), 'City library. Valid until 31.12.2027');
    await user.type(screen.getByLabelText('Pages'), '2');
    await user.press(screen.getByRole('button', { name: 'Add document' }));
    await waitFor(() => expect(mockCache.libraryAdded).toHaveBeenCalledWith('c-linds'));

    expect(checkLibrary).toHaveBeenCalledWith({ circleId: 'c-linds', hashes: [hash] });
    // A picture goes up as a photo, kept as it arrives, and is said to be a document.
    expect(startUpload).toHaveBeenCalledWith({ kind: 'photo', contentType: 'image/jpeg', fileName: 'library-card.jpg', keepOriginal: true });
    expect(sendFile).toHaveBeenCalledWith('blob:scan', expect.anything(), expect.any(Function));
    expect(completeUpload).toHaveBeenCalledWith('media-1');
    expect(addToLibrary).toHaveBeenCalledWith({
      circleId: 'c-linds',
      items: [{ clientId: 'client-1', mediaId: 'media-1', kind: 'document', title: 'Library card', text: 'City library. Valid until 31.12.2027', pages: 2, contentHash: hash, audience: 'me' }],
    });
    expect(mockRelease).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'document', id: id(95) } });
  });

  it('sends a PDF as a file, with nothing typed', async () => {
    jest.mocked(pickDocument).mockResolvedValue(letter);
    await render(inApp(<NewScan />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Choose a picture or a PDF' }));
    await user.press(screen.getByRole('button', { name: 'Add document' }));
    await waitFor(() => expect(addToLibrary).toHaveBeenCalled());
    expect(startUpload).toHaveBeenCalledWith({ kind: 'file', contentType: 'application/pdf', fileName: 'school letter.pdf', keepOriginal: false });
    expect(addToLibrary).toHaveBeenCalledWith({ circleId: 'c-linds', items: [{ clientId: 'client-1', mediaId: 'media-1', kind: 'document', title: 'school letter', text: undefined, pages: undefined, contentHash: hash, audience: 'me' }] });
  });

  it('says a file is in the Library already instead of sending it again, and opens what it is', async () => {
    jest.mocked(pickDocument).mockResolvedValue(scan);
    jest.mocked(checkLibrary).mockResolvedValue({ known: [{ hash, id: doc().id }] });
    await render(inApp(<NewScan />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Choose a picture or a PDF' }));
    await user.press(screen.getByRole('button', { name: 'Add document' }));
    await waitFor(() => expect(screen.getByText('That file is already in your Library.')).toBeOnTheScreen());
    expect(startUpload).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Open it' }));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/[kind]/[id]', params: { kind: 'document', id: doc().id } });
  });

  it('refuses a file that is neither a picture nor a PDF', async () => {
    jest.mocked(pickDocument).mockResolvedValue({ ...letter, name: 'notes.docx', contentType: 'application/msword' });
    await render(inApp(<NewScan />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Choose a picture or a PDF' }));
    expect(screen.getByText('A document is a JPEG or PNG picture, or a PDF.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add document' })).toBeNull();
  });

  it("shows the API's own words when the file can't be added", async () => {
    jest.mocked(pickDocument).mockResolvedValue(scan);
    jest.mocked(addToLibrary).mockResolvedValue({ items: [{ clientId: 'client-1', problem: { code: 'not_ready', message: "A file didn't finish uploading. Add it again." } }] });
    await render(inApp(<NewScan />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Choose a picture or a PDF' }));
    await user.press(screen.getByRole('button', { name: 'Add document' }));
    await waitFor(() => expect(screen.getByText("A file didn't finish uploading. Add it again.")).toBeOnTheScreen());
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
