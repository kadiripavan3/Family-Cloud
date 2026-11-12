import { authMode } from './mode';
import { localSignIn } from './signIn.local';
import { supabaseSignIn } from './signIn.supabase';

/**
 * Everything the app asks of a sign-in service. There are two: the API's own test sign-in (any email, a
 * fixed code) while building, and Supabase Auth for real people. Screens and the session only know this
 * shape, so switching from one to the other changes no screen.
 */
/** The ways there are to sign in. */
export type SignInWay = 'email' | 'apple' | 'google';

export interface SignInService {
  /** Sends a 6-digit code to the email. */
  requestCode(email: string): Promise<void>;
  /** Checks the code. When it is right the person is signed in, and `onToken` listeners hear the token. */
  verifyCode(email: string, code: string): Promise<void>;
  /** Sign in with Apple, or null where it isn't offered (not an iPhone, or not connected yet). */
  apple: (() => Promise<void>) | null;
  /** Sign in with Google, or null where it isn't offered. */
  google: (() => Promise<void>) | null;
  /**
   * When the app starts: the token of whoever was signed in last time. It is renewed first when it had run
   * out and there is a connection; without one the old token is handed back, so the app still opens.
   */
  restore(): Promise<string | null>;
  /**
   * After the API refused a token: a fresh one, or null when the sign-in service refused as well and the
   * person has to sign in again. It throws when the service couldn't be asked: that ends nothing.
   */
  renew(): Promise<string | null>;
  /**
   * A name the sign-in already knows for this person, to offer on "Create your profile": Apple hands one
   * over the first time someone signs in (and never again), Google each time. Null when there is none.
   */
  suggestedName(): Promise<string | null>;
  /** How the person on this phone signed in, for the Privacy and security page. */
  signedInWith(): Promise<SignInWay>;
  /** Hears every new token (a sign-in, a renewal) and null when the sign-in ends. Returns how to stop listening. */
  onToken(listener: (token: string | null) => void): () => void;
  signOut(): Promise<void>;
}

export const signInService: SignInService = authMode === 'supabase' ? supabaseSignIn() : localSignIn();
