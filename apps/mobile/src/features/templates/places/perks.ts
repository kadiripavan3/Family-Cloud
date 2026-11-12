import type { Template } from '@/api/generated/homeport';

import type { AnyBuiltTemplate } from '../types';

/**
 * Fair and fun (16): the templates that do work drawn in `design/hub/src/screens/perks.html`. One line per template, as
 * in `notes.ts`: its code, the types of its view and settings, its screen. Only this place's builder
 * changes this file ("Adding a template" in apps/mobile/README.md).
 */
export const perksTemplates = {} satisfies Partial<Record<Template, AnyBuiltTemplate>>;
