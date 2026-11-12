import type {
  AwardsSettings,
  AwardsViewResponse,
  DictionarySettings,
  DictionaryViewResponse,
  FindDateSettings,
  FindDateViewResponse,
  PredictionsSettings,
  PredictionsViewResponse,
  SecretSantaSettings,
  SecretSantaViewResponse,
  Template,
  WalkTogetherSettings,
  WalkTogetherViewResponse,
  WhereNextSettings,
  WhereNextViewResponse,
} from '@/api/generated/homeport';
import { Awards } from '@/features/crew/awards/Awards';
import { Dictionary } from '@/features/crew/dictionary/Dictionary';
import { FindDate } from '@/features/crew/find-date/FindDate';
import { FindDateSetup } from '@/features/crew/find-date/FindDateSetup';
import { Predictions } from '@/features/crew/predictions/Predictions';
import { PredictionsSetup } from '@/features/crew/predictions/PredictionsSetup';
import { SecretSanta } from '@/features/crew/secret-santa/SecretSanta';
import { WalkTogether } from '@/features/crew/walk-together/WalkTogether';
import { WalkTogetherSetup } from '@/features/crew/walk-together/WalkTogetherSetup';
import { WhereNext } from '@/features/crew/where-next/WhereNext';
import { WhereNextSetup } from '@/features/crew/where-next/WhereNextSetup';

import { type AnyBuiltTemplate, template } from '../types';

/**
 * Friends (19): the templates that do work drawn in `design/hub/src/screens/crew.html`. One line per template, as
 * in `notes.ts`: its code, the types of its view and settings, its screen, and what it asks before it starts.
 * Only this place's builder changes this file ("Adding a template" in apps/mobile/README.md).
 */
export const crewTemplates = {
  find_date: template<FindDateViewResponse, FindDateSettings>(FindDate, FindDateSetup),
  secret_santa: template<SecretSantaViewResponse, SecretSantaSettings>(SecretSanta),
  where_next: template<WhereNextViewResponse, WhereNextSettings>(WhereNext, WhereNextSetup),
  dictionary: template<DictionaryViewResponse, DictionarySettings>(Dictionary),
  predictions: template<PredictionsViewResponse, PredictionsSettings>(Predictions, PredictionsSetup),
  awards: template<AwardsViewResponse, AwardsSettings>(Awards),
  walk_together: template<WalkTogetherViewResponse, WalkTogetherSettings>(WalkTogether, WalkTogetherSetup),
} satisfies Partial<Record<Template, AnyBuiltTemplate>>;
