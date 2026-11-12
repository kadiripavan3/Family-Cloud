import { AuthClient, type AuthError, type GoTrueClient, isAuthRetryableFetchError, type Session } from '@supabase/auth-js';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';

import { ApiError, TIME_LIMIT_MS, unreachable } from '@/api/fetcher';
import { rememberAppleSignIn } from '@/api/generated/homeport';

import { keep } from '@/lib/keep';
import { words } from '@/words';

import type { SignInService, SignInWay } from './signIn';
import { sessionStore } from './storage';

const STORAGE_KEY = 'homeport.supabase';
/** Which way the person on this phone signed in, remembered so the Privacy and security page can say so. */
const WAY_KEY = 'homeport.signin.way';
/** When the app starts with a token that has run out: how long it waits for a fresh one before opening anyway. */
const START_PATIENCE_MS = 4000;

/**
 * Every request to Supabase has a time limit. And "too many requests" while renewing is passed on as "try
 * later": Supabase's client ends the sign-in over any plain no, and being asked to slow down isn't one.
 */
const fetchWithLimit: typeof fetch = async (input, init) => {
  const limit = new AbortController();
  const timer = setTimeout(() => limit.abort(), TIME_LIMIT_MS);
  try {
    const response = await fetch(input, { ...init, signal: limit.signal });
    const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (response.status === 429 && address.includes('grant_type=refresh_token')) return new Response(null, { status: 503 });
    return response;
  } finally {
    clearTimeout(timer);
  }
};

/** The sign-in as the phone kept it, read without asking anyone. */
async function storedSession(): Promise<{ access_token: string; expires_at?: number } | null> {
  try {
    const stored: unknown = JSON.parse((await sessionStore.getItem(STORAGE_KEY)) ?? 'null');
    const token = typeof stored === 'object' && stored !== null ? (stored as { access_token?: unknown }).access_token : null;
    return typeof token === 'string' && token ? (stored as { access_token: string; expires_at?: number }) : null;
  } catch {
    return null;
  }
}

/**
 * Real sign-in, with Supabase Auth: a code by email, Apple on an iPhone, and Google once its client ids are
 * set. Supabase keeps the session fresh (it renews the token before it runs out) and this passes each new
 * token on. Needs EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY: the same Supabase project as
 * Journey's, because the account is one account for both apps (docs/04-journey-link.md).
 */
