/**
 * A few small things remembered between runs of the app. In a browser (the web preview) that is the browser's
 * own storage; the phone uses a small database (`keep.ts`). Reading and writing never fail.
 */
export const keep = {
  async get(key: string): Promise<string | null> {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Full, or switched off: nothing is remembered this time.
    }
  },
  async remove(key: string): Promise<void> {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Nothing useful to do.
    }
  },
};
