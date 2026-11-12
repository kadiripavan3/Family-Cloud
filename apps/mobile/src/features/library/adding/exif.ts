/**
 * What a photo says about itself: when it was taken, by the clock where it was taken, and where. Read from
 * the EXIF block of a JPEG. A phone's photo picker hands these over by itself; a browser hands over only
 * the file, so there the app reads them here.
 */
export type Taken = {
  /** "2026-11-07T11:42:00+01:00": the time on the camera's clock, with that clock's offset. */
  takenAt?: string;
  lat?: number;
  lng?: number;
};

/** The offset of this device's clock on a day, as "+01:00": for a photo that doesn't say its own. */
function offsetOn(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, '0');
  return `${minutes < 0 ? '-' : '+'}${pad(minutes / 60)}${':'}${pad(minutes % 60)}`;
}

/** A moment on this device's clock as the API wants it: "2026-11-07T11:42:00+01:00". */
export function withOffset(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${offsetOn(date)}`;
}

/**
 * "2026:11:07 11:42:00" (how cameras write it) and "+01:00" (when the camera says where its clock was) as
 * one moment. Without an offset, the clock is taken to be this device's. Undefined for anything else.
 */
export function takenAtFrom(written: unknown, offset?: unknown): string | undefined {
  const match = typeof written === 'string' ? /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(written) : null;
  if (!match) return undefined;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [number, number, number, number, number, number];
  if (year < 1990 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return undefined;
  const said = typeof offset === 'string' && /^[+-]\d{2}:\d{2}$/.test(offset.trim()) ? offset.trim() : offsetOn(new Date(year, month - 1, day, hour, minute, second));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${said}`;
}

/** A coordinate as a number. South and west are negative, whether the photo says so with a sign or with a letter. */
export function coordinate(value: unknown, ref: unknown, negative: 'S' | 'W'): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(number)) return undefined;
  return typeof ref === 'string' && ref.trim().toUpperCase().startsWith(negative) ? -Math.abs(number) : number;
}

/** Where a photo was taken, when both halves are there and make sense. 0, 0 is what a camera without a fix writes. */
export function pointFrom(lat: number | undefined, lng: number | undefined): { lat: number; lng: number } | undefined {
  if (lat === undefined || lng === undefined) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return undefined;
  return { lat, lng };
}

const EXIF_IFD = 0x8769;
const GPS_IFD = 0x8825;
const DATE_TIME = 0x0132;
const DATE_TIME_ORIGINAL = 0x9003;
const OFFSET_TIME_ORIGINAL = 0x9011;

/**
 * Reads when and where a JPEG was taken from its bytes. Anything that isn't a JPEG with an EXIF block, or
 * whose block is cut short or garbled, gives nothing: the photo is then added as taken now.
 */
export function readTaken(bytes: Uint8Array): Taken {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {};
    // Walk the file's segments to the one that holds EXIF.
    let at = 2;
    while (at + 4 <= view.byteLength) {
      const marker = view.getUint16(at);
      if ((marker & 0xff00) !== 0xff00) return {};
      const size = view.getUint16(at + 2);
      if (marker === 0xffe1 && view.getUint32(at + 4) === 0x45786966 && view.getUint16(at + 8) === 0) return readTiff(view, at + 10, at + 2 + size);
      // After "start of scan" comes the picture itself.
      if (marker === 0xffda) return {};
      at += 2 + size;
    }
    return {};
  } catch {
    return {};
  }
}

function readTiff(view: DataView, start: number, end: number): Taken {
  const little = view.getUint16(start) === 0x4949;
  const u16 = (offset: number) => view.getUint16(start + offset, little);
  const u32 = (offset: number) => view.getUint32(start + offset, little);
  if (u16(2) !== 42) return {};

  /** The entries of one directory: tag to where its value is, how many there are and of what type. */
  const directory = (offset: number) => {
    const entries = new Map<number, { type: number; count: number; at: number }>();
    if (offset <= 0 || start + offset + 2 > end) return entries;
    const count = u16(offset);
    for (let index = 0; index < count; index += 1) {
      const entry = offset + 2 + index * 12;
      if (start + entry + 12 > end) break;
      entries.set(u16(entry), { type: u16(entry + 2), count: u32(entry + 4), at: entry + 8 });
    }
    return entries;
  };
  const text = (entry: { type: number; count: number; at: number } | undefined) => {
    if (!entry || entry.type !== 2) return undefined;
    const from = entry.count > 4 ? u32(entry.at) : entry.at;
    let out = '';
    for (let index = 0; index < entry.count && start + from + index < end; index += 1) {
      const code = view.getUint8(start + from + index);
      if (code === 0) break;
      out += String.fromCharCode(code);
    }
    return out;
  };
  /** Degrees, minutes and seconds as three fractions. */
  const degrees = (entry: { type: number; count: number; at: number } | undefined) => {
    if (!entry || entry.type !== 5 || entry.count !== 3) return undefined;
    const from = u32(entry.at);
    const part = (index: number) => {
      const below = u32(from + index * 8 + 4);
      return below === 0 ? NaN : u32(from + index * 8) / below;
    };
    const value = part(0) + part(1) / 60 + part(2) / 3600;
    return Number.isFinite(value) ? value : undefined;
  };

  const main = directory(u32(4));
  const exifAt = main.get(EXIF_IFD);
  const exif = exifAt ? directory(u32(exifAt.at)) : new Map<number, { type: number; count: number; at: number }>();
  const gpsAt = main.get(GPS_IFD);
  const gps = gpsAt ? directory(u32(gpsAt.at)) : new Map<number, { type: number; count: number; at: number }>();

  const takenAt = takenAtFrom(text(exif.get(DATE_TIME_ORIGINAL)) ?? text(main.get(DATE_TIME)), text(exif.get(OFFSET_TIME_ORIGINAL)));
  const point = pointFrom(coordinate(degrees(gps.get(2)), text(gps.get(1)), 'S'), coordinate(degrees(gps.get(4)), text(gps.get(3)), 'W'));
  return { takenAt, ...point };
}
