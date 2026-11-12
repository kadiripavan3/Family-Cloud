import type {
  FairerSplitSettings,
  FairerSplitViewResponse,
  GuestBookSettings,
  GuestBookViewResponse,
  HeadsUpSettings,
  HeadsUpViewResponse,
  HeardSettings,
  HeardViewResponse,
  KittySettings,
  KittyViewResponse,
  LivedHereSettings,
  LivedHereViewResponse,
  Template,
} from '@/api/generated/homeport';
import { FairerSplit } from '@/features/flat/fairer-split/FairerSplit';
import { GuestBook } from '@/features/flat/guest-book/GuestBook';
import { HeadsUp } from '@/features/flat/heads-up/HeadsUp';
import { Heard } from '@/features/flat/heard/Heard';
import { Kitty } from '@/features/flat/kitty/Kitty';
import { LivedHere } from '@/features/flat/lived-here/LivedHere';

import { type AnyBuiltTemplate, template } from '../types';

/**
 * Housemates (18): the templates that do work drawn in `design/hub/src/screens/flat.html`. One line per template, as
 * in `notes.ts`: its code, the types of its view and settings, its screen. Only this place's builder
 * changes this file ("Adding a template" in apps/mobile/README.md).
 */
export const flatTemplates = {
  kitty: template<KittyViewResponse, KittySettings>(Kitty),
  fairer_split: template<FairerSplitViewResponse, FairerSplitSettings>(FairerSplit),
  heads_up: template<HeadsUpViewResponse, HeadsUpSettings>(HeadsUp),
  heard: template<HeardViewResponse, HeardSettings>(Heard),
  guest_book: template<GuestBookViewResponse, GuestBookSettings>(GuestBook),
  lived_here: template<LivedHereViewResponse, LivedHereSettings>(LivedHere),
} satisfies Partial<Record<Template, AnyBuiltTemplate>>;
