import type {
  BirthdayInterviewSettings,
  BirthdayInterviewView,
  DoorframeSettings,
  DoorframeView,
  GoodJarSettings,
  GoodJarView,
  OpenWhenSettings,
  OpenWhenView,
  SaidSettings,
  SaidView,
  SameSpotSettings,
  SameSpotView,
  StoriesSettings,
  StoriesView,
  Template,
} from '@/api/generated/homeport';
import { BirthdayInterview } from '@/features/keepsakes/birthday-interview/BirthdayInterview';
import { BirthdayInterviewSetup } from '@/features/keepsakes/birthday-interview/BirthdayInterviewSetup';
import { Doorframe } from '@/features/keepsakes/doorframe/Doorframe';
import { GoodJar } from '@/features/keepsakes/good-jar/GoodJar';
import { OpenWhen } from '@/features/keepsakes/open-when/OpenWhen';
import { OpenWhenSetup } from '@/features/keepsakes/open-when/OpenWhenSetup';
import { Said } from '@/features/keepsakes/said/Said';
import { SameSpot } from '@/features/keepsakes/same-spot/SameSpot';
import { Stories } from '@/features/keepsakes/stories/Stories';
import { StoriesSetup } from '@/features/keepsakes/stories/StoriesSetup';

import { type AnyBuiltTemplate, template } from '../types';

/** Keepsakes (`design/hub/src/screens/keepsakes.html`): the seven a family gets. One line per template, as in `notes.ts`. */
export const keepsakesTemplates = {
  open_when: template<OpenWhenView, OpenWhenSettings>(OpenWhen, OpenWhenSetup),
  birthday_interview: template<BirthdayInterviewView, BirthdayInterviewSettings>(BirthdayInterview, BirthdayInterviewSetup),
  said: template<SaidView, SaidSettings>(Said),
  same_spot: template<SameSpotView, SameSpotSettings>(SameSpot),
  stories: template<StoriesView, StoriesSettings>(Stories, StoriesSetup),
  good_jar: template<GoodJarView, GoodJarSettings>(GoodJar),
  doorframe: template<DoorframeView, DoorframeSettings>(Doorframe),
} satisfies Partial<Record<Template, AnyBuiltTemplate>>;
