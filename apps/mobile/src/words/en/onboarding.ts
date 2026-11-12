/** The first thing after signing in for the first time: who you are. (Setting up a circle follows; its words are in setup.ts.) */
import { mark } from '../rich';

export const onboarding = {
  // Create your profile
  profile: {
    title: 'Create your profile',
    body: 'This is how the people in your circles see you.',
    differentEmail: 'Use a different email',
    oldEnough: "I'm 13 or older",
    /** "terms" and "privacy" mark the two links. */
    agree: ['By continuing you agree to the ', mark('terms', 'terms'), ' and the ', mark('privacy', 'privacy policy'), '.'],
  },
} as const;