export function supabaseSignIn(): SignInService {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  let made: GoTrueClient | null = null;
  const client = () => {
    if (!url || !key) throw new ApiError(0, 'not_connected', words.signIn.problems.notSetUp);
    if (!made) {
      made = new AuthClient({
        url: `${url}/auth/v1`,
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        storage: sessionStore,
        storageKey: STORAGE_KEY,
        fetch: fetchWithLimit,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      });
      // On a phone, renewing only makes sense while the app is open.
      if (Platform.OS !== 'web') {
        AppState.addEventListener('change', (state) => void (state === 'active' ? made?.startAutoRefresh() : made?.stopAutoRefresh()));
      }
    }
    return made;
  };

  /** The name Apple handed over in this run of the app, before it has reached the sign-in service. */
  let justGiven: string | null = null;

  const signedIn = async (result: { data: { session: Session | null }; error: AuthError | null }, way: SignInWay) => {
    if (result.error) throw problem(result.error);
    if (!result.data.session) throw new ApiError(0, 'sign_in_failed', words.signIn.problems.failed);
    await keep.set(WAY_KEY, way);
  };

  const withApple = async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- on purpose: loaded here and nowhere else, only when someone taps "Continue with Apple"
    const Apple = require('expo-apple-authentication') as typeof import('expo-apple-authentication');
    // Apple gets a fingerprint of a random value and Supabase the value itself, so the answer can't be replayed.
    const nonce = Crypto.randomUUID();
    const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
    let token: string | null;
    let name = '';
    let code: string | null = null;
    try {
      const credential = await Apple.signInAsync({
        requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
        nonce: hashed,
      });
      token = credential.identityToken;
      code = credential.authorizationCode;
      name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ').trim();
    } catch (error) {
      if (isCode(error, 'ERR_REQUEST_CANCELED')) throw new ApiError(0, 'cancelled', '');
      throw new ApiError(0, 'sign_in_failed', words.signIn.problems.appleFailed);
    }
    if (!token) throw new ApiError(0, 'sign_in_failed', words.signIn.problems.appleFailed);
    // Apple hands the name over this once and never again. It is offered on "Create your profile" instead
    // of being asked for a second time, and kept with the sign-in (where Google's goes by itself) for the
    // case that the profile is made later, or on another phone.
    justGiven = name || null;
    await signedIn(await client().signInWithIdToken({ provider: 'apple', token, nonce }), 'apple');
    if (name) await client().updateUser({ data: { full_name: name } }).catch(() => undefined);
    // The code Apple returns with the sign-in goes to the API, once: with it the API can end the person's
    // link to the app at Apple when they delete their account, as Apple asks.
    if (code) {
      void rememberAppleSignIn({ authorizationCode: code }).catch(() => undefined);
    }
  };

  const withGoogle = async () => {
    type GoogleModule = {
      GoogleSignin: {
        configure(options: { webClientId?: string; iosClientId?: string }): void;
        hasPlayServices(): Promise<boolean>;
        signIn(): Promise<{ type: string; data?: { idToken: string | null } }>;
      };
    };
    let google: GoogleModule;
    try {
      // Only in an installed build that includes Google sign-in; Expo Go and the browser don't have it.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      google = require('@react-native-google-signin/google-signin') as GoogleModule;
    } catch {
      throw new ApiError(0, 'not_connected', words.signIn.problems.googleNeedsApp);
    }
    let token: string | null | undefined;
    try {
      google.GoogleSignin.configure({ webClientId: googleWebClientId, iosClientId: googleIosClientId });
      await google.GoogleSignin.hasPlayServices();
      const answer = await google.GoogleSignin.signIn();
      if (answer.type === 'cancelled') throw new ApiError(0, 'cancelled', '');
      token = answer.data?.idToken;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, 'sign_in_failed', words.signIn.problems.googleFailed);
    }
    if (!token) throw new ApiError(0, 'sign_in_failed', words.signIn.problems.googleFailed);
    await signedIn(await client().signInWithIdToken({ provider: 'google', token }), 'google');
  };

  return {
    async requestCode(email) {
      const { error } = await client().signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw problem(error);
    },
    async verifyCode(email, code) {
      await signedIn(await client().verifyOtp({ email, token: code, type: 'email' }), 'email');
    },
    apple: Platform.OS === 'ios' ? withApple : null,
    google: googleWebClientId && Platform.OS !== 'web' ? withGoogle : null,
    async restore() {
      if (!url || !key) return null;
      // The phone's own copy first: someone who was signed in stays signed in, also without a connection.
      const stored = await storedSession();
      if (stored) {
        const stillGood = !stored.expires_at || stored.expires_at * 1000 - Date.now() > 60_000;
        if (stillGood) return stored.access_token;
        const connected = await Network.getNetworkStateAsync()
          .then((state) => state.isConnected !== false)
          .catch(() => true);
        // Run out, and nobody to ask: the app opens with what is on the phone. The token is renewed by the
        // first request that needs it, once there is a connection.
        if (!connected) return stored.access_token;
      }
      // Supabase renews a token that has run out before it answers. On a slow connection that isn't waited for.
      const asked = client()
        .getSession()
        .then(({ data, error }) => ({ token: data.session?.access_token ?? null, couldNotAsk: !!error && isAuthRetryableFetchError(error) }));
      let patience: ReturnType<typeof setTimeout> | undefined;
      const slow = new Promise<null>((resolve) => {
        patience = setTimeout(() => resolve(null), START_PATIENCE_MS);
      });
      const answer = stored ? await Promise.race([asked, slow]).catch(() => null) : await asked;
      clearTimeout(patience);
      if (answer?.token) return answer.token;
      // No answer (yet), or Supabase couldn't be asked: the sign-in on the phone stands. A real no removes it.
      return !answer || answer.couldNotAsk ? (stored?.access_token ?? null) : null;
    },
    async renew() {
      if (!url || !key) return null;
      const { data, error } = await client().refreshSession();
      if (data.session) return data.session.access_token;
      // Supabase couldn't be asked (no connection, or it is away): that says nothing about the sign-in.
      if (error && isAuthRetryableFetchError(error)) throw unreachable();
      return null;
    },
    async suggestedName() {
      if (justGiven) return justGiven;
      if (!url || !key) return null;
      const { data } = await client().getSession();
      const known: Record<string, unknown> = data.session?.user?.user_metadata ?? {};
      const name = [known.full_name, known.name].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
      return name?.trim() ?? null;
    },
    async signedInWith() {
      const remembered = await keep.get(WAY_KEY);
      if (remembered === 'apple' || remembered === 'google' || remembered === 'email') return remembered;
      // Not remembered on this phone (the app was installed again): what the sign-in itself says it was made with.
      if (!url || !key) return 'email';
      const { data } = await client().getSession();
      const made: unknown = data.session?.user?.app_metadata?.provider;
      return made === 'apple' || made === 'google' ? made : 'email';
    },
    onToken(listener) {
      if (!url || !key) return () => {};
      const { data } = client().onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') listener(session?.access_token ?? null);
        if (event === 'SIGNED_OUT') listener(null);
      });
      return () => data.subscription.unsubscribe();
    },
    async signOut() {
      justGiven = null;
      await keep.remove(WAY_KEY);
      if (!url || !key) return;
      await client().signOut({ scope: 'local' });
    },
  };
}

/** Supabase's reasons, in the app's own words. */
function problem(error: AuthError): ApiError {
  const code = error.code ?? '';
  if (code === 'otp_expired' || code === 'invalid_credentials' || error.status === 403 || error.status === 401) {
    return new ApiError(error.status ?? 401, 'wrong_code', words.signIn.problems.wrongCode);
  }
  if (error.status === 429 || code.includes('rate_limit')) {
    return new ApiError(429, 'slow_down', words.signIn.problems.tooManyCodes);
  }
  if (code === 'validation_failed' || code === 'email_address_invalid') {
    return new ApiError(400, 'invalid_email', words.signIn.problems.badEmail);
  }
  if (!error.status) {
    return new ApiError(0, 'unreachable', words.states.unreachable);
  }
  return new ApiError(error.status, 'sign_in_failed', words.signIn.problems.didntWork);
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}
