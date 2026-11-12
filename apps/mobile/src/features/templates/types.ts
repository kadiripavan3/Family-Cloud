import type { ReactNode } from 'react';

import type { BoardResponse, CircleResponse } from '@/api/generated/homeport';

/**
 * A board whose `view` and `settings` are one template's own. The API sends every board in the same
 * envelope (`BoardResponse`), and which records are inside follows from `template`; the map in
 * `templates.ts` says which, one line per template.
 */
export type Board<View, Settings = Record<string, never>> = Omit<BoardResponse, 'view' | 'settings'> & { view: View; settings: Settings };

/** What a template's screen is given: the board, as this person sees it today. */
export type BoardScreenProps<View, Settings = Record<string, never>> = { board: Board<View, Settings> };

/** What a template's own questions come to: the board's name, when it gets one of its own, and what the template needs to begin. */
export type Start = { title?: string; settings?: Record<string, unknown> };

/**
 * What a template asks before it starts, when it needs something to begin (who the letters are for, the day
 * a capsule opens). It is drawn inside the gallery's sheet, above the Start button, and says what it has
 * with `onChange`: the settings to send, or null while something is still missing.
 */
export type SetupProps = { circle: CircleResponse; onChange: (start: Start | null) => void };

/** One template that does work, as the app knows it: its screen, and what it asks before it starts. */
export type BuiltTemplate<View, Settings> = {
  Screen: (props: BoardScreenProps<View, Settings>) => ReactNode;
  Setup?: (props: SetupProps) => ReactNode;
};

/**
 * One line of the map: `meal_plan: template<MealPlanView, MealPlanSettings>(MealPlan)`. The two types are
 * the template's records in the API's description (`x-board-templates` names them), and the screen has to
 * take exactly those.
 */
export function template<View, Settings = Record<string, never>>(Screen: (props: BoardScreenProps<View, Settings>) => ReactNode, Setup?: (props: SetupProps) => ReactNode): BuiltTemplate<View, Settings> {
  return { Screen, Setup };
}

/** Any line of the map, whatever its types: what the map as a whole is checked against. */
export type AnyBuiltTemplate = BuiltTemplate<never, never>;
