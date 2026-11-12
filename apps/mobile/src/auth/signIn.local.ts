import { createLocalToken, requestLocalCode } from '@/api/generated/homeport';

import type { SignInService } from './signIn';
import { clearToken, loadToken, saveToken } from './storage';

/** The API's own test sign-in: any email, and the code from its settings (123456). No email is sent. */
export function localSignIn(): SignInService {
  const listeners = new Set<(token: string | null) => void>();
  return {
    requestCode: (email) => requestLocalCode({ email }),
    async verifyCode(email, code) {
      const result = await createLocalToken({ email, code });
      await saveToken(result.accessToken);
      listeners.forEach((hear) => hear(result.accessToken));
    },
    apple: null,
    google: null,
    suggestedName: () => Promise.resolve(null),
    signedInWith: () => Promise.resolve('email'),
    restore: loadToken,
    // A test token lasts 30 days and can't be renewed: the person signs in again.
    renew: () => Promise.resolve(null),
    onToken(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    signOut: clearToken,
  };
}
