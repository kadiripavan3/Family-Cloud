/** The English catalog, one file per area. `src/words/index.ts` says how another language is added. */
import { common } from './common';
import { dates } from './dates';
import { media } from './media';
import { notifications } from './notifications';
import { onboarding } from './onboarding';
import { profile } from './profile';
import { settings } from './settings';
import { setup } from './setup';
import { signIn } from './signIn';
import { states } from './states';
import { you } from './you';

export const en = {
  common,
  dates,
  media,
  notifications,
  onboarding,
  profile,
  settings,
  setup,
  signIn,
  states,
  you,
} as const;
