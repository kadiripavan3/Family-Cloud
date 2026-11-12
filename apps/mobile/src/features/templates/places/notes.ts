import type { MealPlanSettings, MealPlanView, Template } from '@/api/generated/homeport';

import { MealPlan } from '../meal-plan/MealPlan';
import { type AnyBuiltTemplate, template } from '../types';

/**
 * Notes' own templates that do work (`design/hub/src/screens/notes.html`). One line per template: its code,
 * the types of its view and settings, its screen, and what it asks before it starts when it asks anything.
 */
export const notesTemplates = {
  meal_plan: template<MealPlanView, MealPlanSettings>(MealPlan),
} satisfies Partial<Record<Template, AnyBuiltTemplate>>;
