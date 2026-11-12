import { ImageManipulator } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { pickDocument, pickForLibrary } from '../adding/pick';

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: jest.fn(() => ({ renderAsync: async () => ({ saveAsync: async () => ({ uri: 'file:///cache/made.jpg' }) }) })) },
}));

const launch = jest.mocked(ImagePicker.launchImageLibraryAsync) as unknown as jest.Mock;
const asset = (over: object) => ({ uri: 'file:///photos/IMG_1.jpg', width: 4000, height: 3000, type: 'image', mimeType: 'image/jpeg', fileName: 'IMG_1.jpg', fileSize: 2_000_000, ...over });

describe("choosing from a phone's own photos", () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks for photos and videos, as many as the person ticks, with what each says about itself', async () => {
    launch.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickForLibrary()).toEqual([]);
    expect(launch).toHaveBeenCalledWith({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 1, exif: true });
  });

  it('hands a JPEG over as it is, with when and where it was taken', async () => {
    launch.mockResolvedValue({ canceled: false, assets: [asset({ exif: { DateTimeOriginal: '2026:11:07 11:42:00', OffsetTimeOriginal: '+01:00', GPSLatitude: 46.3613, GPSLatitudeRef: 'N', GPSLongitude: 14.095, GPSLongitudeRef: 'E' } })] });
    expect(await pickForLibrary()).toEqual([{ uri: 'file:///photos/IMG_1.jpg', name: 'IMG_1.jpg', contentType: 'image/jpeg', kind: 'photo', bytes: 2_000_000, takenAt: '2026-11-07T11:42:00+01:00', lat: 46.3613, lng: 14.095 }]);
    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
  });

  it("makes a JPEG of a photo in a format the Library doesn't keep, and keeps what it said about itself", async () => {
    launch.mockResolvedValue({ canceled: false, assets: [asset({ uri: 'file:///photos/IMG_2.HEIC', mimeType: 'image/heic', fileName: 'IMG_2.HEIC', exif: { DateTimeOriginal: '2026:08:15 09:00:00', OffsetTimeOriginal: '+08:00' } })] });
    expect(await pickForLibrary()).toEqual([{ uri: 'file:///cache/made.jpg', name: 'IMG_2.jpg', contentType: 'image/jpeg', kind: 'photo', bytes: null, takenAt: '2026-08-15T09:00:00+08:00' }]);
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///photos/IMG_2.HEIC');
  });

  it("hands a video over with its length in whole seconds (the phone gives milliseconds)", async () => {
    launch.mockResolvedValue({ canceled: false, assets: [asset({ uri: 'file:///videos/clip.mov', type: 'video', mimeType: 'video/quicktime', fileName: 'clip.mov', duration: 42_400 })] });
    expect(await pickForLibrary()).toEqual([{ uri: 'file:///videos/clip.mov', name: 'clip.mov', contentType: 'video/quicktime', kind: 'video', bytes: 2_000_000, durationSeconds: 42 }]);
  });

  it('takes one picture as a document, without when or where it was taken', async () => {
    launch.mockResolvedValue({ canceled: false, assets: [asset({ exif: { DateTimeOriginal: '2026:11:07 11:42:00', GPSLatitude: 46.36, GPSLongitude: 14.09 } })] });
    expect(await pickDocument()).toEqual({ uri: 'file:///photos/IMG_1.jpg', name: 'IMG_1.jpg', contentType: 'image/jpeg', kind: 'photo', bytes: 2_000_000, takenAt: undefined, lat: undefined, lng: undefined });
    expect(launch).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 1 });
    launch.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickDocument()).toBeNull();
  });
});
