import Storage from 'expo-sqlite/kv-store';

/**
 * A few small things the phone remembers between runs of the app: what was read last (so it opens without a
 * connection), whether the question about notifications was shown. It lives in the app's own files, so it
 * goes when the app is removed; the sign-in is kept elsewhere (`auth/storage`). Reading and writing never
 * fail: a phone that can't remember simply starts fresh.
 */
export const keep = {
  async get(key: string): Promise<string | null> {
    try {
      return await Storage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await Storage.setItem(key, value);
    } catch {
      // Full, or not there: nothing is remembered this time.
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await Storage.removeItem(key);
    } catch {
      // Nothing useful to do.
    }
  },
};
