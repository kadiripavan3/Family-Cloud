/** The English catalog, one file per area. `src/words/index.ts` says how another language is added. */
import { activity } from './activity';
import { circles } from './circles';
import { common } from './common';
import { couple } from './couple';
import { crew } from './crew';
import { dates } from './dates';
import { flat } from './flat';
import { jot } from './jot';
import { keepsakes } from './keepsakes';
import { kinds } from './kinds';
import { library } from './library';
import { media } from './media';
import { money } from './money';
import { notes } from './notes';
import { notifications } from './notifications';
import { onboarding } from './onboarding';
import { people } from './people';
import { perks } from './perks';
import { plan } from './plan';
import { profile } from './profile';
import { search } from './search';
import { settings } from './settings';
import { setup } from './setup';
import { sharing } from './sharing';
import { signIn } from './signIn';
import { states } from './states';
import { templates } from './templates';
import { things } from './things';
import { today } from './today';
import { together } from './together';
import { vault } from './vault';
import { you } from './you';

export const en = {
  activity,
  circles,
  common,
  couple,
  crew,
  dates,
  flat,
  jot,
  keepsakes,
  kinds,
  library,
  media,
  money,
  notes,
  notifications,
  onboarding,
  people,
  perks,
  plan,
  profile,
  search,
  settings,
  setup,
  sharing,
  signIn,
  states,
  templates,
  things,
  today,
  together,
  vault,
  you,
} as const;
