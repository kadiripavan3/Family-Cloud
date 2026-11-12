import { coordinate, pointFrom, readTaken, takenAtFrom, withOffset } from '../adding/exif';
import { fingerprint, kindOfType, nameWithoutEnding } from '../adding/picked';

jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digest: jest.fn(async () => new Uint8Array([0, 1, 171, 255]).buffer) }));

/** A JPEG that says when and where it was taken, built byte by byte the way a camera writes it (big-endian). */
function jpegWithExif(options: { date?: string; offset?: string; gps?: boolean; little?: boolean } = {}): Uint8Array {
  const little = !!options.little;
  const tiff: number[] = [];
  const u16 = (value: number) => (little ? [value & 255, value >> 8] : [value >> 8, value & 255]);
  const u32 = (value: number) => (little ? [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255] : [(value >>> 24) & 255, (value >> 16) & 255, (value >> 8) & 255, value & 255]);
  const text = (value: string) => [...value].map((letter) => letter.charCodeAt(0)).concat(0);
  const entry = (tag: number, type: number, count: number, value: number[]) => [...u16(tag), ...u16(type), ...u32(count), ...value, ...Array(4 - value.length).fill(0)];

  // Where each part lies inside the block: the main directory, then the EXIF one, then the GPS one, then the values.
  const main = 8;
  const mainEntries = 1 + (options.gps ? 1 : 0);
  const exif = main + 2 + mainEntries * 12 + 4;
  const exifEntries = (options.date ? 1 : 0) + (options.offset ? 1 : 0);
  const gps = exif + 2 + exifEntries * 12 + 4;
  const gpsEntries = options.gps ? 4 : 0;
  let values = gps + (options.gps ? 2 + gpsEntries * 12 + 4 : 0);
  const data: number[] = [];
  const place = (bytes: number[]) => {
    const at = values;
    data.push(...bytes);
    values += bytes.length;
    return u32(at);
  };

  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(main));
  tiff.push(...u16(mainEntries), ...entry(0x8769, 4, 1, u32(exif)), ...(options.gps ? entry(0x8825, 4, 1, u32(gps)) : []), ...u32(0));
  tiff.push(...u16(exifEntries));
  if (options.date) tiff.push(...entry(0x9003, 2, 20, place(text(options.date))));
  if (options.offset) tiff.push(...entry(0x9011, 2, 7, place(text(options.offset))));
  tiff.push(...u32(0));
  if (options.gps) {
    const rationals = (parts: [number, number][]) => parts.flatMap(([top, bottom]) => [...u32(top), ...u32(bottom)]);
    tiff.push(...u16(gpsEntries));
    tiff.push(...entry(1, 2, 2, text('N')), ...entry(2, 5, 3, place(rationals([[46, 1], [21, 1], [4068, 100]]))));
    tiff.push(...entry(3, 2, 2, text('E')), ...entry(4, 5, 3, place(rationals([[14, 1], [5, 1], [42, 1]]))));
    tiff.push(...u32(0));
  }
  tiff.push(...data);
  const block = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xe1, (block.length + 2) >> 8, (block.length + 2) & 255, ...block, 0xff, 0xda, 0, 2]);
}

describe('what a photo says about itself', () => {
  it('reads when it was taken, by the clock it was taken by', () => {
    expect(readTaken(jpegWithExif({ date: '2026:11:07 11:42:00', offset: '+01:00' }))).toEqual({ takenAt: '2026-11-07T11:42:00+01:00' });
    expect(readTaken(jpegWithExif({ date: '2026:11:07 11:42:00', offset: '-08:00', little: true }))).toEqual({ takenAt: '2026-11-07T11:42:00-08:00' });
  });

  it("takes the clock to be this device's when the photo doesn't say", () => {
    expect(readTaken(jpegWithExif({ date: '2026:11:07 11:42:00' })).takenAt).toMatch(/^2026-11-07T11:42:00[+-]\d{2}:\d{2}$/);
  });

  it('reads where it was taken', () => {
    const taken = readTaken(jpegWithExif({ date: '2026:11:07 11:42:00', offset: '+01:00', gps: true }));
    expect(taken.lat).toBeCloseTo(46.3613, 3);
    expect(taken.lng).toBeCloseTo(14.095, 3);
  });

  it('gives nothing for a file that says nothing, or is no JPEG, or is cut short', () => {
    expect(readTaken(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toEqual({});
    expect(readTaken(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toEqual({});
    expect(readTaken(new Uint8Array([]))).toEqual({});
    expect(readTaken(jpegWithExif({ date: '2026:11:07 11:42:00' }).slice(0, 40))).toEqual({});
  });

  it('refuses a date that is none', () => {
    expect(takenAtFrom('2026:11:07 11:42:00', '+01:00')).toBe('2026-11-07T11:42:00+01:00');
    expect(takenAtFrom('2026-11-07T11:42:00', ' +02:00 ')).toBe('2026-11-07T11:42:00+02:00');
    expect(takenAtFrom('0000:00:00 00:00:00')).toBeUndefined();
    expect(takenAtFrom('2026:13:40 25:61:00')).toBeUndefined();
    expect(takenAtFrom(undefined)).toBeUndefined();
    expect(takenAtFrom(20261107)).toBeUndefined();
  });

  it('writes a moment on this device with its own offset', () => {
    expect(withOffset(new Date(2026, 10, 7, 9, 5, 3))).toMatch(/^2026-11-07T09:05:03[+-]\d{2}:\d{2}$/);
  });

  it('reads a coordinate with its sign or its letter, and drops a place that is none', () => {
    expect(coordinate(46.36, 'N', 'S')).toBe(46.36);
    expect(coordinate(33.86, 'S', 'S')).toBe(-33.86);
    expect(coordinate('151.2', 'E', 'W')).toBe(151.2);
    expect(coordinate('abc', 'N', 'S')).toBeUndefined();
    expect(pointFrom(46.36, 14.09)).toEqual({ lat: 46.36, lng: 14.09 });
    expect(pointFrom(0, 0)).toBeUndefined();
    expect(pointFrom(91, 14)).toBeUndefined();
    expect(pointFrom(46.36, undefined)).toBeUndefined();
  });
});

describe('a file that was chosen', () => {
  it('has a fingerprint: its SHA-256 in hex', async () => {
    expect(await fingerprint(new Uint8Array([1, 2, 3]))).toBe('0001abff');
  });

  it('is a photo or a video by its type, and has a name to start a document with', () => {
    expect(kindOfType('image/jpeg')).toBe('photo');
    expect(kindOfType('video/mp4')).toBe('video');
    expect(kindOfType('application/pdf')).toBeNull();
    expect(nameWithoutEnding("Mia's passport.jpg")).toBe("Mia's passport");
    expect(nameWithoutEnding('school letter.pdf')).toBe('school letter');
    expect(nameWithoutEnding('no ending')).toBe('no ending');
  });
});
