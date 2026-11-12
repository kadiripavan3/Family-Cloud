import type { ComponentType } from 'react';

import type { BoardResponse, Template } from '@/api/generated/homeport';

import { coupleTemplates } from './places/couple';
import { crewTemplates } from './places/crew';
import { flatTemplates } from './places/flat';
import { keepsakesTemplates } from './places/keepsakes';
import { notesTemplates } from './places/notes';
import { perksTemplates } from './places/perks';
import type { AnyBuiltTemplate, BuiltTemplate, SetupProps } from './types';

/**
 * Every template that does work and has a screen, by the code the API gives it. This is the typing map:
 * each line pairs a code with the types of its view and its settings (the records `x-board-templates` in
 * the API's description names) and with the screen that takes them.
 *
 * The lines live in one file per place under `places/` (Notes' own, Keepsakes, Fair and fun, a couple's, a
 * flat's, a crew's), so two builders never change the same file. A template that is not here yet opens as
 * "arrives with the next update" (`BoardScreen`), and its card in the gallery still starts it.
 */
export const TEMPLATES = {
  ...notesTemplates,
  ...keepsakesTemplates,
  ...perksTemplates,
  ...coupleTemplates,
  ...flatTemplates,
  ...crewTemplates,
} satisfies Partial<Record<Template, AnyBuiltTemplate>>;

/** The codes of the templates that have a screen. */
export type BuiltCode = keyof typeof TEMPLATES;

/** The two records of one line of the map. */
type Records<Built> = Built extends BuiltTemplate<infer View, infer Settings> ? { view: View; settings: Settings } : never;

/** A template's view, by its code: `ViewOf<'meal_plan'>` is `MealPlanView`. */
export type ViewOf<Code extends BuiltCode> = Records<(typeof TEMPLATES)[Code]>['view'];

/** A template's settings, by its code. */
export type SettingsOf<Code extends BuiltCode> = Records<(typeof TEMPLATES)[Code]>['settings'];

const BUILT: Partial<Record<string, AnyBuiltTemplate>> = TEMPLATES;

/**
 * Each template's screen, by its code, taking a board as the API sends it. This is the one place that says
 * "a board whose template is `meal_plan` holds a `MealPlanView`": the API sends every board in the same
 * envelope, and which records are inside follows from its `template`.
 */
export const SCREENS: Partial<Record<string, ComponentType<{ board: BoardResponse }>>> = Object.fromEntries(
  Object.entries(BUILT).map(([code, built]) => [code, built!.Screen as unknown as ComponentType<{ board: BoardResponse }>]),
);

/** What each template asks before it starts, by its code. A template that starts as it is (or has no screen yet) is not in here. */
export const SETUPS: Partial<Record<string, ComponentType<SetupProps>>> = Object.fromEntries(
  Object.entries(BUILT)
    .filter(([, built]) => built!.Setup)
    .map(([code, built]) => [code, built!.Setup!]),
);
