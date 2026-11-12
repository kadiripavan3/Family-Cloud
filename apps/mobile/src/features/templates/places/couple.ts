import type {
  AnniversaryResponse,
  AnniversarySettings,
  BothYesResponse,
  BothYesSettings,
  FairShareResponse,
  FairShareSettings,
  MysteryDateResponse,
  MysteryDateSettings,
  OurStoryResponse,
  OurStorySettings,
  Template,
  TuckedNotesResponse,
  TuckedNotesSettings,
} from '@/api/generated/homeport';
import { Anniversary } from '@/features/couple/anniversary/Anniversary';
import { AnniversarySetup } from '@/features/couple/anniversary/AnniversarySetup';
import { BothYes } from '@/features/couple/both-yes/BothYes';
import { FairShare } from '@/features/couple/fair-share/FairShare';
import { MysteryDate } from '@/features/couple/mystery-date/MysteryDate';
import { OurStory } from '@/features/couple/our-story/OurStory';
import { Tucked } from '@/features/couple/tucked/Tucked';

import { type AnyBuiltTemplate, template } from '../types';

/**
 * Couples (17): the templates that do work drawn in `design/hub/src/screens/couple.html`. One line per template, as
 * in `notes.ts`: its code, the types of its view and settings, its screen. Only this place's builder
 * changes this file ("Adding a template" in apps/mobile/README.md).
 */
export const coupleTemplates = {
  our_story: template<OurStoryResponse, OurStorySettings>(OurStory),
  tucked_notes: template<TuckedNotesResponse, TuckedNotesSettings>(Tucked),
  anniversary: template<AnniversaryResponse, AnniversarySettings>(Anniversary, AnniversarySetup),
  mystery_date: template<MysteryDateResponse, MysteryDateSettings>(MysteryDate),
  both_yes: template<BothYesResponse, BothYesSettings>(BothYes),
  fair_share: template<FairShareResponse, FairShareSettings>(FairShare),
} satisfies Partial<Record<Template, AnyBuiltTemplate>>;
