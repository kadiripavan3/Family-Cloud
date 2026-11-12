import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'homeport.session';
/** The phone's secure storage takes about 2,000 characters per item; a longer value is kept in pieces. */
const PIECE = 1800;

/**
 * Where the sign-in is kept between runs of the app: the phone's secure storage (Keychain / Keystore); in a
 * browser, local storage. Reading or writing can fail (a locked phone, private browsing); then the person
 * simply signs in again next time.
 */
export const sessionStore = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
      const pieces = Number(await SecureStore.getItemAsync(`${key}.n`));
      if (!pieces) return await SecureStore.getItemAsync(key);
      const parts = await Promise.all(Array.from({ length: pieces }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
      return parts.some((part) => part === null) ? null : parts.join('');
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        globalThis.localStorage?.setItem(key, value);
        return;
      }
      await this.removeItem(key);
      if (value.length <= PIECE) {
        await SecureStore.setItemAsync(key, value);
        return;
      }
      const pieces = Math.ceil(value.length / PIECE);
      for (let i = 0; i < pieces; i += 1) await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * PIECE, (i + 1) * PIECE));
      await SecureStore.setItemAsync(`${key}.n`, String(pieces));
    } catch {
      // The person stays signed in for this run of the app.
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        globalThis.localStorage?.removeItem(key);
        return;
      }
      const pieces = Number(await SecureStore.getItemAsync(`${key}.n`));
      for (let i = 0; i < pieces; i += 1) await SecureStore.deleteItemAsync(`${key}.${i}`);
      await SecureStore.deleteItemAsync(`${key}.n`);
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Nothing useful to do.
    }
  },
};

export const loadToken = () => sessionStore.getItem(KEY);
export const saveToken = (token: string) => sessionStore.setItem(KEY, token);
export const clearToken = () => sessionStore.removeItem(KEY);
