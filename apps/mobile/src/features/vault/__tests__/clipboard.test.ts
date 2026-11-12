import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';

import { CLEAR_AFTER_MS, copySecret } from '../clipboard';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true), getStringAsync: jest.fn(async () => '') }));

const set = Clipboard.setStringAsync as jest.Mock;
const get = Clipboard.getStringAsync as jest.Mock;
const on = (os: typeof Platform.OS) => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });

describe('copying a secret', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    set.mockClear();
    get.mockClear();
    set.mockResolvedValue(true);
  });
  afterEach(() => {
    jest.useRealTimers();
    on('ios');
  });

  it('on an iPhone the system is told to remove it after 60 seconds and to keep it on this phone', async () => {
    on('ios');
    const before = Date.now();
    expect(await copySecret('p0pcorn!Friday#night')).toBe(true);
    const [text, options] = set.mock.calls[0];
    expect(text).toBe('p0pcorn!Friday#night');
    expect(options.ios.localOnly).toBe(true);
    expect(options.ios.expiresAt.getTime() - before).toBeGreaterThanOrEqual(CLEAR_AFTER_MS);
    expect(options.android.isSensitive).toBe(true);
    // The app itself does nothing more there.
    await jest.advanceTimersByTimeAsync(CLEAR_AFTER_MS + 1000);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('elsewhere the app empties the clipboard after 60 seconds, if it still holds what was copied', async () => {
    on('web');
    get.mockResolvedValue('p0pcorn!Friday#night');
    await copySecret('p0pcorn!Friday#night');
    await jest.advanceTimersByTimeAsync(CLEAR_AFTER_MS - 1);
    expect(set).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(set).toHaveBeenLastCalledWith('');
    expect(CLEAR_AFTER_MS).toBe(60_000);
  });

  it('leaves alone what the person copied since', async () => {
    on('android');
    get.mockResolvedValue('a shopping list');
    await copySecret('p0pcorn!Friday#night');
    await jest.advanceTimersByTimeAsync(CLEAR_AFTER_MS);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('empties it anyway when the clipboard can not be read', async () => {
    on('web');
    get.mockRejectedValue(new Error('not allowed'));
    await copySecret('p0pcorn!Friday#night');
    await jest.advanceTimersByTimeAsync(CLEAR_AFTER_MS);
    expect(set).toHaveBeenLastCalledWith('');
  });

  it('a second copy starts the minute again, and only the newer one is cleared', async () => {
    on('web');
    await copySecret('first');
    await jest.advanceTimersByTimeAsync(40_000);
    get.mockResolvedValue('second');
    await copySecret('second');
    await jest.advanceTimersByTimeAsync(40_000);
    expect(set).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(20_000);
    expect(set).toHaveBeenLastCalledWith('');
  });

  it('says so when the copy was not allowed, and survives a clipboard that refuses to be emptied', async () => {
    on('web');
    set.mockRejectedValueOnce(new Error('not allowed'));
    expect(await copySecret('x')).toBe(false);
    set.mockResolvedValueOnce(false);
    expect(await copySecret('x')).toBe(false);
    set.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('not in front'));
    get.mockResolvedValue('x');
    expect(await copySecret('x')).toBe(true);
    await jest.advanceTimersByTimeAsync(CLEAR_AFTER_MS);
  });
});
