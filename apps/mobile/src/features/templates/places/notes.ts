import type { ChoreWheelSettings, ChoreWheelView, MealPlanSettings, MealPlanView, Template, TimeCapsuleSettings, TimeCapsuleView } from '@/api/generated/homeport';

import { ChoreWheel } from '../chore-wheel/ChoreWheel';
import { MealPlan } from '../meal-plan/MealPlan';
import { TimeCapsule } from '../time-capsule/TimeCapsule';
import { TimeCapsuleSetup } from '../time-capsule/TimeCapsuleSetup';
import { type AnyBuiltTemplate, template } from '../types';

/**
 * Notes' own templates that do work (`design/hub/src/screens/notes.html`). One line per template: its code,
 * the types of its view and settings, its screen, and what it asks before it starts when it asks anything.
 */
export const notesTemplates = {
  meal_plan: template<MealPlanView, MealPlanSettings>(MealPlan),
  chore_wheel: template<ChoreWheelView, ChoreWheelSettings>(ChoreWheel),
  time_capsule: template<TimeCapsuleView, TimeCapsuleSettings>(TimeCapsule, TimeCapsuleSetup),
} satisfies Partial<Record<Template, AnyBuiltTemplate>>;
