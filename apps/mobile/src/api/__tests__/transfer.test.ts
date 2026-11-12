import { completeUpload, startUpload } from '../generated/homeport';
import { removeFile, sendFile } from '../transfer';
import { uploadPhoto } from '../upload';

const mockFiles = { exists: true, upload: jest.fn(), deleted: [] as string[] };
jest.mock('expo-file-system', () => ({
  UploadType: { BINARY_CONTENT: 0 },
  File: class {
    mockUri: string;
    constructor(mockUri: string) {
      this.mockUri = mockUri;
    }
    get exists() {
      return mockFiles.exists;
    }
    upload(...args: unknown[]) {
      return mockFiles.upload(...args);
    }
    delete() {
      mockFiles.deleted.push(this.mockUri);
    }
  },
}));
const mockSaved = { uri: 'file:///cache/resized.jpg' };
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: jest.fn(() => ({ resize: jest.fn(), renderAsync: async () => ({ saveAsync: async () => mockSaved }) })) },
}));
jest.mock('../generated/homeport', () => ({ startUpload: jest.fn(), completeUpload: jest.fn() }));

const target = { uploadUrl: 'https://storage.example/put', method: 'PUT', headers: {} };

describe('sending a file from the phone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFiles.exists = true;
    mockFiles.deleted = [];
  });

  it('hands back the status of the answer', async () => {
    mockFiles.upload.mockResolvedValue({ status: 200 });
    await expect(sendFile('file:///library/lake.mp4', target)).resolves.toBe(200);
  });

  it('counts only a transfer that got no answer as "nothing answered"', async () => {
    mockFiles.upload.mockRejectedValue(Object.assign(new Error('Unable to upload a file: The network connection was lost.'), { code: 'ERR_UNABLE_TO_UPLOAD' }));
    await expect(sendFile('file:///library/lake.mp4', target)).resolves.toBe(0);
  });

  it('says so when the file is gone, or something else broke: trying again later would never end', async () => {
    mockFiles.exists = false;
    await expect(sendFile('file:///library/lake.mp4', target)).rejects.toMatchObject({ status: 400, code: 'file_gone', message: expect.stringContaining('no longer on your phone') });
    expect(mockFiles.upload).not.toHaveBeenCalled();

    mockFiles.exists = true;
    mockFiles.upload.mockRejectedValue(Object.assign(new Error('Invalid URL'), { code: 'ERR_INVALID_URL' }));
    await expect(sendFile('file:///library/lake.mp4', target)).rejects.toMatchObject({ status: 400, code: 'upload_failed' });
  });

  it('removes a file made for an upload, quietly when it is gone already', () => {
    removeFile('file:///cache/copy.jpg');
    expect(mockFiles.deleted).toEqual(['file:///cache/copy.jpg']);
    mockFiles.exists = false;
    removeFile('file:///cache/gone.jpg');
    expect(mockFiles.deleted).toEqual(['file:///cache/copy.jpg']);
  });
});

describe('uploading a photo', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockFiles.exists = true;
    mockFiles.deleted = [];
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    jest.mocked(startUpload).mockResolvedValue({ mediaId: 'media-1', uploadUrl: 'https://storage.example/put', method: 'PUT', headers: {} } as Awaited<ReturnType<typeof startUpload>>);
    jest.mocked(completeUpload).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof completeUpload>>);
  });

  it('removes the resized copy once it is up, and never the photo itself', async () => {
    fetchMock.mockImplementation(async (url: string) => (url === mockSaved.uri ? new Response('jpeg') : new Response(null, { status: 200 })));
    await expect(uploadPhoto({ uri: 'file:///library/lake.heic', width: 4000, height: 3000 })).resolves.toBe('media-1');
    expect(mockFiles.deleted).toEqual(['file:///cache/resized.jpg']);
  });

  it('removes the copy when the upload fails as well, and says whether anything answered', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === mockSaved.uri) return new Response('jpeg');
      throw new TypeError('Network request failed');
    });
    await expect(uploadPhoto({ uri: 'file:///library/lake.heic', width: 4000, height: 3000 })).rejects.toMatchObject({ status: 0, code: 'unreachable' });
    expect(mockFiles.deleted).toEqual(['file:///cache/resized.jpg']);

    fetchMock.mockImplementation(async (url: string) => (url === mockSaved.uri ? new Response('jpeg') : new Response(null, { status: 503 })));
    await expect(uploadPhoto({ uri: 'file:///library/lake.heic', width: 4000, height: 3000 })).rejects.toMatchObject({ status: 503, code: 'upload_failed' });
  });
});
